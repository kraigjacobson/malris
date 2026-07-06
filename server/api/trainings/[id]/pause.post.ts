import { eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { loraTrainings, jobs } from '~/server/utils/schema'
import { logger } from '~/server/utils/logger'

// Pause a running training: ask ktrain to stop (deepspeed checkpoints every
// 30 min, so at most that much work is lost), mark the training paused and
// park the job in need_input so the picker won't re-dispatch it until Resume.
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
  if (training.status !== 'training' && training.status !== 'queued') {
    throw createError({ statusCode: 400, statusMessage: `Cannot pause a training in status '${training.status}'` })
  }

  const trainerUrl = process.env.TRAINER_URL || 'http://ktrain:8000'
  try {
    await fetch(`${trainerUrl}/stop`, { method: 'POST' })
  } catch (error) {
    logger.warn(`🎓 trainer /stop unreachable while pausing ${id} (continuing):`, error)
  }

  const now = new Date()
  await db
    .update(loraTrainings)
    .set({ status: 'paused', updatedAt: now })
    .where(eq(loraTrainings.id, id))
  if (training.jobId) {
    await db
      .update(jobs)
      .set({ status: 'need_input', updatedAt: now })
      .where(eq(jobs.id, training.jobId))
  }

  logger.info(`🎓 training ${id} pause requested`)
  return { success: true }
})
