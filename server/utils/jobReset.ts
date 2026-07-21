import { logger } from '~/server/utils/logger'
import { resolveSourceMediaUuid } from '~/server/utils/jobUtils'

export interface ResetJobOptions {
  // Statuses a job is allowed to be in for this reset to proceed. Callers pass
  // their own gate (e.g. retry allows completed/canceled too; requeue is failed-only).
  allowedStatuses: string[]
}

export interface ResetJobResult {
  id: string
  jobType: string
  status: string
  updatedAt: Date
  deletedMediaCount: number
  // Diagnostic: what the retry-time prompt recompose did (surfaced in the retry
  // response/toast so we can see why a stale job didn't re-roll — no DB peeking).
  recompose?: {
    attempted: boolean
    applied: boolean
    reason?: string
    loraCount?: number
    loraNames?: string[]
    baseName?: string | null
    promptPreview?: string
  }
}

/**
 * Reset a job back to `queued` for a re-run. This is the SINGLE source of truth
 * shared by the /retry and /requeue endpoints — they previously duplicated this
 * logic and drifted apart, which is how an fs source-clearing bug got fixed in
 * one path but not the other.
 *
 * Behaviour:
 *  - Validates the job exists and is in an allowed status.
 *  - Deletes the job's output media (the only media that carries its jobId) and
 *    clears outputUuid so no dangling reference is left behind.
 *  - Applies the source policy (see below).
 *  - Drops the preset snapshot (parameters = {}) so the re-run pulls the preset's
 *    *current* values, not the stale ones from the failed run.
 *  - Refreshes WebSocket job counts.
 *
 * Source policy:
 *  - vid_faceswap: always cleared, so the job re-enters its 'source' sub-mode and
 *    regenerates a fresh source frame from the subject.
 *  - everything else (fs identity face, i2v/t2v input image): the existing source
 *    is preserved; we only auto-resolve from the subject when it's missing (which
 *    succeeds when the subject has exactly one source image).
 */
export async function resetJobToQueued(jobId: string, opts: ResetJobOptions): Promise<ResetJobResult> {
  const { getDb } = await import('~/server/utils/database')
  const { jobs, mediaRecords } = await import('~/server/utils/schema')
  const { eq, and } = await import('drizzle-orm')

  const db = getDb()

  const existing = await db.select({
    id: jobs.id,
    jobType: jobs.jobType,
    status: jobs.status,
    subjectUuid: jobs.subjectUuid,
    sourceMediaUuid: jobs.sourceMediaUuid,
    presetId: jobs.presetId,
    parameters: jobs.parameters
  }).from(jobs).where(eq(jobs.id, jobId)).limit(1)

  if (existing.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }

  const job = existing[0]

  if (!opts.allowedStatuses.includes(job.status as string)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot re-queue job with status: ${job.status}. Only ${opts.allowedStatuses.join(', ')} jobs can be re-queued.`
    })
  }

  const sourceMediaUuid = job.jobType === 'vid_faceswap'
    ? null
    : await resolveSourceMediaUuid(db, job.subjectUuid, job.sourceMediaUuid)

  // Only output media carries this job's jobId; inputs (dest/source/subject) don't.
  const deletedMedia = await db.delete(mediaRecords)
    .where(and(eq(mediaRecords.jobId, jobId), eq(mediaRecords.purpose, 'output')))
    .returning({ uuid: mediaRecords.uuid })

  // Preset-backed jobs re-derive params from the preset's *current* values at
  // activation, so we drop their stale snapshot. Preset-LESS jobs (inline t2v/i2v
  // and character sweeps) hold their prompt + LoRAs here with nothing to restore
  // from — wiping them would leave an empty, un-runnable job — so keep them.
  const setValues: Record<string, any> = {
    status: 'queued',
    progress: 0,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    outputUuid: null,
    sourceMediaUuid,
    updatedAt: new Date()
  }
  const recompose: NonNullable<ResetJobResult['recompose']> = { attempted: false, applied: false }
  if (job.presetId) {
    setValues.parameters = {}
    recompose.reason = 'preset-backed job — re-derives its prompt from the preset, not the live LoRA template'
  } else if ((job.jobType === 't2v' || job.jobType === 'i2v') && job.parameters) {
    // Retry should re-run FRESH: rebuild the prompt from this job's LoRA stack
    // using the CURRENT lora_metadata templates, so it re-rolls the dynamic
    // prompt AND picks up any template improvements made since it was created.
    // Wildcards stay intact and re-expand at activation. If the stack has no
    // base to compose from, we leave the existing prompt untouched.
    recompose.attempted = true
    const params = job.parameters as Record<string, any>
    const names: string[] = []
    for (const s of [1, 2, 3, 4, 5]) {
      for (const n of ['high', 'low']) {
        const v = params[`lora_${s}_${n}`]
        if (v && v !== 'none' && !names.includes(v)) names.push(v)
      }
    }
    recompose.loraCount = names.length
    recompose.loraNames = names
    try {
      const { recomposePromptFromLoras } = await import('~/server/utils/composePrompt')
      const composed = await recomposePromptFromLoras(params)
      if (composed) {
        const p = { ...params }
        p.prompt = composed.prompt
        p.prompt_template = composed.prompt
        if (composed.negative) p.negative_prompt = composed.negative
        // Snap the frame to the position's orientation, but PRESERVE the job's
        // current resolution tier (low vs HD) — so retrying a low-res test job
        // stays low-res (we only correct the aspect, never bump the quality tier).
        if (composed.orientation === 'landscape' || composed.orientation === 'portrait') {
          const curMax = Math.max(Number(params.width) || 0, Number(params.height) || 0)
          const low = curMax > 0 && curMax <= 832 // 480x832 / 832x480 fast tier
          const dims = composed.orientation === 'landscape'
            ? (low ? { width: 832, height: 480 } : { width: 1280, height: 720 })
            : (low ? { width: 480, height: 832 } : { width: 720, height: 1280 })
          p.width = dims.width
          p.height = dims.height
        }
        // Re-apply each LoRA's CURRENT recommended strength to its slot, so a
        // retry picks up strength tweaks (e.g. a lowered doggy/giantess strength)
        // — only overwriting slots whose LoRA we actually resolved.
        for (const s of [1, 2, 3, 4, 5]) {
          for (const noise of ['high', 'low']) {
            const nm = p[`lora_${s}_${noise}`]
            if (nm && composed.strengths[nm] != null) {
              p[`lora_${s}_${noise}_strength`] = composed.strengths[nm]
            }
          }
        }
        setValues.parameters = p
        recompose.applied = true
        recompose.promptPreview = composed.prompt.slice(0, 100)
        if (dims) recompose.reason = `framed ${composed.orientation}`
        logger.info(`🎲 Retry recomposed prompt for job ${jobId} from its LoRA stack (fresh templates + re-roll${dims ? `, ${composed.orientation}` : ''})`)
      } else {
        recompose.reason = names.length === 0
          ? 'job parameters carry no LoRA stack to rebuild from'
          : 'no position/closeup base LoRA (with a prompt template) resolved from this stack'
      }
    } catch (e: any) {
      recompose.reason = `recompose threw: ${e?.message || String(e)}`
      logger.error(`Retry recompose failed for job ${jobId}, keeping existing prompt:`, e)
    }
  } else {
    recompose.reason = `not eligible (jobType=${job.jobType}, hasParameters=${!!job.parameters})`
  }

  const updated = await db.update(jobs)
    .set(setValues)
    .where(eq(jobs.id, jobId))
    .returning({
      id: jobs.id,
      jobType: jobs.jobType,
      status: jobs.status,
      updatedAt: jobs.updatedAt
    })

  if (updated.length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to update job - no rows returned from update operation' })
  }

  // Refresh job counts for WebSocket clients after the status change.
  try {
    const { updateJobCounts } = await import('~/server/services/systemStatusManager')
    await updateJobCounts()
  } catch (error) {
    logger.error('Failed to update job counts after job reset:', error)
  }

  const r = updated[0]
  logger.info(`✅ Reset job ${jobId} → queued (deleted ${deletedMedia.length} output media)`)

  return {
    id: r.id as string,
    jobType: r.jobType as string,
    status: r.status as string,
    updatedAt: r.updatedAt as Date,
    deletedMediaCount: deletedMedia.length,
    recompose
  }
}
