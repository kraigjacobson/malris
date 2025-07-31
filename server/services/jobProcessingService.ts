/**
 * Unified Job Processing Service
 * Handles single job processing, continuous processing, and queue management
 * Prevents duplicate job submissions and manages processing state
 */

import { getDb } from '~/server/utils/database'
import { jobs, subjects, mediaRecords } from '~/server/utils/schema'
import { eq, desc, sql, and, ne } from 'drizzle-orm'
import { updateAutoProcessingStatus, getCurrentStatus } from './systemStatusManager'

// Processing states
type ProcessingMode = 'idle' | 'single' | 'continuous'
let currentMode: ProcessingMode = 'idle'
let processingInterval: NodeJS.Timeout | null = null
let isCurrentlyProcessing = false // Global lock to prevent concurrent processing
const PROCESSING_INTERVAL = 10000 // 10 seconds between jobs in continuous mode

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

// Function to check ComfyUI worker health and availability
async function checkWorkerHealth() {
  try {
    const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
    const response = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    
    if (!response.ok) {
      return { healthy: false, available: false }
    }
    
    const healthData = await response.json()
    const isHealthy = healthData.status === 'healthy'
    
    // Use the correct fields from active_jobs
    const actualRunningCount = healthData.active_jobs?.running_count || 0
    const actualPendingCount = healthData.active_jobs?.pending_count || 0
    const isAvailable = actualRunningCount === 0 && actualPendingCount === 0
    
    return {
      healthy: isHealthy,
      available: isAvailable,
      healthData
    }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error: any) {
    return { healthy: false, available: false }
  }
}

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
    
    // Real-time health check instead of relying on cached status
    // This prevents race conditions where multiple calls see stale "idle" status
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
    
    console.log('✅ ComfyUI worker is healthy and queue is empty - proceeding with job processing')
    
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
    
    const job = queuedJobs[0]
    console.log(`🚀 Processing job ${job.id} in ${currentMode} mode`)
    
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
      
      // Update job counts for WebSocket clients after status changes
      try {
        const { updateJobCounts } = await import('./systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        console.error('Failed to update job counts after job status changes:', error)
      }
      
      // Force an immediate health check after sending a job
      setTimeout(async () => {
        await checkWorkerHealth()
      }, 100)
      
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
      
      // Update job counts for WebSocket clients after status change
      try {
        const { updateJobCounts } = await import('./systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        console.error('Failed to update job counts after job failure:', error)
      }
      
      throw new Error(`Failed to send job to worker: ${workerError.message}`)
    }
    
  } catch (error: any) {
    console.error('❌ Failed to process next job:', error)
    throw new Error(`Failed to process next job: ${error.message || 'Unknown error'}`)
  } finally {
    // Always reset the processing flag
    isCurrentlyProcessing = false
  }
}

// Function to start single job processing
export async function startSingleJob() {
  if (currentMode !== 'idle') {
    return { success: false, message: "Processing is already active" }
  }
  
  currentMode = 'single'
  console.log('▶️ Starting single job processing...')
  
  // Update status manager
  updateAutoProcessingStatus('enabled', 'Single job processing started', false)
  
  try {
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
  console.log('🔄 Starting continuous job processing...')
  
  // Update status manager
  updateAutoProcessingStatus('enabled', 'Continuous processing is running', true)
  
  // Set up interval for continuous processing
  processingInterval = setInterval(async () => {
    if (currentMode === 'continuous') {
      const result = await processNextJob()
      // Only log when something interesting happens (not when skipping)
      if (result.success || !('skip' in result && result.skip)) {
        console.log('🔄 Processing result:', ('message' in result ? result.message : 'Unknown'))
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
  
  console.log('⏹️ Stopping all job processing and interrupting running jobs...')
  
  // Update status manager
  updateAutoProcessingStatus('disabled', 'All processing stopped by user', false)
  
  // Send interrupt to ComfyUI to kill running jobs
  try {
    const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
    console.log('🛑 Sending interrupt request to ComfyUI worker...')
    
    const interruptResponse = await fetch(`${workerUrl}/interrupt`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    
    if (!interruptResponse.ok) {
      throw new Error(`ComfyUI interrupt request failed: ${interruptResponse.status}`)
    }
    
    console.log('✅ Successfully stopped all processing and interrupted running jobs')
    return {
      success: true,
      message: 'All processing stopped and running jobs interrupted',
      wasActive
    }
  } catch (error: any) {
    console.error('❌ Failed to interrupt ComfyUI jobs:', error)
    return {
      success: true, // Still consider it success since we stopped our processing
      message: `Processing stopped but failed to interrupt ComfyUI: ${error.message}`,
      wasActive
    }
  }
}