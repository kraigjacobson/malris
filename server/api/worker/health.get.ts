/**
 * Get cached ComfyUI worker health status
 * This endpoint returns the cached health data that's updated by the job processing system
 * to avoid duplicate health check calls to the worker
 */
export default defineEventHandler(async (_event) => {
  try {
    // Import the cached health getter from the job processing service
    const { getCachedWorkerHealth } = await import('~/server/services/jobProcessingService')
    
    // Return the cached health status
    return getCachedWorkerHealth()
    
  } catch (error: any) {
    // Fallback if cache is not available
    return {
      healthy: false,
      available: false,
      status: 'error',
      message: `Failed to get cached health status: ${error.message}`,
      timestamp: new Date().toISOString(),
      queue_remaining: 0,
      running_jobs_count: 0
    }
  }
})