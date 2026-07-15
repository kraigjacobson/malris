import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

/**
 * Change the output dimensions (width/height) of a QUEUED t2v job before it
 * runs. Dimensions live in the job's parameters jsonb (they're non-preset
 * params, so they survive stripPresetFields and the queued→active snapshot),
 * which lets a single queued job be re-dimensioned without touching its preset
 * or its siblings. Only queued t2v jobs are eligible.
 */
export default defineEventHandler(async (event) => {
  try {
    const jobId = getRouterParam(event, 'id')
    if (!jobId) {
      throw createError({ statusCode: 400, statusMessage: 'Job ID is required' })
    }

    const body = await readBody(event)
    const width = Number(body?.width)
    const height = Number(body?.height)
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'width and height must be positive integers' })
    }

    const db = getDb()
    const [job] = await db
      .select({ id: jobs.id, status: jobs.status, jobType: jobs.jobType, parameters: jobs.parameters })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!job) {
      throw createError({ statusCode: 404, statusMessage: 'Job not found' })
    }
    if (job.jobType !== 't2v') {
      throw createError({ statusCode: 400, statusMessage: 'Dimensions can only be set on t2v jobs' })
    }
    if (job.status !== 'queued') {
      throw createError({ statusCode: 409, statusMessage: 'Only queued jobs can be re-dimensioned' })
    }

    const nextParams = { ...((job.parameters as Record<string, any>) || {}), width, height }
    const [updated] = await db
      .update(jobs)
      .set({ parameters: nextParams, updatedAt: new Date() })
      .where(eq(jobs.id, jobId))
      .returning({ id: jobs.id, parameters: jobs.parameters, updatedAt: jobs.updatedAt })

    return { success: true, job: updated, message: `Dimensions set to ${width} × ${height}` }
  } catch (error: any) {
    logger.error('Error updating job dimensions:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update dimensions: ${error.message || 'Unknown error'}`
    })
  }
})
