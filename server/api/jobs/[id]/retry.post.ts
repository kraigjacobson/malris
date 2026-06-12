import { logger } from '~/server/utils/logger'
import { resetJobToQueued } from '~/server/utils/jobReset'

export default defineEventHandler(async (event) => {
  try {
    const jobId = getRouterParam(event, 'id')

    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required'
      })
    }

    logger.info(`Retrying job ${jobId}...`)

    const result = await resetJobToQueued(jobId, {
      allowedStatuses: ['canceled', 'failed', 'completed', 'need_input']
    })

    logger.info(`Successfully reset job ${jobId} to queued status`)

    return {
      success: true,
      job_id: result.id,
      job_type: result.jobType,
      status: result.status,
      updated_at: result.updatedAt,
      deleted_media_count: result.deletedMediaCount,
      message: `Job ${jobId} has been reset to queued status. Deleted ${result.deletedMediaCount} output media records.`
    }

  } catch (error: any) {
    logger.error('Error retrying job:', error)

    if (error.cause?.code === 'ECONNREFUSED') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Media Server API is not available. Please ensure the service is running.'
      })
    }

    if (error.cause?.code === 'ETIMEDOUT') {
      throw createError({
        statusCode: 504,
        statusMessage: 'Request to Media Server API timed out. The service may be overloaded.'
      })
    }

    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to retry job: ${error.message || 'Unknown error'}`
    })
  }
})
