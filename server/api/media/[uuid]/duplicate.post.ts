import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async event => {
  try {
    const uuid = getRouterParam(event, 'uuid')

    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'UUID is required'
      })
    }

    const db = getDb()

    const existingMedia = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, uuid)).limit(1)

    if (!existingMedia || existingMedia.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media not found'
      })
    }

    const original = existingMedia[0]

    const newFilename = `${original.filename.replace(/(\.[^.]+)$/, '_copy$1')}`

    const duplicatedMedia = await db
      .insert(mediaRecords)
      .values({
        filename: newFilename,
        type: original.type,
        purpose: original.purpose,
        status: original.status,
        fileSize: original.fileSize,
        originalSize: original.originalSize,
        width: original.width,
        height: original.height,
        duration: original.duration,
        fps: original.fps,
        codec: original.codec,
        bitrate: original.bitrate,
        metadata: original.metadata,
        tags: original.tags,
        tagsConfirmed: original.tagsConfirmed,
        subjectUuid: original.subjectUuid,
        sourceMediaUuidRef: original.sourceMediaUuidRef,
        destMediaUuidRef: original.destMediaUuidRef,
        jobId: original.jobId,
        thumbnailUuid: null,
        encryptedData: original.encryptedData,
        checksum: original.checksum,
        storageType: original.storageType,
        largeObjectOid: original.largeObjectOid,
        sizeThreshold: original.sizeThreshold,
        encryptionMethod: original.encryptionMethod,
        chunkSize: original.chunkSize,
        encryptionMetadata: original.encryptionMetadata,
        rating: original.rating,
        completions: 0
      })
      .returning()

    if (!duplicatedMedia || duplicatedMedia.length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create duplicate media record'
      })
    }

    const newMediaUuid = duplicatedMedia[0].uuid

    if (original.thumbnailUuid) {
      const thumbnailRecord = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, original.thumbnailUuid)).limit(1)

      if (thumbnailRecord && thumbnailRecord.length > 0) {
        const thumb = thumbnailRecord[0]

        const duplicatedThumbnail = await db
          .insert(mediaRecords)
          .values({
            filename: `${thumb.filename.replace(/(\.[^.]+)$/, '_copy$1')}`,
            type: thumb.type,
            purpose: thumb.purpose,
            status: thumb.status,
            fileSize: thumb.fileSize,
            originalSize: thumb.originalSize,
            width: thumb.width,
            height: thumb.height,
            duration: thumb.duration,
            fps: thumb.fps,
            codec: thumb.codec,
            bitrate: thumb.bitrate,
            metadata: thumb.metadata,
            tags: thumb.tags,
            tagsConfirmed: thumb.tagsConfirmed,
            subjectUuid: thumb.subjectUuid,
            sourceMediaUuidRef: thumb.sourceMediaUuidRef,
            destMediaUuidRef: thumb.destMediaUuidRef,
            jobId: thumb.jobId,
            thumbnailUuid: null,
            encryptedData: thumb.encryptedData,
            checksum: thumb.checksum,
            storageType: thumb.storageType,
            largeObjectOid: thumb.largeObjectOid,
            sizeThreshold: thumb.sizeThreshold,
            encryptionMethod: thumb.encryptionMethod,
            chunkSize: thumb.chunkSize,
            encryptionMetadata: thumb.encryptionMetadata,
            rating: null,
            completions: 0
          })
          .returning()

        if (duplicatedThumbnail && duplicatedThumbnail.length > 0) {
          await db.update(mediaRecords).set({ thumbnailUuid: duplicatedThumbnail[0].uuid }).where(eq(mediaRecords.uuid, newMediaUuid))

          duplicatedMedia[0].thumbnailUuid = duplicatedThumbnail[0].uuid
        }
      }
    }

    return {
      success: true,
      message: 'Media duplicated successfully',
      duplicatedMedia: duplicatedMedia[0]
    }
  } catch (error: any) {
    logger.error('Error duplicating media:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to duplicate media: ${error.message || 'Unknown error'}`
    })
  }
})
