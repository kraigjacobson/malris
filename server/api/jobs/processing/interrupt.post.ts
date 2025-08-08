/**
 * Interrupt current job processing
 * Sends interrupt signal to ComfyUI worker to stop current job
 */
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (_event) => {
  try {
    logger.info('🛑 Stop all processing request received')
    
    // Use the unified job processing service to stop everything
    const { stopAllProcessing } = await import('~/server/services/jobProcessingService')
    const result = await stopAllProcessing()
    
    return result
    
  } catch (error: any) {
    logger.error('❌ Failed to send interrupt to ComfyUI:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to interrupt job: ${error.message || 'Unknown error'}`
    })
  }
})