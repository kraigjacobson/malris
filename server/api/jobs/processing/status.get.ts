/**
 * Get current job processing status
 */
import { logger } from '~/server/utils/logger'
import { getProcessingStatus } from '~/server/services/jobProcessingService'

export default defineEventHandler(async (_event) => {
  try {
    // Get processing status directly from the service
    const status = getProcessingStatus()
    
    return {
      success: true,
      processing_enabled: status.isActive,
      mode: status.mode,
      isActive: status.isActive,
      isContinuous: status.isContinuous
    }
    
  } catch (error: any) {
    logger.error('❌ Failed to get processing status:', error)
    
    return {
      success: false,
      processing_enabled: false,
      error: error.message || 'Unknown error'
    }
  }
})