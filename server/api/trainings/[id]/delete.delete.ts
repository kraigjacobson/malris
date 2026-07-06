import { eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { loraTrainings } from '~/server/utils/schema'
import { removeTrainingRunFiles } from '~/server/services/loraTrainingService'
import { logger } from '~/server/utils/logger'

// Delete a terminal training run: removes the exported dataset + run dir
// (checkpoints, logs) from /train. Published LoRAs in LORAS_DIR are kept —
// they're the product. The job row is kept for history.
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
  if (!['completed', 'failed', 'canceled', 'paused'].includes(rows[0].status)) {
    throw createError({ statusCode: 400, statusMessage: 'Only non-running trainings can be deleted (cancel it first)' })
  }

  await removeTrainingRunFiles(id)
  await db.delete(loraTrainings).where(eq(loraTrainings.id, id))

  logger.info(`🎓 training ${id} deleted (dataset + run files removed)`)
  return { success: true }
})
