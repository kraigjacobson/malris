import { logger } from '~/server/utils/logger'
export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'id')
  
  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Job ID is required'
    })
  }

  try {
    logger.info(`🛑 Canceling job ${jobId} via Drizzle ORM...`)

    // Use Drizzle ORM instead of raw SQL
    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()

    // First check if job exists and can be canceled
    const existingJob = await db.select({
      id: jobs.id,
      status: jobs.status,
      jobType: jobs.jobType
    }).from(jobs).where(eq(jobs.id, jobId)).limit(1)
    
    if (existingJob.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    const job = existingJob[0]
    
    // Check if job can be canceled (queued, active, need_input, or failed jobs can be canceled)
    if (!['queued', 'active', 'need_input', 'failed'].includes(job.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot cancel job with status: ${job.status}. Only queued, active, need_input, or failed jobs can be canceled.`
      })
    }

    // If job is currently active, try to interrupt ALL jobs via rp_handler
    // (train_lora jobs run on the ktrain trainer instead — its /interrupt
    // SIGTERMs the deepspeed run; checkpoints keep it resumable)
    if (job.status === 'active') {
      logger.info(`🛑 Canceling active job ${jobId} - attempting to interrupt ALL jobs via rp_handler`)

      try {
        // Use rp_handler interrupt endpoint - use Docker network service name and internal port
        const rpHandlerUrl = job.jobType === 'train_lora'
          ? (process.env.TRAINER_URL || 'http://ktrain:8000')
          : (process.env.RP_HANDLER_URL || process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000')
        
        // Send interrupt signal to rp_handler to interrupt ALL jobs and clear the queue
        const response = await fetch(`${rpHandlerUrl}/interrupt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          // Add timeout to prevent hanging
          signal: AbortSignal.timeout(10000) // 10 second timeout
        })
        
        if (response.ok) {
          const result = await response.json()
          logger.info(`✅ Successfully interrupted ALL jobs via rp_handler:`, result)
        } else {
          const errorText = await response.text()
          logger.info(`⚠️ rp_handler interrupt response: ${response.status} ${response.statusText} - ${errorText}`)
        }
      } catch (error: any) {
        logger.info(`⚠️ Error interrupting ALL jobs via rp_handler: ${error.message}`)
        // Continue with cancellation even if interrupt fails
      }
    }

    // Delete all output purpose media records associated with this job
    const { mediaRecords } = await import('~/server/utils/schema')
    const { and } = await import('drizzle-orm')
    
    logger.info(`🗑️ Deleting output media records for job ${jobId}...`)
    const deletedMedia = await db.delete(mediaRecords)
      .where(and(
        eq(mediaRecords.jobId, jobId),
        eq(mediaRecords.purpose, 'output')
      ))
      .returning({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename
      })
    
    if (deletedMedia.length > 0) {
      logger.info(`✅ Deleted ${deletedMedia.length} output media records:`, deletedMedia.map(m => m.filename))
    } else {
      logger.info(`ℹ️ No output media records found for job ${jobId}`)
    }

    // Update job status to canceled and clear sourceMediaUuid to convert back to test workflow
    const canceledJob = await db.update(jobs)
      .set({
        status: 'canceled',
        errorMessage: 'Job canceled by user',
        sourceMediaUuid: null, // FIXED: Clear sourceMediaUuid to convert vid workflows back to test workflows
        progress: 0, // Reset progress
        startedAt: null, // Clear start time
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        status: jobs.status,
        updatedAt: jobs.updatedAt
      })
    
    const canceled = canceledJob[0]
    logger.info(`✅ Successfully canceled job ${jobId}:`, canceled)

    // Update job counts for WebSocket clients
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('Failed to update job counts after job cancellation:', error)
    }

    // Job cancellation complete - no auto-processing of next job
    logger.info(`✅ Job ${jobId} canceled successfully - manual job control enabled`)

    return {
      success: true,
      message: `Job ${jobId} has been cancelled`,
      data: {
        job_id: canceled.id,
        status: canceled.status,
        updated_at: canceled.updatedAt
      }
    }
  } catch (error: any) {
    logger.error('Failed to cancel job:', error)
    
    // Handle different error scenarios
    if (error.status === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }
    
    if (error.status === 400) {
      throw createError({
        statusCode: 400,
        statusMessage: error.data?.detail || 'Job cannot be cancelled'
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to cancel job'
    })
  }
})