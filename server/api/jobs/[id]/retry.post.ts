import { logger } from '~/server/utils/logger'
export default defineEventHandler(async (event) => {
  try {
    // Get the job ID from the route parameters
    const jobId = getRouterParam(event, 'id')
    
    logger.info('🔍 Debug - jobId from route:', jobId)
    logger.info('🔍 Debug - jobId type:', typeof jobId)
    
    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required'
      })
    }

    logger.info(`Retrying job ${jobId}...`)

    // Use Drizzle ORM for simpler retry logic
    const { getDb } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()

    // First, get the job details
    const existingJob = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)
    
    if (existingJob.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    const job = existingJob[0]

    // Check if the job is in a retryable state (canceled, failed, completed, or need_input)
    if (!['canceled', 'failed', 'completed', 'need_input'].includes(job.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot retry job with status: ${job.status}. Only canceled, failed, completed, or need_input jobs can be retried.`
      })
    }

    logger.info(`Resetting job ${jobId} to queued status and cleaning up output media...`)

    // Reset the job status to queued FIRST, before deleting media
    logger.info('🔍 Debug - About to update job with ID:', jobId)
    logger.info('🔍 Debug - Job ID type before update:', typeof jobId)
    
    const updatedJob = await db.update(jobs)
      .set({
        status: 'queued',
        progress: 0,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        sourceMediaUuid: null,
        outputUuid: null,
        updatedAt: new Date()
      })
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        jobType: jobs.jobType,
        status: jobs.status,
        updatedAt: jobs.updatedAt
      })

    logger.info('🔍 Debug - updatedJob result:', updatedJob)
    logger.info('🔍 Debug - updatedJob length:', updatedJob.length)
    
    if (updatedJob.length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to update job - no rows returned from update operation'
      })
    }

    // Now delete any output media associated with this job (after job update)
    const deletedMedia = await db.delete(mediaRecords)
      .where(eq(mediaRecords.jobId, jobId))
      .returning({ uuid: mediaRecords.uuid })

    logger.info(`Deleted ${deletedMedia.length} output media records for job ${jobId}`)

    logger.info('🔍 Debug - updatedJob result:', updatedJob)
    logger.info('🔍 Debug - updatedJob length:', updatedJob.length)
    
    if (updatedJob.length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to update job - no rows returned from update operation'
      })
    }
    
    const retried = updatedJob[0]
    logger.info('🔍 Debug - retried job:', retried)
    logger.info(`Successfully reset job ${jobId} to queued status`)

    // Update job counts for WebSocket clients after status change
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('Failed to update job counts after job retry:', error)
    }

    return {
      success: true,
      job_id: retried.id,
      job_type: retried.jobType,
      status: retried.status,
      updated_at: retried.updatedAt,
      deleted_media_count: deletedMedia.length,
      message: `Job ${jobId} has been reset to queued status. Deleted ${deletedMedia.length} output media records.`
    }

  } catch (error: any) {
    logger.error('Error retrying job:', error)
    
    // Handle different types of errors
    if (error.cause?.code === 'ECONNREFUSED') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Media Server API is not available. Please ensure the service is running.'
      })
    }
    
    if (error.cause?.code === 'ETIMEDOUT') {
      throw createError({
        statusCode: 504,
        statusMessage: 'Request to Media Server API timed out. The service may be overloaded.'
      })
    }

    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to retry job: ${error.message || 'Unknown error'}`
    })
  }
})