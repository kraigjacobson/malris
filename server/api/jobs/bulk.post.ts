import { logger } from '~/server/utils/logger'
import { stripPresetFields } from '~/server/utils/presetSnapshot'

/**
 * Create i2v jobs in bulk — one job per favorited source image. Favorites are
 * set per-image from the Manage Subject modal; this endpoint just reads them.
 *
 * The supplied `parameters` payload is shared verbatim across every created job
 * (so the preset / prompt / LoRA settings carry through).
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { job_type, parameters, source_job_type } = body
    const sourceJobTypeFilter: string = source_job_type || 'all'

    if (job_type !== 'i2v') {
      throw createError({
        statusCode: 400,
        statusMessage: "Only job_type 'i2v' is supported for bulk creation"
      })
    }

    // Parse parameters (accept either a JSON string or an object, matching
    // create.post.ts behavior so the frontend can hand off i2vParams as-is).
    let params: any = {}
    if (parameters) {
      if (typeof parameters === 'string') {
        try {
          params = JSON.parse(parameters)
        } catch (error: any) {
          logger.error('bulk job creation: invalid parameters JSON', error)
          throw createError({
            statusCode: 400,
            statusMessage: 'Invalid parameters JSON'
          })
        }
      } else {
        params = parameters
      }
    }

    // Bulk creation always references a preset — the prompt comes from there.
    const presetId: string | null = params._preset_id || null
    if (!presetId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'parameters._preset_id is required for bulk i2v creation'
      })
    }
    const queuedParams = stripPresetFields(params)

    const { getDb } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { and, eq, isNotNull, isNull, sql, inArray } = await import('drizzle-orm')

    const db = getDb()

    // Pull every favorited source image. subject_uuid must be present (jobs are
    // associated with a subject) — orphan images aren't valid bulk candidates.
    const baseConditions = [
      eq(mediaRecords.favorite, true),
      eq(mediaRecords.purpose, 'source'),
      eq(mediaRecords.type, 'image'),
      isNotNull(mediaRecords.subjectUuid)
    ]

    if (sourceJobTypeFilter !== 'all') {
      if (sourceJobTypeFilter === 'none') {
        baseConditions.push(isNull(mediaRecords.jobId))
      } else {
        baseConditions.push(
          sql`EXISTS (SELECT 1 FROM ${jobs} WHERE ${jobs.id} = ${mediaRecords.jobId} AND ${jobs.jobType} = ${sourceJobTypeFilter})`
        )
      }
    }

    const candidates = await db
      .select({
        source_media_uuid: mediaRecords.uuid,
        subject_uuid: mediaRecords.subjectUuid
      })
      .from(mediaRecords)
      .where(and(...baseConditions))

    if (candidates.length === 0) {
      return {
        success: true,
        created: 0,
        favorites_found: 0,
        skipped_already_queued: 0,
        message: 'No favorited source images found. Mark images as favorite from the Manage Subject modal.'
      }
    }

    // Drop any candidates that already have a queued i2v job for this same
    // preset — running bulk twice in a row with the same preset shouldn't pile
    // up duplicates. Different presets are still allowed to queue separately.
    const candidateUuids = candidates.map(c => c.source_media_uuid)
    const existing = await db
      .select({ source_media_uuid: jobs.sourceMediaUuid })
      .from(jobs)
      .where(
        and(
          eq(jobs.jobType, 'i2v'),
          eq(jobs.status, 'queued'),
          eq(jobs.presetId, presetId),
          inArray(jobs.sourceMediaUuid, candidateUuids)
        )
      )
    const alreadyQueued = new Set(existing.map(e => e.source_media_uuid).filter((id): id is string => !!id))

    const fresh = candidates.filter(c => !alreadyQueued.has(c.source_media_uuid))
    const skippedAlreadyQueued = candidates.length - fresh.length

    if (fresh.length === 0) {
      return {
        success: true,
        created: 0,
        favorites_found: candidates.length,
        skipped_already_queued: skippedAlreadyQueued,
        subjects_qualified: 0,
        message: `All ${candidates.length} matching favorite${candidates.length !== 1 ? 's are' : ' is'} already queued for this preset.`
      }
    }

    const subjectsQualified = new Set(
      fresh.map(c => c.subject_uuid).filter((id): id is string => !!id)
    ).size

    // Single multi-row insert. One round-trip regardless of N.
    const rows = fresh.map(c => ({
      jobType: 'i2v',
      subjectUuid: c.subject_uuid,
      sourceMediaUuid: c.source_media_uuid,
      destMediaUuid: null,
      presetId,
      parameters: Object.keys(queuedParams).length > 0 ? queuedParams : null,
      status: 'queued' as const,
      progress: 0
    }))

    const inserted = await db.insert(jobs).values(rows).returning({ id: jobs.id })

    // Single broadcast to WebSocket clients regardless of batch size.
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('Failed to update job counts after bulk job creation:', error)
    }

    return {
      success: true,
      created: inserted.length,
      favorites_found: candidates.length,
      skipped_already_queued: skippedAlreadyQueued,
      subjects_qualified: subjectsQualified,
      message: `Created ${inserted.length} i2v jobs from favorited images across ${subjectsQualified} subjects`
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    logger.error('Bulk job creation failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create bulk jobs: ${error.message || 'Unknown error'}`
    })
  }
})
