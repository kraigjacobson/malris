/**
 * POST /api/jobs/processing/prioritize
 *
 * Push job(s) to the FRONT of the in-memory priority queue. The continuous
 * picker checks this list before its normal scope-based ordering. Stale or
 * out-of-scope ids are pruned lazily by the picker.
 *
 * Body: { job_ids: string[] }
 * Returns: { success, queue: string[], added: number, skipped: number }
 */
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { logger } from '~/server/utils/logger'
import { prioritizeJobs } from '~/server/services/jobProcessingService'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event).catch(() => ({}))
    const incoming: string[] = Array.isArray(body?.job_ids) ? body.job_ids.filter((x: any) => typeof x === 'string' && x.length > 0) : []

    if (incoming.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'job_ids must be a non-empty array of job UUIDs'
      })
    }

    // Validate: only allow prioritizing jobs that are currently 'queued'.
    const db = getDb()
    const rows = await db
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .where(inArray(jobs.id, incoming))

    const validIds = rows.filter(r => r.status === 'queued').map(r => r.id)
    const skipped = incoming.length - validIds.length

    if (validIds.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'None of the requested jobs are currently in status=queued'
      })
    }

    const queue = prioritizeJobs(validIds)
    logger.info(`⭐ Prioritized ${validIds.length} job(s); queue depth now ${queue.length}`)

    return {
      success: true,
      queue,
      added: validIds.length,
      skipped,
      message: `Prioritized ${validIds.length} job${validIds.length === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} not queued, skipped)` : ''}`
    }
  } catch (error: any) {
    logger.error('❌ Error in prioritize endpoint:', error)
    if (error?.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to prioritize jobs'
    })
  }
})
