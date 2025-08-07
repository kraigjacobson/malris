import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    // Get job ID from route parameters
    const jobId = getRouterParam(event, 'id')
    
    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required'
      })
    }

    // Check if this is a prefixed tagging job ID - these are not stored in the jobs table
    if (jobId.startsWith('tag_')) {
      // For tagging jobs, just return success since they don't need progress tracking
      return {
        success: true,
        message: 'Tagging job progress update ignored (not stored in database)'
      }
    }

    // Get request body
    const body = await readBody(event)
    
    if (!body || typeof body.progress !== 'number') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Progress value is required and must be a number'
      })
    }

    // Validate progress range
    const progress = Math.max(0, Math.min(100, Math.round(body.progress)))

    const db = getDb()

    // Update job progress
    const updatedJob = await db
      .update(jobs)
      .set({
        progress: progress,
        updatedAt: new Date()
      })
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        progress: jobs.progress,
        status: jobs.status,
        updatedAt: jobs.updatedAt
      })

    if (updatedJob.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    // Update job counts to refresh frontend queue status (for consistency)
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      console.error('❌ Failed to update job counts after progress update:', error)
    }

    return {
      success: true,
      job: updatedJob[0],
      message: `Job progress updated to ${progress}%`
    }

  } catch (error: any) {
    console.error('Error updating job progress:', error)
    
    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update job progress: ${error.message || 'Unknown error'}`
    })
  }
})