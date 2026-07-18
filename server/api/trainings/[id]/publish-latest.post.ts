import { eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { loraTrainings, loraMetadata } from '~/server/utils/schema'
import { logger } from '~/server/utils/logger'

// Publish a plug-and-play TEST snapshot of the newest saved epoch(s) straight
// into the loras folder, WITHOUT interrupting training. The trainer names each
// file <lora>_<expert>_ep<N>_<MMDD>.safetensors, so snapshots never clobber
// each other or the final <lora>_<expert> outputs — just load and test.
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

  const trainerUrl = process.env.TRAINER_URL || 'http://ktrain:8000'
  const form = new FormData()
  form.append('run_id', training.id)
  form.append('lora_name', training.loraName)

  let result: any = {}
  try {
    const res = await fetch(`${trainerUrl}/publish-latest`, { method: 'POST', body: form })
    result = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw createError({
        statusCode: res.status,
        statusMessage: result?.error || 'Trainer could not publish a test snapshot'
      })
    }
  } catch (error: any) {
    if (error?.statusCode) throw error
    logger.warn(`🎓 trainer /publish-latest unreachable for ${id}:`, error)
    throw createError({ statusCode: 502, statusMessage: 'Trainer is unreachable' })
  }

  // Register the snapshot filenames in lora_metadata with the training's
  // trigger word, so selecting a test LoRA in the job form auto-fills its
  // trigger words (same annotation the final completed outputs get).
  const now = new Date()
  for (const file of Object.values(result?.loras || {}) as string[]) {
    if (!file) continue
    await db
      .insert(loraMetadata)
      .values({ name: file, triggerWords: training.triggerWord })
      .onConflictDoUpdate({ target: loraMetadata.name, set: { triggerWords: training.triggerWord, updatedAt: now } })
  }

  logger.info(`🎓 training ${id}: published test snapshot`, result?.loras)
  return { success: true, loras: result?.loras || {} }
})
