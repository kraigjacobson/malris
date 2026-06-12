/**
 * Force restart all workers
 * Stops processing and tells each worker to restart its container (evicts loaded models).
 * Use the regular interrupt endpoint instead if you want to keep models in VRAM.
 */
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (_event) => {
  try {
    logger.info('⚡ Force restart workers request received')

    const { stopAllProcessing } = await import('~/server/services/jobProcessingService')
    const result = await stopAllProcessing({ forceRestart: true })

    return result

  } catch (error: any) {
    logger.error('❌ Failed to force restart workers:', error)

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to force restart workers: ${error.message || 'Unknown error'}`
    })
  }
})
