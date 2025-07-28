/**
 * Process the next queued job by sending it to comfyui-runpod-worker /process endpoint
 */
export default defineEventHandler(async (_event) => {
  try {
    // Use the job processing service instead of duplicating logic
    const { processNextJob } = await import('~/server/services/jobProcessingService')
    const result = await processNextJob()
    
    if (!result.success) {
      return result
    }
    
    return result
    
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