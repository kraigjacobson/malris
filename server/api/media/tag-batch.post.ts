/**
 * Tag a specific list of media items (POST { media_uuids: string[] }).
 *
 * The UI uses this when the user explicitly selects which images/videos to
 * tag (e.g. the Tagging job-type modal). Untagged-sweep semantics live in
 * tag-all-untagged.post.ts; this endpoint just tags exactly what it's told.
 */
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { logger } from '~/server/utils/logger'
import { collectImagesForTagging, dispatchTaggingBatch } from '~/server/utils/tagging'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event).catch(() => ({}))
    const mediaUuids: string[] = Array.isArray(body?.media_uuids) ? body.media_uuids : []
    const dryRun: boolean = body?.dryRun === true

    if (mediaUuids.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'media_uuids must be a non-empty array of media UUIDs'
      })
    }

    logger.info(`🏷️ tag-batch: queueing ${mediaUuids.length} media items${dryRun ? ' (DRY RUN)' : ''}`)

    const db = getDb()

    // Fetch the requested records. Only the fields collectImagesForTagging needs.
    const records = await db
      .select({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename,
        type: mediaRecords.type,
        purpose: mediaRecords.purpose,
        thumbnailUuid: mediaRecords.thumbnailUuid
      })
      .from(mediaRecords)
      .where(inArray(mediaRecords.uuid, mediaUuids))

    if (records.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'None of the requested media UUIDs exist'
      })
    }

    const missing = mediaUuids.length - records.length
    if (missing > 0) {
      logger.warn(`⚠️ tag-batch: ${missing} requested UUIDs not found in DB`)
    }

    const images = await collectImagesForTagging(records as any)
    logger.info(`🖼️ tag-batch: collected ${images.length} image(s) ready to tag`)

    if (images.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No taggable image data could be retrieved for the requested media'
      })
    }

    const result = await dispatchTaggingBatch(images, db, { dryRun })
    if (!result.success) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to submit batch for tagging'
      })
    }

    return {
      success: true,
      count: images.length,
      requested: mediaUuids.length,
      skipped: mediaUuids.length - images.length,
      job_id: result.jobId,
      message: `Started tagging ${images.length} item${images.length !== 1 ? 's' : ''}.${missing > 0 ? ` ${missing} UUID(s) not found.` : ''}`
    }
  } catch (error: any) {
    logger.error('❌ Error in tag-batch:', error)
    if (error?.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to start batch tagging'
    })
  }
})
