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
    sourceMediaUuid: jobs.sourceMediaUuid
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

  const updated = await db.update(jobs)
    .set({
      status: 'queued',
      progress: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      outputUuid: null,
      sourceMediaUuid,
      parameters: {},
      updatedAt: new Date()
    })
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
    deletedMediaCount: deletedMedia.length
  }
}
