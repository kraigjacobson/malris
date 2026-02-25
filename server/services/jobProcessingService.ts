/**
 * Unified Job Processing Service
 * Handles single job processing, continuous processing, and queue management
 * Prevents duplicate job submissions and manages processing state
 */

import { getDb } from '~/server/utils/database'
import { jobs, subjects, mediaRecords } from '~/server/utils/schema'
import { eq, desc, sql, and } from 'drizzle-orm'
import { updateAutoProcessingStatus, getCurrentStatus, checkWorkerHealth, broadcastToClients } from './systemStatusManager'
import { logger } from '~/server/utils/logger'

// Continuous processing flag
// When true, server will automatically process next job after current job finishes
// When false, server will stop after current job finishes
let continuousMode = false
let processingInterval: NodeJS.Timeout | null = null
let isCurrentlyProcessing = false // Global lock to prevent concurrent processing
const PROCESSING_INTERVAL = 5000 // 5 seconds between checks in continuous mode

// Preferred source type for job processing
// 'all': Process any job type (test jobs prioritized, then video jobs)
// 'source': Prefer test jobs (sourceMediaUuid IS NULL), fallback to video jobs if none available
// 'vid': Prefer video jobs (sourceMediaUuid IS NOT NULL), fallback to test jobs if none available
let preferredSourceType: 'all' | 'source' | 'vid' = 'all'

// Helper to broadcast processing state changes to WebSocket clients
function broadcastProcessingStateChange() {
  broadcastToClients({
    type: 'processing_state_change',
    data: {
      mode: continuousMode ? 'continuous' : 'single',
      isActive: true,
      isContinuous: continuousMode,
      sourceType: preferredSourceType
    },
    timestamp: new Date().toISOString()
  })
  logger.info(`📢 [PROCESSING] Broadcasted state change: continuousMode=${continuousMode}, sourceType=${preferredSourceType}`)
}

export interface ProcessNextJobResult {
  success: boolean
  message: string
  job_id?: string
  status?: string
  worker_response?: any
  active_job_id?: string
  skip?: boolean
  noJobsRemaining?: boolean // Signals continuous mode should stop (no jobs of any type)
  usedFallback?: boolean // Indicates we processed a different type than preferred
  actualType?: 'source' | 'vid' // What type was actually processed
}

// Function to get current processing status
export function getProcessingStatus() {
  return {
    mode: continuousMode ? 'continuous' : 'single',
    isActive: true,
    isContinuous: continuousMode,
    sourceType: preferredSourceType
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
      message: 'Another job is already being processed - preventing duplicate submission',
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
        message: 'ComfyUI worker is not healthy',
        skip: true
      }
    }

    if (!realTimeHealth.available) {
      return {
        success: false,
        message: 'ComfyUI worker queue is busy',
        skip: true
      }
    }

    logger.info(`✅ ComfyUI worker is healthy and idle - proceeding with job processing (preferredSourceType: ${preferredSourceType})`)

    // Check counts of queued jobs with and without source media uuid
    const [testJobCount, videoJobCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NULL`)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NOT NULL`))
    ])

    const testCount = testJobCount[0]?.count || 0
    const videoCount = videoJobCount[0]?.count || 0

    // If no jobs of any type, return appropriate status
    if (testCount === 0 && videoCount === 0) {
      // In continuous mode, signal that we should stop
      if (continuousMode) {
        logger.info('⏹️ No queued jobs of any type - signaling continuous mode to stop')
        return {
          success: false,
          message: 'No queued jobs found - stopping continuous processing',
          skip: true,
          noJobsRemaining: true
        }
      }
      return {
        success: false,
        message: 'No queued jobs found',
        skip: true
      }
    }

    let queuedJobs
    let usedFallback = false
    let actualType: 'source' | 'vid' | undefined

    // Determine which job type to process based on preferredSourceType
    if (preferredSourceType === 'source') {
      // Prefer source jobs (test), fallback to video jobs
      if (testCount > 0) {
        logger.info(`📋 Processing source job (${testCount} available)`)
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
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NULL`))
          .orderBy(desc(jobs.updatedAt))
          .limit(1)
        actualType = 'source'
      } else if (videoCount > 0) {
        logger.info(`🔄 No source jobs available, falling back to video job (${videoCount} available)`)
        usedFallback = true
        const orderBy = sql`RANDOM()`
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
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NOT NULL`))
          .orderBy(orderBy)
          .limit(1)
        actualType = 'vid'
      }
    } else if (preferredSourceType === 'vid') {
      // Prefer video jobs, fallback to source jobs
      if (videoCount > 0) {
        logger.info(`🎥 Processing video job (${videoCount} available)`)
        const orderBy = sql`RANDOM()`
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
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NOT NULL`))
          .orderBy(orderBy)
          .limit(1)
        actualType = 'vid'
      } else if (testCount > 0) {
        logger.info(`🔄 No video jobs available, falling back to source job (${testCount} available)`)
        usedFallback = true
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
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NULL`))
          .orderBy(desc(jobs.updatedAt))
          .limit(1)
        actualType = 'source'
      }
    } else {
      // 'all' mode - original behavior (prioritize test jobs, then video jobs)
      if (testCount > 0) {
        logger.info(`📋 Processing source job (${testCount} available, ${videoCount} video jobs also available)`)
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
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NULL`))
          .orderBy(desc(jobs.updatedAt))
          .limit(1)
        actualType = 'source'
      } else if (videoCount > 0) {
        logger.info(`🎥 Processing video job (${videoCount} available)`)
        const orderBy = sql`RANDOM()`
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
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NOT NULL`))
          .orderBy(orderBy)
          .limit(1)
        actualType = 'vid'
      }
    }

    if (!queuedJobs || queuedJobs.length === 0) {
      return {
        success: false,
        message: 'No suitable jobs found',
        skip: true
      }
    }

    const job = queuedJobs[0]
    logger.info(`🚀 Processing job ${job.id} in ${continuousMode ? 'continuous' : 'single'} mode`)

    // Get subject and media data for the job
    const [subjectData, destMediaData, sourceMediaData] = await Promise.all([db.select().from(subjects).where(eq(subjects.id, job.subjectUuid)).limit(1), job.destMediaUuid ? db.select().from(mediaRecords).where(eq(mediaRecords.uuid, job.destMediaUuid)).limit(1) : Promise.resolve([]), job.sourceMediaUuid ? db.select().from(mediaRecords).where(eq(mediaRecords.uuid, job.sourceMediaUuid)).limit(1) : Promise.resolve([])])

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
    const params = (job.parameters as any) || {}
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
          .where(and(eq(mediaRecords.subjectUuid, job.subjectUuid), eq(mediaRecords.purpose, 'source'), eq(mediaRecords.type, 'image')))
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
      const currentActiveJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, 'active'))

      // Get the job IDs that will be marked as failed for cleanup
      const jobsToFail = currentActiveJobs

      // Delete output media records for jobs that will be marked as failed
      if (jobsToFail.length > 0) {
        const { mediaRecords } = await import('~/server/utils/schema')
        const jobIdsToClean = jobsToFail.map(j => j.id)

        for (const jobId of jobIdsToClean) {
          try {
            const deletedMedia = await db
              .delete(mediaRecords)
              .where(and(eq(mediaRecords.jobId, jobId), eq(mediaRecords.purpose, 'output')))
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

      // Broadcast job counts update to WebSocket clients
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
        message: `Job ${job.id} sent to comfyui-runpod-worker for processing`,
        usedFallback,
        actualType
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
export async function startSingleJob(sourceType: 'all' | 'source' | 'vid' = 'all') {
  // Set to single mode (turn off continuous)
  continuousMode = false
  preferredSourceType = sourceType
  broadcastProcessingStateChange() // Broadcast to WebSocket clients

  logger.info(`▶️ Starting single job processing (sourceType: ${sourceType}) - waiting 10 seconds before checking if idle...`)

  // Update status manager
  updateAutoProcessingStatus('enabled', `Single job processing started (${sourceType}) - waiting 10 seconds`, false)

  try {
    // Wait 10 seconds first
    await new Promise(resolve => setTimeout(resolve, 10000))
    logger.info('⏰ 10 seconds elapsed, now checking if ComfyUI is idle...')

    // Now check if we can process
    const result = await processNextJob()

    updateAutoProcessingStatus('disabled', 'Single job processing completed', false)

    return result
  } catch (error: any) {
    updateAutoProcessingStatus('disabled', 'Single job processing failed', false)
    throw error
  }
}

// Function to start continuous processing
export function startContinuousProcessing(sourceType: 'all' | 'source' | 'vid' = 'all') {
  if (continuousMode) {
    logger.warn(`⚠️ [DEBUG] Cannot start continuous processing - continuousMode is already enabled`)
    return { success: false, message: 'Continuous processing is already active' }
  }

  if (processingInterval) {
    logger.warn('⚠️ [DEBUG] Processing interval already exists, clearing it')
    clearInterval(processingInterval)
  }

  continuousMode = true
  preferredSourceType = sourceType
  broadcastProcessingStateChange() // Broadcast to WebSocket clients
  logger.info(`🔄 Starting continuous job processing (sourceType: ${sourceType})...`)

  // Update status manager
  updateAutoProcessingStatus('enabled', `Continuous processing is running (${sourceType})`, true)

  // Set up interval for continuous processing with better logging
  processingInterval = setInterval(async () => {
    if (continuousMode) {
      try {
        // CRITICAL FIX: Check for active jobs BEFORE calling processNextJob
        // This prevents the race condition where we mark active jobs as failed
        const db = getDb()
        const activeJobCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(jobs)
          .where(eq(jobs.status, 'active'))

        const activeCount = activeJobCount[0]?.count || 0

        logger.info(`🔍 [DEBUG] Active job count: ${activeCount}`)

        if (activeCount > 0) {
          // Skip this cycle - there are still active jobs running
          logger.info(`🕐 [DEBUG] Continuous processing: Waiting for ${activeCount} active job(s) to complete`)
          return
        }

        const result = await processNextJob()
        logger.info(`🔍 [DEBUG] processNextJob() returned:`, { success: result.success, message: result.message })

        // Check if we should stop continuous processing due to no jobs remaining
        if (result.noJobsRemaining) {
          logger.info('⏹️ Continuous processing: No jobs remaining - auto-stopping')
          continuousMode = false
          if (processingInterval) {
            clearInterval(processingInterval)
            processingInterval = null
          }
          updateAutoProcessingStatus('disabled', 'Continuous processing stopped - no jobs remaining', false)
          broadcastProcessingStateChange()
          return
        }

        // Log fallback usage
        if (result.usedFallback) {
          logger.info(`🔄 Continuous processing: Used fallback - processed ${result.actualType} job instead of preferred type`)
        }

        // Only log when something interesting happens (not when skipping for idle wait)
        if (result.success) {
          logger.info('🔄 Continuous processing: Job started successfully -', result.message)
        } else if (!('skip' in result && result.skip)) {
          logger.info('🔄 Continuous processing: Failed -', result.message)
        } else if (result.message.includes('waiting') || result.message.includes('busy')) {
          // Log idle waiting less frequently to avoid spam
          if (Math.random() < 0.1) {
            // 10% chance to log waiting messages
            logger.info('🕐 Continuous processing:', result.message)
          }
        }
      } catch (error: any) {
        logger.error('❌ Continuous processing error:', error.message)
      }
    }
  }, PROCESSING_INTERVAL)

  return { success: true, message: 'Continuous processing started' }
}

// Function to stop all processing and interrupt running jobs
export async function stopAllProcessing() {
  const wasActive = continuousMode

  // Stop any processing - set to single mode (turn off continuous)
  continuousMode = false
  preferredSourceType = 'all' // Reset to default
  broadcastProcessingStateChange() // Broadcast to WebSocket clients
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
