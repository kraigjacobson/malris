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
    const rawLimit = body.job_limit
    const jobLimit = typeof rawLimit === 'number' && rawLimit > 0 ? Math.floor(rawLimit) : null

    const result = startContinuousProcessing(sourceType, jobLimit)

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