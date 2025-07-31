/**
 * Interrupt current job processing
 * Sends interrupt signal to ComfyUI worker to stop current job
 */

export default defineEventHandler(async (_event) => {
  try {
    console.log('🛑 Stop all processing request received')
    
    // Use the unified job processing service to stop everything
    const { stopAllProcessing } = await import('~/server/services/jobProcessingService')
    const result = await stopAllProcessing()
    
    return result
    
  } catch (error: any) {
    console.error('❌ Failed to send interrupt to ComfyUI:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to interrupt job: ${error.message || 'Unknown error'}`
    })
  }
})