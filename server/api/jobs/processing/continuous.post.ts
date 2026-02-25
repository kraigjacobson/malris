/**
 * Continuous Job Processing Endpoint
 * Starts continuous processing that runs jobs one after another
 */
import { logger } from '~/server/utils/logger'
import { startContinuousProcessing } from '~/server/services/jobProcessingService'

export default defineEventHandler(async (event) => {
  try {
    // Read body to get optional source_type parameter
    const body = await readBody(event).catch(() => ({}))
    const sourceType = body.source_type || 'all'

    const result = startContinuousProcessing(sourceType)

    return {
      success: result.success,
      message: result.message,
      processing_enabled: true
    }

  } catch (error: any) {
    logger.error('❌ Continuous processing failed to start:', error)

    throw createError({
      statusCode: 500,
      statusMessage: `Continuous processing failed: ${error.message || 'Unknown error'}`
    })
  }
})