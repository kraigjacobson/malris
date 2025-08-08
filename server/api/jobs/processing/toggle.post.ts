/**
 * Get processing status endpoint
 * Returns current processing mode and state
 */
import { logger } from '~/server/utils/logger'

import { getProcessingStatus } from '~/server/services/jobProcessingService'

export default defineEventHandler(async (_event) => {
  try {
    const status = getProcessingStatus()
    
    return {
      success: true,
      mode: status.mode,
      isActive: status.isActive,
      isContinuous: status.isContinuous,
      // Legacy compatibility
      processing_enabled: status.isActive
    }
    
  } catch (error: any) {
    logger.error('❌ Failed to get processing status:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to get processing status: ${error.message || 'Unknown error'}`
    })
  }
})