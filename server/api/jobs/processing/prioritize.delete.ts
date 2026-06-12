/**
 * DELETE /api/jobs/processing/prioritize
 *
 * Remove job(s) from the in-memory priority queue.
 * Body: { job_ids: string[] }
 * Returns: { success, queue: string[], removed: number }
 */
import { logger } from '~/server/utils/logger'
import { dePrioritizeJobs, getPriorityQueue } from '~/server/services/jobProcessingService'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event).catch(() => ({}))
    const incoming: string[] = Array.isArray(body?.job_ids) ? body.job_ids.filter((x: any) => typeof x === 'string') : []

    if (incoming.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'job_ids must be a non-empty array of job UUIDs'
      })
    }

    const before = getPriorityQueue()
    const queue = dePrioritizeJobs(incoming)
    const removed = before.length - queue.length

    logger.info(`🗑️ De-prioritized ${removed} job(s); queue depth now ${queue.length}`)

    return {
      success: true,
      queue,
      removed,
      message: `Removed ${removed} job${removed === 1 ? '' : 's'} from priority queue`
    }
  } catch (error: any) {
    logger.error('❌ Error in de-prioritize endpoint:', error)
    if (error?.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to de-prioritize jobs'
    })
  }
})
