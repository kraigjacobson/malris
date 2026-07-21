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

  // 'concept' = pose/action across many subjects (no single subject, selected by
  // tag); 'character' (default) = one subject's identity.
  const kind: 'character' | 'concept' = body?.kind === 'concept' ? 'concept' : 'character'
  const subjectUuid: string | null = body?.subject_uuid || null
  // Accept concept_tags (array, preferred) or a single/comma-separated concept_tag.
  const conceptTagsRaw: string[] = Array.isArray(body?.concept_tags)
    ? body.concept_tags
    : typeof body?.concept_tag === 'string' ? body.concept_tag.split(',') : []
  const conceptTags: string[] = conceptTagsRaw.map((t: any) => String(t).trim()).filter(Boolean)
  const loraName: string = (body?.lora_name || '').trim()
  const triggerWord: string = (body?.trigger_word || '').trim()
  const imageUuids: string[] = Array.isArray(body?.image_uuids) ? body.image_uuids : []
  // Concept video clips: [{ uuid, start, end, crop:{x,y,w,h} }]. Trimmed +
  // optionally cropped into short training clips at export.
  const videoClips = (Array.isArray(body?.video_clips) ? body.video_clips : [])
    .filter((c: any) => c && typeof c.uuid === 'string')
    .map((c: any) => ({
      uuid: c.uuid,
      start: Number(c.start) || 0,
      end: Number(c.end) || ((Number(c.start) || 0) + 2),
      crop: c.crop && typeof c.crop === 'object'
        ? { x: Number(c.crop.x) || 0, y: Number(c.crop.y) || 0, w: Number(c.crop.w) || 1, h: Number(c.crop.h) || 1 }
        : null
    }))
  const baseConfig = body?.config && typeof body.config === 'object' ? body.config : {}
  // Persist the clips in config so the run is auditable / resumable.
  const config = videoClips.length ? { ...baseConfig, videoClips } : baseConfig

  if (!loraName || !triggerWord) {
    throw createError({ statusCode: 400, statusMessage: 'lora_name and trigger_word are required' })
  }
  if (kind === 'concept') {
    if (conceptTags.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'at least one concept tag is required for a concept training' })
    }
  } else if (!subjectUuid) {
    throw createError({ statusCode: 400, statusMessage: 'subject_uuid is required for a character training' })
  }
  if (!/^[A-Za-z0-9_-]+$/.test(loraName)) {
    throw createError({ statusCode: 400, statusMessage: 'lora_name must be letters, digits, _ or - (it becomes a safetensors filename)' })
  }
  if (imageUuids.length + videoClips.length < 5) {
    throw createError({ statusCode: 400, statusMessage: 'At least 5 training items (images + video clips) are required' })
  }

  const db = getDb()
  if (kind === 'character') {
    const subjectRows = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectUuid as string)).limit(1)
    if (subjectRows.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Subject not found' })
    }
  }

  const [training] = await db
    .insert(loraTrainings)
    .values({
      kind,
      subjectUuid: kind === 'concept' ? null : subjectUuid,
      conceptTag: kind === 'concept' ? conceptTags.join(', ') : null,
      loraName,
      triggerWord,
      status: 'queued',
      imageUuids,
      config
    })
    .returning()

  try {
    // Decrypt + export the picked images and write the run's TOMLs. For a concept
    // run, pass the tag so captions drop it (trigger absorbs the pose).
    const { exported } = await prepareTrainingRun({
      runId: training.id,
      triggerWord,
      imageUuids,
      config,
      conceptTags: kind === 'concept' ? conceptTags : undefined,
      videoClips
    })

    // Queue the job that carries this training through the single-GPU queue.
    // Concept jobs carry a null subject (jobs.subject_uuid is nullable).
    const [job] = await db
      .insert(jobs)
      .values({
        jobType: 'train_lora',
        subjectUuid: kind === 'concept' ? null : subjectUuid,
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
