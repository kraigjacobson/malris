import { logger } from '~/server/utils/logger'

export default defineEventHandler(async event => {
  try {
    const jobId = getRouterParam(event, 'id')
    const body = await readBody(event)

    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required'
      })
    }

    logger.info(`🔄 [API] Adding source to job ${jobId} via Drizzle ORM...`)

    if (!body.source_media_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'source_media_uuid is required'
      })
    }

    // Use Drizzle ORM instead of raw SQL
    const { getDb } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')

    const db = getDb()

    // First check if job exists
    const existingJob = await db
      .select({
        id: jobs.id,
        status: jobs.status
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (existingJob.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    // Verify source media exists
    const sourceMedia = await db
      .select({
        uuid: mediaRecords.uuid
      })
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, body.source_media_uuid))
      .limit(1)

    if (sourceMedia.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Source media not found'
      })
    }

    // Delete all output images for this job since user selected one source image
    // The selected source image is body.source_media_uuid, all other output images can be deleted
    const { and } = await import('drizzle-orm')
    logger.info(`🗑️ Cleaning up unselected output images for job ${jobId}...`)
    const deletedOutputs = await db
      .delete(mediaRecords)
      .where(and(eq(mediaRecords.jobId, jobId), eq(mediaRecords.purpose, 'output'), eq(mediaRecords.type, 'image')))
      .returning({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename
      })

    if (deletedOutputs.length > 0) {
      logger.info(
        `✅ Deleted ${deletedOutputs.length} unselected output images:`,
        deletedOutputs.map(m => m.filename)
      )
    } else {
      logger.info(`ℹ️ No output images found to clean up for job ${jobId}`)
    }

    // Update job with source media and set status back to queued
    const updatedJob = await db
      .update(jobs)
      .set({
        sourceMediaUuid: body.source_media_uuid,
        status: 'queued',
        updatedAt: new Date()
      })
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        sourceMediaUuid: jobs.sourceMediaUuid,
        status: jobs.status,
        updatedAt: jobs.updatedAt
      })

    const updated = updatedJob[0]
    logger.info(`✅ [API] Source added to job ${jobId} successfully:`, updated)

    // Update job counts to refresh frontend queue status
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('❌ Failed to update job counts after adding source:', error)
    }

    return {
      success: true,
      message: `Source added to job ${jobId} successfully`,
      data: {
        job_id: updated.id,
        source_media_uuid: updated.sourceMediaUuid,
        updated_at: updated.updatedAt
      }
    }
  } catch (error: any) {
    logger.error(`❌ [API] Error adding source to job:`, error)

    // Handle different types of errors
    if (error.cause?.code === 'ECONNREFUSED') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Media Server API is not available. Please ensure the service is running.'
      })
    }

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to add source to job: ${error.message || 'Unknown error'}`
    })
  }
})
