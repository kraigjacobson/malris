import { eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { loraTrainings, jobs } from '~/server/utils/schema'
import { logger } from '~/server/utils/logger'

// Cancel a training. Stops the trainer if it's running. Checkpoints and the
// exported dataset are kept on disk (delete removes them) so a cancel can
// still be resurrected manually if needed.
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
  if (['completed', 'canceled'].includes(training.status)) {
    throw createError({ statusCode: 400, statusMessage: `Training is already ${training.status}` })
  }

  if (training.status === 'training') {
    const trainerUrl = process.env.TRAINER_URL || 'http://ktrain:8000'
    try {
      await fetch(`${trainerUrl}/stop`, { method: 'POST' })
    } catch (error) {
      logger.warn(`🎓 trainer /stop unreachable while canceling ${id} (continuing):`, error)
    }
  }

  const now = new Date()
  await db
    .update(loraTrainings)
    .set({ status: 'canceled', updatedAt: now })
    .where(eq(loraTrainings.id, id))
  if (training.jobId) {
    const jobRows = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, training.jobId)).limit(1)
    if (jobRows.length > 0 && !['completed', 'canceled'].includes(jobRows[0].status)) {
      await db
        .update(jobs)
        .set({ status: 'canceled', updatedAt: now })
        .where(eq(jobs.id, training.jobId))
    }
  }

  logger.info(`🎓 training ${id} canceled`)
  return { success: true }
})
