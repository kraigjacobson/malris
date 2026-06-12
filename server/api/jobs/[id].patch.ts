import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const jobId = getRouterParam(event, 'id')

    if (!jobId) {
      throw createError({ statusCode: 400, statusMessage: 'Job ID is required' })
    }

    // Tagging jobs are not stored in the jobs table; no-op so the worker's
    // progress pings don't 404.
    if (jobId.startsWith('tag_')) {
      return { success: true, message: 'Tagging job progress update ignored (not stored in database)' }
    }

    const body = await readBody(event)
    if (!body || typeof body !== 'object') {
      throw createError({ statusCode: 400, statusMessage: 'Body is required' })
    }

    const db = getDb()
    if (typeof body.progress !== 'number') {
      throw createError({ statusCode: 400, statusMessage: 'progress (number) is required' })
    }

    const updates = {
      updatedAt: new Date(),
      progress: Math.max(0, Math.min(100, Math.round(body.progress)))
    }

    const updatedJob = await db
      .update(jobs)
      .set(updates)
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        progress: jobs.progress,
        status: jobs.status,
        updatedAt: jobs.updatedAt
      })

    if (updatedJob.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Job not found' })
    }

    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('❌ Failed to update job counts after job update:', error)
    }

    return { success: true, job: updatedJob[0], message: `Job progress updated to ${updates.progress}%` }

  } catch (error: any) {
    logger.error('Error updating job:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update job: ${error.message || 'Unknown error'}`
    })
  }
})
