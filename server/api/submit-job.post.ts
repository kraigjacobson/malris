import { logger } from '~/server/utils/logger'
import { resolveSourceMediaUuid } from '~/server/utils/jobUtils'
import { stripPresetFields } from '~/server/utils/presetSnapshot'
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    if (!body || !body.job_type) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: job_type'
      })
    }

    const jobType = body.job_type

    // Validate per job type
    if (jobType === 'vid_faceswap') {
      if (!body.subject_uuid || !body.dest_media_uuid) {
        throw createError({
          statusCode: 400,
          statusMessage: 'vid_faceswap requires subject_uuid and dest_media_uuid'
        })
      }
    } else if (jobType === 'i2v') {
      if (!body.source_media_uuid) {
        throw createError({
          statusCode: 400,
          statusMessage: 'i2v requires source_media_uuid (the input image)'
        })
      }
    } else if (jobType === 'fs') {
      if (!body.subject_uuid || !body.source_media_uuid || !body.dest_media_uuid) {
        throw createError({
          statusCode: 400,
          statusMessage: 'fs requires subject_uuid, source_media_uuid (the identity face) and dest_media_uuid (the target image)'
        })
      }
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported job type: ${jobType}`
      })
    }

    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    const db = getDb()

    // Resolve source media UUID for vid_faceswap
    let resolvedSourceMediaUuid = body.source_media_uuid || null
    if (jobType === 'vid_faceswap' && body.subject_uuid) {
      resolvedSourceMediaUuid = await resolveSourceMediaUuid(db, body.subject_uuid)
    }

    const jobId = crypto.randomUUID()

    // Split out the preset reference from the incoming parameters. Queued jobs
    // resolve preset values live via preset_id; only non-preset params (like
    // frames_per_batch for vid_faceswap) survive in the parameters snapshot.
    const incomingParams = body.parameters || {}
    const presetId = incomingParams._preset_id || null
    const queuedParams = stripPresetFields(incomingParams)

    const newJob = {
      id: jobId,
      jobType: jobType,
      subjectUuid: body.subject_uuid || null,
      destMediaUuid: body.dest_media_uuid || null,
      sourceMediaUuid: resolvedSourceMediaUuid,
      presetId,
      parameters: queuedParams,
      status: 'queued' as const,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    await db.insert(jobs).values(newJob)

    logger.info(`Job created: ${jobId} (${jobType})`)

    return {
      success: true,
      job_id: jobId,
      status: 'queued',
      job_type: jobType,
      created_at: newJob.createdAt,
      message: `Job submitted successfully. Type: ${jobType}`
    }

  } catch (error: any) {
    logger.error('Error submitting job:', error)

    if (error.statusCode) throw error

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to submit job: ${error.message || 'Unknown error'}`
    })
  }
})
