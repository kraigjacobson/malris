export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'id')
  
  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Job ID is required'
    })
  }

  try {
    console.log(`🛑 Canceling job ${jobId} via Drizzle ORM...`)

    // Use Drizzle ORM instead of raw SQL
    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()

    // First check if job exists and can be canceled
    const existingJob = await db.select({
      id: jobs.id,
      status: jobs.status
    }).from(jobs).where(eq(jobs.id, jobId)).limit(1)
    
    if (existingJob.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    const job = existingJob[0]
    
    // Check if job can be canceled (only queued, active, or need_input jobs can be canceled)
    if (!['queued', 'active', 'need_input'].includes(job.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot cancel job with status: ${job.status}. Only queued, active, or need_input jobs can be canceled.`
      })
    }

    // If job is currently active, try to interrupt ALL jobs via rp_handler
    if (job.status === 'active') {
      console.log(`🛑 Canceling active job ${jobId} - attempting to interrupt ALL jobs via rp_handler`)
      
      try {
        // Use rp_handler interrupt endpoint - use Docker network service name and internal port
        const rpHandlerUrl = process.env.RP_HANDLER_URL || process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
        
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
          console.log(`✅ Successfully interrupted ALL jobs via rp_handler:`, result)
        } else {
          const errorText = await response.text()
          console.log(`⚠️ rp_handler interrupt response: ${response.status} ${response.statusText} - ${errorText}`)
        }
      } catch (error: any) {
        console.log(`⚠️ Error interrupting ALL jobs via rp_handler: ${error.message}`)
        // Continue with cancellation even if interrupt fails
      }
    }

    // Delete all output purpose media records associated with this job
    const { mediaRecords } = await import('~/server/utils/schema')
    const { and } = await import('drizzle-orm')
    
    console.log(`🗑️ Deleting output media records for job ${jobId}...`)
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
      console.log(`✅ Deleted ${deletedMedia.length} output media records:`, deletedMedia.map(m => m.filename))
    } else {
      console.log(`ℹ️ No output media records found for job ${jobId}`)
    }

    // Update job status to canceled
    const canceledJob = await db.update(jobs)
      .set({
        status: 'canceled',
        errorMessage: 'Job canceled by user',
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
    console.log(`✅ Successfully canceled job ${jobId}:`, canceled)

    // Update job counts for WebSocket clients
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      console.error('Failed to update job counts after job cancellation:', error)
    }

    // FIXED: After canceling a job, check if processing is enabled before trying to start the next job
    // This ensures we respect the paused state and only process when the user wants it
    try {
      const { getProcessingStatus } = await import('~/server/api/jobs/processing/toggle.post')
      const isProcessingEnabled = getProcessingStatus()
      
      if (isProcessingEnabled) {
        console.log('🔄 Processing is enabled - attempting to start next job after cancellation')
        const { processNextJob } = await import('~/server/services/jobProcessingService')
        const nextJobResult = await processNextJob()
        
        if (nextJobResult.success) {
          console.log(`🚀 Successfully started next job after cancellation: ${nextJobResult.job_id}`)
        } else if (!nextJobResult.skip) {
          console.log(`⚠️ Failed to start next job after cancellation: ${nextJobResult.message}`)
        }
        // If skip=true, it means no jobs in queue or worker busy, which is fine
      } else {
        console.log('⏸️ Processing is paused - not starting next job after cancellation')
      }
    } catch (nextJobError: any) {
      console.log(`⚠️ Error trying to process next job after cancellation: ${nextJobError.message}`)
      // Don't fail the cancellation if next job processing fails
    }

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
    console.error('Failed to cancel job:', error)
    
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