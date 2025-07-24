import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { count, eq } from 'drizzle-orm'

export default defineEventHandler(async (_event) => {
  try {
    console.log('🔄 [API] Starting /api/jobs request...')
    const startTime = Date.now()
    
    const db = getDb()
    
    // Get queue status by counting jobs in different states
    const [
      totalJobs,
      queuedJobs,
      activeJobs,
      completedJobs,
      failedJobs,
      needInputJobs,
      canceledJobs
    ] = await Promise.all([
      db.select({ count: count() }).from(jobs),
      db.select({ count: count() }).from(jobs).where(eq(jobs.status, 'queued')),
      db.select({ count: count() }).from(jobs).where(eq(jobs.status, 'active')),
      db.select({ count: count() }).from(jobs).where(eq(jobs.status, 'completed')),
      db.select({ count: count() }).from(jobs).where(eq(jobs.status, 'failed')),
      db.select({ count: count() }).from(jobs).where(eq(jobs.status, 'need_input')),
      db.select({ count: count() }).from(jobs).where(eq(jobs.status, 'canceled'))
    ])

    // Get current processing status from the toggle endpoint
    let processingEnabled = false
    try {
      const { getComfyApiBaseUrl } = await import('~/server/utils/api-url')
      const baseUrl = getComfyApiBaseUrl()
      const response = await fetch(`${baseUrl}/api/jobs/processing/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}) // Empty body means just return current status
      })
      
      if (response.ok) {
        const result = await response.json()
        processingEnabled = result.processing_enabled || false
      }
    } catch (error) {
      console.warn('⚠️ Failed to get processing status, defaulting to false:', error)
      processingEnabled = false
    }

    const queueStatus = {
      success: true,
      queue: {
        total: totalJobs[0].count,
        queued: queuedJobs[0].count,
        active: activeJobs[0].count,
        completed: completedJobs[0].count,
        failed: failedJobs[0].count,
        need_input: needInputJobs[0].count,
        canceled: canceledJobs[0].count,
        is_paused: !processingEnabled, // Queue is paused when processing is disabled
        is_processing: processingEnabled
      }
    }

    console.log(`✅ [API] Queue status fetched in ${Date.now() - startTime}ms`)
    return queueStatus

  } catch (error: any) {
    console.error('❌ [API] Error fetching queue status from database:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch queue status: ${error.message || 'Unknown error'}`
    })
  }
})