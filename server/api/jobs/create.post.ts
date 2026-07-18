import { logger } from '~/server/utils/logger'
import { resolveSourceMediaUuid } from '~/server/utils/jobUtils'
import { stripPresetFields } from '~/server/utils/presetSnapshot'
/**
 * Create a new job and add it to the queue
 * Replaces the FastAPI /jobs POST route
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { 
      job_type, 
      subject_uuid, 
      dest_media_uuid, 
      source_media_uuid, 
      frames_per_batch, 
      parameters 
    } = body
    
    // Validate required fields
    if (!job_type) {
      throw createError({
        statusCode: 400,
        statusMessage: "job_type is required"
      })
    }
    
    if (job_type === "vid_faceswap") {
      if (!subject_uuid) {
        throw createError({
          statusCode: 400,
          statusMessage: "subject_uuid is required for vid_faceswap jobs"
        })
      }

      if (!dest_media_uuid) {
        throw createError({
          statusCode: 400,
          statusMessage: "dest_media_uuid is required for vid_faceswap jobs"
        })
      }
    }

    if (job_type === "fs") {
      if (!subject_uuid || !source_media_uuid || !dest_media_uuid) {
        throw createError({
          statusCode: 400,
          statusMessage: "fs jobs require subject_uuid, source_media_uuid (identity face) and dest_media_uuid (target image)"
        })
      }
    }

    if (job_type === "t2v") {
      // Pure text-to-video: no source/dest media, but a prompt is mandatory
      // (either directly in parameters or via a preset that carries one).
      const rawParams = typeof parameters === 'string' ? (() => { try { return JSON.parse(parameters) } catch { return {} } })() : (parameters || {})
      if (!rawParams.prompt && !rawParams._preset_id) {
        throw createError({
          statusCode: 400,
          statusMessage: "t2v jobs require a prompt (or a preset) in parameters"
        })
      }
    }

    // Validate job type
    const validJobTypes = ["vid_faceswap", "i2v", "fs", "t2v"]
    if (!validJobTypes.includes(job_type)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid job type '${job_type}'. Supported types: ${validJobTypes.join(', ')}`
      })
    }
    
    const { getDb } = await import('~/server/utils/database')
    const { jobs, subjects, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()
    
    // Verify subject exists (required for vid_faceswap, optional for i2v)
    if (subject_uuid) {
      const subject = await db.select().from(subjects).where(eq(subjects.id, subject_uuid)).limit(1)

      if (subject.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Subject not found"
        })
      }
    }

    // Verify dest media exists (required for vid_faceswap, optional for i2v)
    if (dest_media_uuid) {
      const destMedia = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, dest_media_uuid)).limit(1)

      if (destMedia.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Destination media not found"
        })
      }
    }

    // Verify source media exists if provided
    if (source_media_uuid) {
      const sourceMedia = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, source_media_uuid)).limit(1)

      if (sourceMedia.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Source media not found"
        })
      }
    }

    // Parse parameters
    let params: any = {}
    if (parameters) {
      if (typeof parameters === 'string') {
        try {
          params = JSON.parse(parameters)
        } catch (error: any) {
          logger.error("error", error)
          throw createError({
            statusCode: 400,
            statusMessage: "Invalid parameters JSON"
          })
        }
      } else {
        params = parameters
      }
    }

    // Add frames_per_batch to parameters if provided
    if (frames_per_batch !== undefined) {
      params.frames_per_batch = frames_per_batch
    }

    // For LoRA-driven jobs (t2v/i2v) with no explicit subject, inherit the
    // subject from the training that produced the selected LoRA — otherwise the
    // job shows "unknown".
    let resolvedSubjectUuid: string | null = subject_uuid || null
    if (!resolvedSubjectUuid) {
      const { deriveSubjectFromLoras } = await import('~/server/utils/subjectFromLora')
      resolvedSubjectUuid = await deriveSubjectFromLoras(db, params)
      if (resolvedSubjectUuid) {
        logger.info(`🔗 ${job_type} job inheriting subject ${resolvedSubjectUuid} from its LoRA's training`)
      }
    }

    // Resolve source media UUID for vid_faceswap jobs
    let resolvedSourceMediaUuid = source_media_uuid || null
    if (job_type === "vid_faceswap" && subject_uuid) {
      logger.info(`DEBUG create: calling resolveSourceMediaUuid for subject ${subject_uuid}`)
      resolvedSourceMediaUuid = await resolveSourceMediaUuid(db, subject_uuid, source_media_uuid)
      logger.info(`DEBUG create: resolvedSourceMediaUuid = ${resolvedSourceMediaUuid}`)
    }

    // Promote _preset_id from the jsonb stash to a real column. Queued jobs
    // resolve preset values live; only non-preset params survive in parameters.
    const presetId: string | null = params._preset_id || null
    // Strip preset-derived fields (prompt, loras, length…) ONLY when the job
    // references a preset — then the preset is the source of truth and those
    // values get re-snapshotted at activation. For a preset-LESS job (e.g. an
    // inline t2v job typed without saving a preset) those fields ARE the real
    // parameters, so keep them; just drop the internal preset bookkeeping keys.
    let queuedParams: Record<string, any>
    if (presetId) {
      queuedParams = stripPresetFields(params)
    } else {
      const { _preset_id: _pid, _preset_name: _pname, ...rest } = params
      void _pid; void _pname
      queuedParams = rest
    }

    // Create job using Drizzle ORM
    const newJob = await db.insert(jobs).values({
      jobType: job_type,
      subjectUuid: resolvedSubjectUuid,
      destMediaUuid: dest_media_uuid || null,
      sourceMediaUuid: resolvedSourceMediaUuid,
      presetId,
      parameters: Object.keys(queuedParams).length > 0 ? queuedParams : null,
      status: 'queued',
      progress: 0
    }).returning({
      id: jobs.id,
      jobType: jobs.jobType,
      status: jobs.status,
      createdAt: jobs.createdAt
    })
    
    const createdJob = newJob[0]
    
    // Update job counts for WebSocket clients
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('Failed to update job counts after job creation:', error)
    }
    
    return {
      success: true,
      job_id: createdJob.id,
      job_type: createdJob.jobType,
      status: createdJob.status,
      created_at: createdJob.createdAt,
      message: "Job created successfully"
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create job: ${error.message || 'Unknown error'}`
    })
  }
})