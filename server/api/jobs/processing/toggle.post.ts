/**
 * Toggle job processing on/off on the server side
 * When disabled, cancels any active jobs and puts them back to queued
 */

// Global processing state
let isProcessingEnabled = true // Start enabled by default
let processingInterval: NodeJS.Timeout | null = null
const PROCESSING_INTERVAL = 3000 // 3 seconds
let isCurrentlyProcessing = false // Prevent concurrent processing

// Cached worker health status
const cachedWorkerHealth = {
  healthy: false,
  available: false,
  status: 'unknown',
  message: 'Health check not performed yet',
  timestamp: new Date().toISOString(),
  queue_remaining: 0,
  running_jobs_count: 0
}

// Function to get cached worker health (for API endpoint)
export function getCachedWorkerHealth() {
  return { ...cachedWorkerHealth }
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
      console.log(`⚠️ Worker health check failed: ${response.status}`)
      // Update cache with error status
      Object.assign(cachedWorkerHealth, {
        healthy: false,
        available: false,
        status: 'error',
        message: `Worker responded with ${response.status}`,
        timestamp: new Date().toISOString(),
        queue_remaining: 0,
        running_jobs_count: 0
      })
      return { healthy: false, available: false }
    }
    
    const healthData = await response.json()
    const isHealthy = healthData.status === 'healthy'
    
    // Use the correct fields from active_jobs instead of the wrong queue_remaining/running_jobs_count
    const actualRunningCount = healthData.active_jobs?.running_count || 0
    const actualPendingCount = healthData.active_jobs?.pending_count || 0
    const isAvailable = actualRunningCount === 0 && actualPendingCount === 0
    
    // Update cache with fresh data
    Object.assign(cachedWorkerHealth, {
      healthy: isHealthy,
      available: isAvailable,
      status: healthData.status,
      message: healthData.message,
      timestamp: new Date().toISOString(),
      queue_remaining: actualPendingCount,
      running_jobs_count: actualRunningCount
    })
    
    if (!isHealthy) {
      console.log(`🚨 Worker is unhealthy: ${healthData.message || 'Unknown issue'}`)
    } else if (!isAvailable) {
      console.log(`🔄 Worker busy: ${actualRunningCount} running, ${actualPendingCount} queued`)
    }
    
    return {
      healthy: isHealthy,
      available: isAvailable,
      healthData
    }
  } catch (error: any) {
    console.log(`⚠️ Worker health check failed: ${error.message}`)
    // Update cache with error status
    Object.assign(cachedWorkerHealth, {
      healthy: false,
      available: false,
      status: 'error',
      message: `Health check failed: ${error.message}`,
      timestamp: new Date().toISOString(),
      queue_remaining: 0,
      running_jobs_count: 0
    })
    return { healthy: false, available: false }
  }
}

// Function to recover stuck active jobs when worker is unhealthy
async function recoverStuckJobs() {
  try {
    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()
    
    // Check worker health
    const { healthy } = await checkWorkerHealth()
    
    if (!healthy) {
      // Find active jobs that might be stuck
      const activeJobs = await db
        .select({ id: jobs.id, startedAt: jobs.startedAt })
        .from(jobs)
        .where(eq(jobs.status, 'active'))
      
      if (activeJobs.length > 0) {
        console.log(`🔧 Worker unhealthy - recovering ${activeJobs.length} stuck active job(s)`)
        
        // Reset all active jobs back to queued
        await db
          .update(jobs)
          .set({
            status: 'queued',
            startedAt: null,
            updatedAt: new Date(),
            errorMessage: 'Job recovered due to worker health issues'
          })
          .where(eq(jobs.status, 'active'))
        
        console.log(`✅ Recovered ${activeJobs.length} stuck jobs back to queued`)
        return { recovered: activeJobs.length }
      }
    }
    
    return { recovered: 0 }
  } catch (error: any) {
    console.error('❌ Failed to recover stuck jobs:', error)
    return { recovered: 0 }
  }
}

// Function to process next job
async function processNextJobInternal() {
  // Prevent concurrent processing
  if (isCurrentlyProcessing) {
    return { success: false, message: "Already processing a job", skip: true }
  }
  
  isCurrentlyProcessing = true
  
  try {
    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()
    
    // First, try to recover any stuck jobs if worker is unhealthy
    await recoverStuckJobs()
    
    // Check if there are any active jobs in database
    const activeJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, 'active'))
      .limit(1)
    
    if (activeJobs.length > 0) {
      // Another job is already active, skip silently
      return { success: false, message: "Job already active in database", skip: true }
    }
    
    // Check if ComfyUI worker is healthy and available (real-time check)
    const { healthy, available } = await checkWorkerHealth()
    if (!healthy) {
      return { success: false, message: "ComfyUI worker is unhealthy", skip: true }
    }
    if (!available) {
      return { success: false, message: "ComfyUI worker is busy", skip: true }
    }
    
    // Double-check worker availability immediately before processing
    const doubleCheckHealth = await checkWorkerHealth()
    if (!doubleCheckHealth.available) {
      return { success: false, message: "ComfyUI worker became busy during check", skip: true }
    }
    
    // Find the oldest queued job
    const queuedJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, 'queued'))
      .orderBy(jobs.createdAt)
      .limit(1)
    
    if (queuedJobs.length === 0) {
      // No queued jobs, that's fine
      return { success: false, message: "No queued jobs", skip: true }
    }
    
    console.log(`🚀 Worker is healthy and available - proceeding with job processing for job ${queuedJobs[0].id}`)
    
    // Only make the HTTP call when we actually have a job to process
    // This prevents unnecessary calls when conditions aren't met
    const { getComfyApiBaseUrl } = await import('~/server/utils/api-url')
    const baseUrl = getComfyApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/jobs/process-next`, {
      method: 'POST'
    })
    
    const result = await response.json()
    console.log(`✅ Job processing result:`, result.success ? 'SUCCESS' : 'FAILED', result.message)
    return result
    
  } catch (error: any) {
    console.error('❌ Internal job processing failed:', error)
    return { success: false, error: error.message || 'Unknown error' }
  } finally {
    // Always reset the processing flag
    isCurrentlyProcessing = false
  }
}

// Function to start processing interval
function startProcessing() {
  if (processingInterval) {
    clearInterval(processingInterval)
  }
  
  isProcessingEnabled = true
  console.log('▶️ Starting server-side job processing...')
  
  // Process immediately
  processNextJobInternal()
  
  // Set up interval
  processingInterval = setInterval(async () => {
    if (isProcessingEnabled) {
      const result = await processNextJobInternal()
      // Only log when something interesting happens (not when skipping)
      if (result.success || !result.skip) {
        console.log('🔄 Processing result:', result.message || 'Unknown')
      }
    }
  }, PROCESSING_INTERVAL)
}

// Function to stop processing and cancel active jobs
async function stopProcessing() {
  isProcessingEnabled = false
  isCurrentlyProcessing = false // Reset processing flag
  
  if (processingInterval) {
    clearInterval(processingInterval)
    processingInterval = null
  }
  
  console.log('⏸️ Stopping server-side job processing...')
  
  // First, send interrupt request to ComfyUI to stop any running jobs
  try {
    const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
    console.log('🛑 Sending interrupt request to ComfyUI worker...')
    
    const interruptResponse = await fetch(`${workerUrl}/interrupt`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    
    if (interruptResponse.ok) {
      console.log('✅ Successfully sent interrupt request to ComfyUI')
    } else {
      console.log(`⚠️ ComfyUI interrupt request failed: ${interruptResponse.status}`)
    }
  } catch (interruptError: any) {
    console.log(`⚠️ Failed to send interrupt to ComfyUI: ${interruptError.message}`)
  }
  
  // Cancel any active jobs and put them back to queued
  try {
    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()
    
    // Find active jobs
    const activeJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, 'active'))
    
    if (activeJobs.length > 0) {
      console.log(`🔄 Cancelling ${activeJobs.length} active job(s) and putting back to queued...`)
      
      // Update all active jobs back to queued
      await db
        .update(jobs)
        .set({
          status: 'queued',
          startedAt: null,
          updatedAt: new Date(),
          errorMessage: 'Job processing was disabled by user'
        })
        .where(eq(jobs.status, 'active'))
    }
    
  } catch (error) {
    console.error('❌ Failed to cancel active jobs:', error)
  }
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { enabled } = body
    
    if (enabled === true) {
      startProcessing()
      return {
        success: true,
        message: "Job processing started",
        processing_enabled: true
      }
    } else if (enabled === false) {
      await stopProcessing()
      return {
        success: true,
        message: "Job processing stopped and active jobs cancelled",
        processing_enabled: false
      }
    } else {
      // Just return current status
      return {
        success: true,
        processing_enabled: isProcessingEnabled
      }
    }
    
  } catch (error: any) {
    console.error('❌ Failed to toggle processing:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to toggle processing: ${error.message || 'Unknown error'}`
    })
  }
})

// Auto-start processing when the module loads
startProcessing()