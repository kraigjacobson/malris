import { eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { loraTrainings, jobs, subjects } from '~/server/utils/schema'
import { prepareTrainingRun } from '~/server/services/loraTrainingService'
import { autoStartTraining } from '~/server/services/jobProcessingService'
import { logger } from '~/server/utils/logger'

/**
 * Create a LoRA training run: insert the lora_trainings row, export the
 * decrypted dataset + generate the diffusion-pipe configs under /train, then
 * queue a train_lora job that rides the normal single-active jobs queue.
 *
 * train_lora jobs are created ONLY here (deliberately not in jobs/create's
 * validJobTypes) — a bare train_lora job without its lora_trainings row and
 * exported dataset would fail at dispatch.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const subjectUuid: string = body?.subject_uuid
  const loraName: string = (body?.lora_name || '').trim()
  const triggerWord: string = (body?.trigger_word || '').trim()
  const imageUuids: string[] = Array.isArray(body?.image_uuids) ? body.image_uuids : []
  const config = body?.config && typeof body.config === 'object' ? body.config : {}

  if (!subjectUuid || !loraName || !triggerWord) {
    throw createError({ statusCode: 400, statusMessage: 'subject_uuid, lora_name and trigger_word are required' })
  }
  if (!/^[A-Za-z0-9_-]+$/.test(loraName)) {
    throw createError({ statusCode: 400, statusMessage: 'lora_name must be letters, digits, _ or - (it becomes a safetensors filename)' })
  }
  if (imageUuids.length < 5) {
    throw createError({ statusCode: 400, statusMessage: 'At least 5 training images are required' })
  }

  const db = getDb()
  const subjectRows = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectUuid)).limit(1)
  if (subjectRows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Subject not found' })
  }

  const [training] = await db
    .insert(loraTrainings)
    .values({
      subjectUuid,
      loraName,
      triggerWord,
      status: 'queued',
      imageUuids,
      config
    })
    .returning()

  try {
    // Decrypt + export the picked images and write the run's TOMLs
    const { exported } = await prepareTrainingRun({
      runId: training.id,
      triggerWord,
      imageUuids,
      config
    })

    // Queue the job that carries this training through the single-GPU queue
    const [job] = await db
      .insert(jobs)
      .values({
        jobType: 'train_lora',
        subjectUuid,
        status: 'queued',
        progress: 0
      })
      .returning({ id: jobs.id })

    await db
      .update(loraTrainings)
      .set({ jobId: job.id, updatedAt: new Date() })
      .where(eq(loraTrainings.id, training.id))

    logger.info(`🎓 training ${training.id} (${loraName}) queued: ${exported} images, job ${job.id}`)

    // Kick processing off so the run actually starts without a separate
    // "process one" — no-op if a processing loop is already active.
    void autoStartTraining()

    return { success: true, training_id: training.id, job_id: job.id, exported }
  } catch (error: any) {
    // Creation is all-or-nothing: drop the row if the export/queue step failed
    await db.delete(loraTrainings).where(eq(loraTrainings.id, training.id))
    logger.error(`🎓 training creation failed for ${loraName}:`, error)
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Failed to create training run' })
  }
})
