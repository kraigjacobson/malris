import { eq } from 'drizzle-orm'
import { rename, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getDb } from '~/server/utils/database'
import { loraTrainings, jobs, loraMetadata, subjects } from '~/server/utils/schema'
import { logger } from '~/server/utils/logger'

/**
 * Terminal/pause reports from the ktrain trainer (same trust model as the
 * ComfyUI workers' progress/outputs callbacks — internal network only).
 *
 * body: { status: 'completed' | 'failed' | 'paused', loras?: {high, low}, error?: string }
 *
 * completed → training + job completed, LoRA filenames registered in
 *             lora_metadata with the trigger word (they're already in
 *             LORAS_DIR — ktrain publishes them there itself).
 * failed    → training + job failed with the error.
 * paused    → training paused; the job goes to need_input ONLY if still
 *             active (Stop-All may have already requeued it — leave that be).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const status: string = body?.status

  if (!id || !['completed', 'failed', 'paused'].includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'training id and status (completed|failed|paused) are required' })
  }

  const db = getDb()
  const rows = await db.select().from(loraTrainings).where(eq(loraTrainings.id, id)).limit(1)
  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Training not found' })
  }
  const training = rows[0]
  const now = new Date()

  if (status === 'completed') {
    const loras = body?.loras || {}
    await db
      .update(loraTrainings)
      .set({ status: 'completed', outputLoras: loras, completedAt: now, updatedAt: now, errorMessage: null })
      .where(eq(loraTrainings.id, id))
    if (training.jobId) {
      await db
        .update(jobs)
        .set({ status: 'completed', progress: 100, completedAt: now, updatedAt: now })
        .where(eq(jobs.id, training.jobId))
    }
    // Auto-incorporate the trained character into the prompt system: move the
    // published high/low LoRAs into t2v/char/ (the char-folder convention then
    // treats them as a character), and register them with the trigger word,
    // the subject's name (dropdown badge), and a shared pair_key (high/low
    // auto-pairing). The appearance/description is added by hand later via the
    // trigger-words pencil in the UI.
    try {
      const LORAS_DIR = process.env.LORAS_DIR || '/data/loras'
      const charDir = path.join(LORAS_DIR, 't2v', 'char')
      await mkdir(charDir, { recursive: true })
      const subjRows = training.subjectUuid
        ? await db.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, training.subjectUuid)).limit(1)
        : []
      const subjectName = subjRows[0]?.name || training.loraName

      for (const file of Object.values(loras) as string[]) {
        if (!file) continue
        const basename = path.basename(file)
        const src = path.isAbsolute(file) ? file : path.join(LORAS_DIR, file)
        const destAbs = path.join(charDir, basename)
        try {
          if (path.resolve(src) !== path.resolve(destAbs)) await rename(src, destAbs)
        } catch (e) {
          logger.warn(`🎓 could not move ${src} -> ${destAbs}: ${(e as any)?.message}`)
        }
        const name = existsSync(destAbs) ? `t2v/char/${basename}` : file
        await db
          .insert(loraMetadata)
          .values({ name, triggerWords: training.triggerWord, civitaiName: subjectName, pairKey: training.loraName })
          .onConflictDoUpdate({ target: loraMetadata.name, set: { triggerWords: training.triggerWord, civitaiName: subjectName, pairKey: training.loraName, updatedAt: now } })
      }
    } catch (e) {
      logger.error(`🎓 char auto-incorporation failed for ${id}: ${(e as any)?.message}`)
      for (const file of Object.values(loras) as string[]) {
        if (!file) continue
        await db
          .insert(loraMetadata)
          .values({ name: file, triggerWords: training.triggerWord })
          .onConflictDoUpdate({ target: loraMetadata.name, set: { triggerWords: training.triggerWord, updatedAt: now } })
      }
    }
    logger.info(`🎓 training ${id} completed — published: ${JSON.stringify(loras)}`)
  } else if (status === 'failed') {
    const error = body?.error || 'Training failed'
    await db
      .update(loraTrainings)
      .set({ status: 'failed', errorMessage: error, updatedAt: now })
      .where(eq(loraTrainings.id, id))
    if (training.jobId) {
      await db
        .update(jobs)
        .set({ status: 'failed', errorMessage: error, updatedAt: now })
        .where(eq(jobs.id, training.jobId))
    }
    logger.error(`🎓 training ${id} failed: ${error}`)
  } else {
    // paused
    await db
      .update(loraTrainings)
      .set({ status: 'paused', updatedAt: now })
      .where(eq(loraTrainings.id, id))
    if (training.jobId) {
      const jobRows = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, training.jobId)).limit(1)
      if (jobRows[0]?.status === 'active') {
        await db
          .update(jobs)
          .set({ status: 'need_input', updatedAt: now })
          .where(eq(jobs.id, training.jobId))
      }
    }
    logger.info(`🎓 training ${id} paused (checkpointed)`)
  }

  return { success: true }
})
