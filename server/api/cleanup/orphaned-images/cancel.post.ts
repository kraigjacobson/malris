import { logger } from '~/server/utils/logger'
import { requestCancel } from './start.post'

export default defineEventHandler(async _event => {
  try {
    requestCancel()
    logger.info('Cleanup cancellation requested')

    return {
      success: true,
      message: 'Cleanup cancellation requested'
    }
  } catch (error) {
    logger.error('Error canceling cleanup:', error)
    throw error
  }
})
