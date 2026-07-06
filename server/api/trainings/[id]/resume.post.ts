import { eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { loraTrainings, jobs } from '~/server/utils/schema'
import { autoStartTraining } from '~/server/services/jobProcessingService'
import { logger } from '~/server/utils/logger'

// Resume a paused (or failed) training: requeue its job. On re-dispatch the
// trainer skips experts with .done markers and picks the unfinished one back
// up from its latest deepspeed checkpoint.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Training ID is required' })
  }

  const db = getDb()
  const rows = await db.select().from(loraTrainings).where(eq(loraTrainings.id, id)).limit(1)
  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Training not found' })
  }
  const training = rows[0]
  if (!['paused', 'failed'].includes(training.status)) {
    throw createError({ statusCode: 400, statusMessage: `Cannot resume a training in status '${training.status}'` })
  }
  if (!training.jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Training has no job to resume' })
  }

  const now = new Date()
  await db
    .update(loraTrainings)
    .set({ status: 'queued', errorMessage: null, updatedAt: now })
    .where(eq(loraTrainings.id, id))
  await db
    .update(jobs)
    .set({ status: 'queued', errorMessage: null, updatedAt: now })
    .where(eq(jobs.id, training.jobId))

  logger.info(`🎓 training ${id} requeued for resume`)

  // Kick processing off so the run resumes without a separate "process one" —
  // no-op if a processing loop is already active.
  void autoStartTraining()

  return { success: true }
})
