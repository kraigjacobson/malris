/**
 * Continuous Job Processing Endpoint
 * Starts continuous processing that runs jobs one after another
 */

import { startContinuousProcessing } from '~/server/services/jobProcessingService'

export default defineEventHandler(async (_event) => {
  try {
    const result = startContinuousProcessing()
    
    return {
      success: result.success,
      message: result.message,
      processing_enabled: true
    }
    
  } catch (error: any) {
    console.error('❌ Continuous processing failed to start:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Continuous processing failed: ${error.message || 'Unknown error'}`
    })
  }
})