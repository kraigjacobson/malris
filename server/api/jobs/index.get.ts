import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { count, eq } from 'drizzle-orm'

export default defineEventHandler(async (_event) => {
  try {
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

    // Get current processing status directly from the toggle module
    let processingEnabled = false
    try {
      // Simply import and get the processing status directly - no HTTP calls needed!
      const { getProcessingStatus } = await import('~/server/api/jobs/processing/toggle.post')
      processingEnabled = getProcessingStatus()
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

    return queueStatus

  } catch (error: any) {
    console.error('❌ [API] Error fetching queue status from database:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch queue status: ${error.message || 'Unknown error'}`
    })
  }
})