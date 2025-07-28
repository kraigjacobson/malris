/**
 * Job Processing Service - Internal service for job processing logic
 * This service contains the actual business logic that can be used by both API endpoints and internal functions
 */

import { getDb } from '~/server/utils/database'
import { jobs, subjects, mediaRecords } from '~/server/utils/schema'
import { eq, desc, sql, and, ne } from 'drizzle-orm'

export interface ProcessNextJobResult {
  success: boolean
  message: string
  job_id?: string
  status?: string
  worker_response?: any
  active_job_id?: string
  skip?: boolean
}

export async function processNextJob(): Promise<ProcessNextJobResult> {
  try {
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
        active_job_id: activeJobs[0].id,
        skip: true
      }
    }
    
    // Find queued jobs, prioritizing those without a source media uuid (null values first)
    const queuedJobs = await db
      .select({
        id: jobs.id,
        jobType: jobs.jobType,
        subjectUuid: jobs.subjectUuid,
        destMediaUuid: jobs.destMediaUuid,
        sourceMediaUuid: jobs.sourceMediaUuid,
        parameters: jobs.parameters,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt
      })
      .from(jobs)
      .where(eq(jobs.status, 'queued'))
      .orderBy(
        // First priority: jobs without source media uuid (null values first)
        sql`CASE WHEN ${jobs.sourceMediaUuid} IS NULL THEN 0 ELSE 1 END`,
        // Second priority: latest updated jobs first
        desc(jobs.updatedAt)
      )
      .limit(1)
    
    if (queuedJobs.length === 0) {
      return {
        success: false,
        message: "No queued jobs found",
        skip: true
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
          message: `ComfyUI worker is not healthy: ${workerHealth.message}`,
          skip: true
        }
      }
      
      if (!workerHealth.available) {
        return {
          success: false,
          message: `ComfyUI worker queue is busy: ${workerHealth.running_jobs_count} running, ${workerHealth.queue_remaining} pending`,
          skip: true
        }
      }
      
      console.log('✅ ComfyUI worker is healthy and queue is empty - proceeding with job processing')
      
    } catch (healthError: any) {
      return {
        success: false,
        message: `Failed to check ComfyUI worker health: ${healthError.message}`,
        skip: true
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
      throw new Error(`Subject not found for job ${job.id}`)
    }
    
    if (job.destMediaUuid && destMediaData.length === 0) {
      throw new Error(`Destination media not found for job ${job.id}`)
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
      // Use internal media service to get file data instead of HTTP calls
      const { getMediaFileData } = await import('./mediaService')
      
      // Download and attach destination video
      if (job.destMediaUuid) {
        const destVideoData = await getMediaFileData(job.destMediaUuid)
        if (!destVideoData) {
          throw new Error(`Failed to get destination video data for ${job.destMediaUuid}`)
        }
        const destVideoBlob = new Blob([destVideoData.buffer])
        formData.append('dest_video', destVideoBlob, `dest_${job.destMediaUuid}.mp4`)
      }
      
      // Download and attach source image if available
      if (job.sourceMediaUuid && sourceMediaData.length > 0) {
        const sourceImageData = await getMediaFileData(job.sourceMediaUuid)
        if (!sourceImageData) {
          throw new Error(`Failed to get source image data for ${job.sourceMediaUuid}`)
        }
        const sourceImageBlob = new Blob([sourceImageData.buffer])
        formData.append('source_image', sourceImageBlob, `source_${job.sourceMediaUuid}.jpg`)
      } else {
        // For test workflow, we need all subject source images
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
          const sourceImageData = await getMediaFileData(sourceImage.uuid)
          if (!sourceImageData) {
            throw new Error(`Failed to get subject source image data for ${sourceImage.uuid}`)
          }
          const sourceImageBlob = new Blob([sourceImageData.buffer])
          formData.append(`subject_image_${i}`, sourceImageBlob, `subject_${sourceImage.uuid}.jpg`)
          // Also pass the UUID for output linking
          formData.append(`subject_image_uuid_${i}`, sourceImage.uuid)
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
      
      // Set job status to failed on worker error (don't retry automatically)
      await db
        .update(jobs)
        .set({
          status: 'failed',
          startedAt: null,
          updatedAt: new Date(),
          errorMessage: `Failed to send to worker: ${workerError.message}`
        })
        .where(eq(jobs.id, job.id))
      
      throw new Error(`Failed to send job to worker: ${workerError.message}`)
    }
    
  } catch (error: any) {
    console.error('❌ Failed to process next job:', error)
    throw new Error(`Failed to process next job: ${error.message || 'Unknown error'}`)
  }
}