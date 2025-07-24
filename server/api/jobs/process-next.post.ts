/**
 * Process the next queued job by sending it to comfyui-runpod-worker /process endpoint
 */
export default defineEventHandler(async (_event) => {
  try {
    const { getDb } = await import('~/server/utils/database')
    const { jobs, subjects, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()
    
    // First, check if there are any active jobs
    const activeJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, 'active'))
      .limit(1)
    
    if (activeJobs.length > 0) {
      return {
        success: false,
        message: "Cannot process new job: another job is already active",
        active_job_id: activeJobs[0].id
      }
    }
    
    // Find the oldest queued job with all required data
    const queuedJobs = await db
      .select({
        id: jobs.id,
        jobType: jobs.jobType,
        subjectUuid: jobs.subjectUuid,
        destMediaUuid: jobs.destMediaUuid,
        sourceMediaUuid: jobs.sourceMediaUuid,
        parameters: jobs.parameters,
        createdAt: jobs.createdAt
      })
      .from(jobs)
      .where(eq(jobs.status, 'queued'))
      .orderBy(jobs.createdAt)
      .limit(1)
    
    if (queuedJobs.length === 0) {
      return {
        success: false,
        message: "No queued jobs found"
      }
    }
    
    // Check ComfyUI worker health and queue status using existing health check
    try {
      // Import the health check function from the toggle module
      const { getCachedWorkerHealth } = await import('~/server/api/jobs/processing/toggle.post')
      const workerHealth = getCachedWorkerHealth()
      
      // Only proceed if worker is healthy and completely available (queue = 0)
      if (!workerHealth.healthy) {
        return {
          success: false,
          message: `ComfyUI worker is not healthy: ${workerHealth.message}`
        }
      }
      
      if (!workerHealth.available) {
        return {
          success: false,
          message: `ComfyUI worker queue is busy: ${workerHealth.running_jobs_count} running, ${workerHealth.queue_remaining} pending`
        }
      }
      
      console.log('✅ ComfyUI worker is healthy and queue is empty - proceeding with job processing')
      
    } catch (healthError: any) {
      return {
        success: false,
        message: `Failed to check ComfyUI worker health: ${healthError.message}`
      }
    }
    
    const job = queuedJobs[0]
    
    // Get subject and media data for the job
    const [subjectData, destMediaData, sourceMediaData] = await Promise.all([
      db.select().from(subjects).where(eq(subjects.id, job.subjectUuid)).limit(1),
      job.destMediaUuid ? db.select().from(mediaRecords).where(eq(mediaRecords.uuid, job.destMediaUuid)).limit(1) : Promise.resolve([]),
      job.sourceMediaUuid ?
        db.select().from(mediaRecords).where(eq(mediaRecords.uuid, job.sourceMediaUuid)).limit(1) :
        Promise.resolve([])
    ])
    
    if (subjectData.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: `Subject not found for job ${job.id}`
      })
    }
    
    if (job.destMediaUuid && destMediaData.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: `Destination media not found for job ${job.id}`
      })
    }
    
    // Prepare form data for comfyui-runpod-worker /process endpoint
    const formData = new FormData()
    
    // Basic job information
    formData.append('job_id', job.id)
    formData.append('job_type', job.jobType)
    formData.append('workflow_type', job.sourceMediaUuid ? 'vid' : 'test')
    formData.append('workflow_file', 'vid_faceswap_api.json')
    
    // Parameters with proper typing
    const params = job.parameters as any || {}
    formData.append('frames_per_batch', (params.frames_per_batch || 15).toString())
    formData.append('skip_seconds', (params.skip_seconds || 0).toString())
    formData.append('video_filename', params.video_filename || 'output')
    
    // Add media UUIDs for reference
    formData.append('subject_uuid', job.subjectUuid)
    if (job.destMediaUuid) {
      formData.append('dest_media_uuid', job.destMediaUuid)
    }
    if (job.sourceMediaUuid) {
      formData.append('source_media_uuid', job.sourceMediaUuid)
    }
    
    try {
      // Get the correct API base URL for the current environment
      const { getComfyApiBaseUrl } = await import('~/server/utils/api-url')
      const baseUrl = getComfyApiBaseUrl()
      
      // Download and attach destination video using Nuxt backend
      if (job.destMediaUuid) {
        const destVideoResponse = await fetch(`${baseUrl}/api/media/${job.destMediaUuid}/download`)
        if (!destVideoResponse.ok) {
          throw new Error(`Failed to download destination video: ${destVideoResponse.statusText}`)
        }
        const destVideoBlob = await destVideoResponse.blob()
        formData.append('dest_video', destVideoBlob, `dest_${job.destMediaUuid}.mp4`)
      }
      
      // Download and attach source image if available
      if (job.sourceMediaUuid && sourceMediaData.length > 0) {
        const sourceImageResponse = await fetch(`${baseUrl}/api/media/${job.sourceMediaUuid}/download`)
        if (!sourceImageResponse.ok) {
          throw new Error(`Failed to download source image: ${sourceImageResponse.statusText}`)
        }
        const sourceImageBlob = await sourceImageResponse.blob()
        formData.append('source_image', sourceImageBlob, `source_${job.sourceMediaUuid}.jpg`)
      } else {
        // For test workflow, we need all subject source images
        const { and } = await import('drizzle-orm')
        const subjectSourceImages = await db
          .select()
          .from(mediaRecords)
          .where(and(
            eq(mediaRecords.subjectUuid, job.subjectUuid),
            eq(mediaRecords.purpose, 'source'),
            eq(mediaRecords.type, 'image')
          ))
        
        if (subjectSourceImages.length === 0) {
          throw new Error(`No source images found for subject ${job.subjectUuid}`)
        }
        
        // Download and attach all source images for the subject
        for (let i = 0; i < subjectSourceImages.length; i++) {
          const sourceImage = subjectSourceImages[i]
          const sourceImageResponse = await fetch(`${baseUrl}/api/media/${sourceImage.uuid}/download`)
          if (!sourceImageResponse.ok) {
            throw new Error(`Failed to download subject source image ${sourceImage.uuid}: ${sourceImageResponse.statusText}`)
          }
          const sourceImageBlob = await sourceImageResponse.blob()
          formData.append(`subject_image_${i}`, sourceImageBlob, `subject_${sourceImage.uuid}.jpg`)
        }
        formData.append('subject_image_count', subjectSourceImages.length.toString())
      }
      
      // Get worker URL - use Docker network service name and internal port
      const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
      
      // Send job to comfyui-runpod-worker
      console.log(`🚀 Sending job ${job.id} to comfyui-runpod-worker at ${workerUrl}/process`)
      
      const workerResponse = await fetch(`${workerUrl}/process`, {
        method: 'POST',
        body: formData
      })
      
      if (!workerResponse.ok) {
        const errorText = await workerResponse.text()
        throw new Error(`Worker responded with ${workerResponse.status}: ${errorText}`)
      }
      
      const workerResult = await workerResponse.json()
      console.log('✅ Worker response:', workerResult)
      
      // Now that we got success from worker, reset any other active jobs back to queued
      const { ne, and } = await import('drizzle-orm')
      await db
        .update(jobs)
        .set({
          status: 'queued',
          startedAt: null,
          updatedAt: new Date()
        })
        .where(and(eq(jobs.status, 'active'), ne(jobs.id, job.id)))
      
      // Update our job status to active
      await db
        .update(jobs)
        .set({
          status: 'active',
          startedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(jobs.id, job.id))
      
      return {
        success: true,
        job_id: job.id,
        status: 'active',
        worker_response: workerResult,
        message: `Job ${job.id} sent to comfyui-runpod-worker for processing`
      }
      
    } catch (workerError: any) {
      console.error('❌ Failed to send job to worker:', workerError)
      
      // Revert job status back to queued on worker error
      await db
        .update(jobs)
        .set({
          status: 'queued',
          startedAt: null,
          updatedAt: new Date(),
          errorMessage: `Failed to send to worker: ${workerError.message}`
        })
        .where(eq(jobs.id, job.id))
      
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to send job to worker: ${workerError.message}`
      })
    }
    
  } catch (error: any) {
    console.error('❌ Failed to process next job:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to process next job: ${error.message || 'Unknown error'}`
    })
  }
})