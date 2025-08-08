/**
 * Unified Job Processing Service
 * Handles single job processing, continuous processing, and queue management
 * Prevents duplicate job submissions and manages processing state
 */

import { getDb } from '~/server/utils/database'
import { jobs, subjects, mediaRecords } from '~/server/utils/schema'
import { eq, desc, sql, and } from 'drizzle-orm'
import { updateAutoProcessingStatus, getCurrentStatus, checkWorkerHealth } from './systemStatusManager'
import { logger } from '~/server/utils/logger'

// Processing states
type ProcessingMode = 'idle' | 'single' | 'continuous'
let currentMode: ProcessingMode = 'idle'
let processingInterval: NodeJS.Timeout | null = null
let isCurrentlyProcessing = false // Global lock to prevent concurrent processing
const PROCESSING_INTERVAL = 5000 // 5 seconds between checks in continuous mode

export interface ProcessNextJobResult {
  success: boolean
  message: string
  job_id?: string
  status?: string
  worker_response?: any
  active_job_id?: string
  skip?: boolean
}

// Function to get current processing status
export function getProcessingStatus() {
  return {
    mode: currentMode,
    isActive: currentMode !== 'idle',
    isContinuous: currentMode === 'continuous',
    // Legacy compatibility
    processing_enabled: currentMode !== 'idle'
  }
}

// Function to get cached worker health (for backward compatibility)
export function getCachedWorkerHealth() {
  const systemStatus = getCurrentStatus()
  return {
    healthy: systemStatus.runpodWorker.status === 'healthy' && systemStatus.comfyui.status === 'healthy',
    available: systemStatus.comfyuiProcessing.status === 'idle',
    status: systemStatus.systemHealth === 'healthy' ? 'healthy' : 'unhealthy',
    message: systemStatus.systemHealth === 'healthy' ? 'All systems operational' : 'System issues detected',
    timestamp: systemStatus.timestamp,
    queue_remaining: systemStatus.comfyuiProcessing.queuedJobs,
    running_jobs_count: systemStatus.comfyuiProcessing.runningJobs
  }
}


// We're now importing checkWorkerHealth from systemStatusManager.ts
// The zombie cleanup is handled by marking all other active jobs as failed

export async function processNextJob(): Promise<ProcessNextJobResult> {
  // CRITICAL FIX: Global processing lock prevents concurrent job processing from ANY source
  // (auto-processing, manual endpoint, etc.)
  if (isCurrentlyProcessing) {
    return {
      success: false,
      message: "Another job is already being processed - preventing duplicate submission",
      skip: true
    }
  }
  
  isCurrentlyProcessing = true
  
  try {
    const db = getDb()
    
    // Real-time health check
    const realTimeHealth = await checkWorkerHealth()
    if (!realTimeHealth.healthy) {
      return {
        success: false,
        message: "ComfyUI worker is not healthy",
        skip: true
      }
    }
    
    if (!realTimeHealth.available) {
      return {
        success: false,
        message: "ComfyUI worker queue is busy",
        skip: true
      }
    }
    
    logger.info('✅ ComfyUI worker is healthy and idle - proceeding with job processing')
    
    // Check counts of queued jobs with and without source media uuid
    const [testJobCount, videoJobCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), sql`${jobs.sourceMediaUuid} IS NULL`)),
      db.select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), sql`${jobs.sourceMediaUuid} IS NOT NULL`))
    ])
    
    const testCount = testJobCount[0]?.count || 0
    const videoCount = videoJobCount[0]?.count || 0
    
    if (testCount === 0 && videoCount === 0) {
      return {
        success: false,
        message: "No queued jobs found",
        skip: true
      }
    }
    
    let queuedJobs
    
    if (testCount > 0) {
      // Prioritize test jobs (without source media uuid) - use original logic
      queuedJobs = await db
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
        .where(and(eq(jobs.status, 'queued'), sql`${jobs.sourceMediaUuid} IS NULL`))
        .orderBy(desc(jobs.updatedAt))
        .limit(1)
    } else if (videoCount > 0) {
      // No test jobs available, get the most recent updated_at queued vid job
      logger.info(`📅 No test jobs available, selecting most recent updated_at video job from ${videoCount} available`)
      const orderBy = sql`RANDOM()`
      // const orderBy = desc(jobs.updatedAt)
      queuedJobs = await db
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
        .where(and(eq(jobs.status, 'queued'), sql`${jobs.sourceMediaUuid} IS NOT NULL`))
        .orderBy(orderBy)
        .limit(1)
    }
    
    if (!queuedJobs || queuedJobs.length === 0) {
      return {
        success: false,
        message: "No suitable jobs found",
        skip: true
      }
    }
    
    const job = queuedJobs[0]
    logger.info(`🚀 Processing job ${job.id} in ${currentMode} mode`)
    
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
    formData.append('job_type', 'vid_faceswap')
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
        
        // Extract video duration from destination video metadata for progress tracking
        if (destMediaData.length > 0 && destMediaData[0].duration) {
          formData.append('video_duration', destMediaData[0].duration.toString())
          logger.info(`📊 Added video duration to form data: ${destMediaData[0].duration}s`)
        } else {
          logger.info(`⚠️ No duration found in destination video metadata for ${job.destMediaUuid}`)
        }
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
          .orderBy(mediaRecords.createdAt)
        
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
          // Also pass the UUID and created_at timestamp for output linking
          formData.append(`subject_image_uuid_${i}`, sourceImage.uuid)
          formData.append(`subject_image_created_at_${i}`, sourceImage.createdAt.toISOString())
        }
        formData.append('subject_image_count', subjectSourceImages.length.toString())
      }
      
      // Get worker URL - use Docker network service name and internal port
      const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
      
      // Send job to comfyui-runpod-worker
      logger.info(`🚀 Sending job ${job.id} to comfyui-runpod-worker at ${workerUrl}/process`)
      
      const workerResponse = await fetch(`${workerUrl}/process`, {
        method: 'POST',
        body: formData
      })
      
      if (!workerResponse.ok) {
        const errorText = await workerResponse.text()
        throw new Error(`Worker responded with ${workerResponse.status}: ${errorText}`)
      }
      
      const workerResult = await workerResponse.json()
      logger.info('✅ Worker response:', workerResult)
      
      // STRICT SOLUTION: Only allow 1 active job at a time
      // Mark all other active jobs as failed before starting the new one
      
      // First, get all currently active jobs to mark them as failed
      const currentActiveJobs = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.status, 'active'))
      
      // Get the job IDs that will be marked as failed for cleanup
      const jobsToFail = currentActiveJobs
      
      // Delete output media records for jobs that will be marked as failed
      if (jobsToFail.length > 0) {
        const { mediaRecords } = await import('~/server/utils/schema')
        const jobIdsToClean = jobsToFail.map(j => j.id)
        
        for (const jobId of jobIdsToClean) {
          try {
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
              logger.info(`🗑️ Cleaned up ${deletedMedia.length} output media records for failed job ${jobId}`)
            }
          } catch (cleanupError) {
            logger.error(`⚠️ Failed to clean up media records for job ${jobId}:`, cleanupError)
          }
        }
      }
      
      // Mark ALL currently active jobs as failed since we only allow 1 active job
      let affectedRows = 0
      if (jobsToFail.length > 0) {
        const result = await db
          .update(jobs)
          .set({
            status: 'failed',
            sourceMediaUuid: null, // Clear sourceMediaUuid so failed jobs become test workflows when requeued
            updatedAt: new Date(),
            errorMessage: 'Job marked as failed - only 1 active job allowed at a time'
          })
          .where(eq(jobs.status, 'active'))
        
        affectedRows = result.rowCount || 0
        logger.info(`🧹 Marked ${affectedRows} active jobs as failed to enforce single active job limit`)
      } else {
        logger.info(`✅ No active jobs found - proceeding with new job`)
      }
      
      // Now update the current job to active status
      await db
        .update(jobs)
        .set({
          status: 'active',
          startedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(jobs.id, job.id))
      
      // Update job counts for WebSocket clients after status changes
      try {
        const { updateJobCounts } = await import('./systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        logger.error('Failed to update job counts after job status changes:', error)
      }
      
      // Job status is already set to active in our cleanup code above
      
      // We no longer need the immediate health check since we've proactively handled potential zombies
      
      return {
        success: true,
        job_id: job.id,
        status: 'active',
        worker_response: workerResult,
        message: `Job ${job.id} sent to comfyui-runpod-worker for processing`
      }
      
    } catch (workerError: any) {
      logger.error('❌ Failed to send job to worker:', workerError)
      
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
      
      // Update job counts for WebSocket clients after status change
      try {
        const { updateJobCounts } = await import('./systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        logger.error('Failed to update job counts after job failure:', error)
      }
      
      // CRITICAL FIX: Return failure result instead of throwing error
      // This allows continuous processing to continue without crashing
      return {
        success: false,
        job_id: job.id,
        status: 'failed',
        message: `Job ${job.id} failed to send to worker: ${workerError.message}`
      }
    }
    
  } catch (error: any) {
    logger.error('❌ Failed to process next job:', error)
    throw new Error(`Failed to process next job: ${error.message || 'Unknown error'}`)
  } finally {
    // Always reset the processing flag
    isCurrentlyProcessing = false
  }
}

// Function to start single job processing with 10-second wait
export async function startSingleJob() {
  if (currentMode !== 'idle') {
    return { success: false, message: "Processing is already active" }
  }
  
  currentMode = 'single'
  logger.info('▶️ Starting single job processing - waiting 10 seconds before checking if idle...')
  
  // Update status manager
  updateAutoProcessingStatus('enabled', 'Single job processing started - waiting 10 seconds', false)
  
  try {
    // Wait 10 seconds first
    await new Promise(resolve => setTimeout(resolve, 10000))
    logger.info('⏰ 10 seconds elapsed, now checking if ComfyUI is idle...')
    
    // Now check if we can process
    const result = await processNextJob()
    
    // After single job completes, return to idle
    currentMode = 'idle'
    updateAutoProcessingStatus('disabled', 'Single job processing completed', false)
    
    return result
  } catch (error: any) {
    currentMode = 'idle'
    updateAutoProcessingStatus('disabled', 'Single job processing failed', false)
    throw error
  }
}

// Function to start continuous processing
export function startContinuousProcessing() {
  if (currentMode !== 'idle') {
    return { success: false, message: "Processing is already active" }
  }
  
  if (processingInterval) {
    clearInterval(processingInterval)
  }
  
  currentMode = 'continuous'
  logger.info('🔄 Starting continuous job processing...')
  
  // Update status manager
  updateAutoProcessingStatus('enabled', 'Continuous processing is running', true)
  
  // Set up interval for continuous processing with better logging
  processingInterval = setInterval(async () => {
    if (currentMode === 'continuous') {
      try {
        // CRITICAL FIX: Check for active jobs BEFORE calling processNextJob
        // This prevents the race condition where we mark active jobs as failed
        const db = getDb()
        const activeJobCount = await db.select({ count: sql<number>`count(*)` })
          .from(jobs)
          .where(eq(jobs.status, 'active'))
        
        const activeCount = activeJobCount[0]?.count || 0
        
        if (activeCount > 0) {
          // Skip this cycle - there are still active jobs running
          // Log occasionally to show we're still monitoring
          if (Math.random() < 0.05) { // 5% chance to log waiting messages
            logger.info(`🕐 Continuous processing: Waiting for ${activeCount} active job(s) to complete`)
          }
          return
        }
        
        const result = await processNextJob()
        // Only log when something interesting happens (not when skipping for idle wait)
        if (result.success) {
          logger.info('🔄 Continuous processing: Job started successfully -', result.message)
        } else if (!('skip' in result && result.skip)) {
          logger.info('🔄 Continuous processing: Failed -', result.message)
        } else if (result.message.includes('waiting') || result.message.includes('busy')) {
          // Log idle waiting less frequently to avoid spam
          if (Math.random() < 0.1) { // 10% chance to log waiting messages
            logger.info('🕐 Continuous processing:', result.message)
          }
        }
      } catch (error: any) {
        logger.error('❌ Continuous processing error:', error.message)
      }
    }
  }, PROCESSING_INTERVAL)
  
  return { success: true, message: "Continuous processing started" }
}

// Function to stop all processing and interrupt running jobs
export async function stopAllProcessing() {
  const wasActive = currentMode !== 'idle'
  
  // Stop any processing
  currentMode = 'idle'
  isCurrentlyProcessing = false
  
  if (processingInterval) {
    clearInterval(processingInterval)
    processingInterval = null
  }
  
  logger.info('⏹️ Stopping all job processing and interrupting running jobs...')
  
  // Update status manager
  updateAutoProcessingStatus('disabled', 'All processing stopped by user', false)
  
  // Send interrupt to ComfyUI to kill running jobs
  try {
    const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
    logger.info('🛑 Sending interrupt request to ComfyUI worker...')
    
    const interruptResponse = await fetch(`${workerUrl}/interrupt`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    
    if (!interruptResponse.ok) {
      throw new Error(`ComfyUI interrupt request failed: ${interruptResponse.status}`)
    }
    
    logger.info('✅ Successfully stopped all processing and interrupted running jobs')
    return {
      success: true,
      message: 'All processing stopped and running jobs interrupted',
      wasActive
    }
  } catch (error: any) {
    logger.error('❌ Failed to interrupt ComfyUI jobs:', error)
    return {
      success: true, // Still consider it success since we stopped our processing
      message: `Processing stopped but failed to interrupt ComfyUI: ${error.message}`,
      wasActive
    }
  }
}