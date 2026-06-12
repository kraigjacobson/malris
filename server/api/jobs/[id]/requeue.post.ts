import { logger } from '~/server/utils/logger'
import { resetJobToQueued } from '~/server/utils/jobReset'

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'id')

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Job ID is required'
    })
  }

  try {
    logger.info(`🔄 Re-queuing failed job ${jobId}...`)

    // Re-queue is failed-only; retry allows the broader set. Same reset otherwise.
    const result = await resetJobToQueued(jobId, { allowedStatuses: ['failed'] })

    logger.info(`✅ Successfully re-queued job ${jobId}`)

    return {
      success: true,
      message: `Job ${jobId} has been re-queued`,
      data: {
        job_id: result.id,
        status: result.status,
        updated_at: result.updatedAt,
        deleted_media_count: result.deletedMediaCount
      }
    }
  } catch (error: any) {
    logger.error('Failed to re-queue job:', error)

    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to re-queue job'
    })
  }
})
