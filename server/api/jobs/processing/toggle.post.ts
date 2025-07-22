/**
 * Toggle job processing on/off on the server side
 * When disabled, cancels any active jobs and puts them back to queued
 */

// Global processing state
let isProcessingEnabled = true // Start enabled by default
let processingInterval: NodeJS.Timeout | null = null
const PROCESSING_INTERVAL = 3000 // 3 seconds

// Function to process next job
async function processNextJobInternal() {
  try {
    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()
    
    // Check if there are any active jobs
    const activeJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, 'active'))
      .limit(1)
    
    if (activeJobs.length > 0) {
      // Another job is already active, skip
      return { success: false, message: "Job already active" }
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
      return { success: false, message: "No queued jobs" }
    }
    
    // Call the existing process-next endpoint
    const response = await fetch('http://localhost:3000/api/jobs/process-next', {
      method: 'POST'
    })
    
    const result = await response.json()
    return result
    
  } catch (error: any) {
    console.error('❌ Internal job processing failed:', error)
    return { success: false, error: error.message || 'Unknown error' }
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
  processingInterval = setInterval(() => {
    if (isProcessingEnabled) {
      processNextJobInternal()
    }
  }, PROCESSING_INTERVAL)
}

// Function to stop processing and cancel active jobs
async function stopProcessing() {
  isProcessingEnabled = false
  
  if (processingInterval) {
    clearInterval(processingInterval)
    processingInterval = null
  }
  
  console.log('⏸️ Stopping server-side job processing...')
  
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