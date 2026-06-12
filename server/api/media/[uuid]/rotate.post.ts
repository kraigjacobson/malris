import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { getDb, getDbClient } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { retrieveMedia } from '~/server/services/hybridMediaStorage'
import { encryptChunked, getOptimalChunkSize } from '~/server/services/chunkEncryption'
import { createHash } from 'crypto'
import { logger } from '~/server/utils/logger'

/**
 * Rotate an image 90° clockwise and replace its bytes in place.
 * Keeps the same UUID so anything referencing it (jobs, thumbnails, subject grid)
 * continues to resolve.
 *
 * Currently only supports BYTEA-stored images since LOB rotation would require a
 * more involved overwrite flow — subject source images are almost always BYTEA.
 */
export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')

    if (!uuid) {
      throw createError({ statusCode: 400, statusMessage: 'UUID parameter is required' })
    }

    const db = getDb()
    const records = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, uuid)).limit(1)
    if (records.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Media not found' })
    }

    const media = records[0]
    if (media.type !== 'image') {
      throw createError({ statusCode: 400, statusMessage: 'Only images can be rotated' })
    }
    if ((media as any).storageType && (media as any).storageType !== 'bytea') {
      // Large Object rotation isn't supported yet — bail rather than silently no-op.
      throw createError({ statusCode: 400, statusMessage: 'Rotation not supported for large-object-stored images' })
    }

    const original = await retrieveMedia(uuid)
    if (!original) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve original image' })
    }

    // Rotate 90° clockwise while preserving the input format (jpeg/png/webp/etc).
    // IMPORTANT: call .rotate() with no args FIRST so sharp consumes any EXIF
    // orientation tag and produces truly upright raw pixels. Otherwise .rotate(90)
    // operates on raw bytes that may already be "visually" rotated by EXIF, and
    // strips the tag on output — which shows up as a 180°-off result.
    const rotated = await sharp(original).rotate().rotate(90).toBuffer()
    const rotatedMeta = await sharp(rotated).metadata()
    const newWidth = rotatedMeta.width ?? null
    const newHeight = rotatedMeta.height ?? null

    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY || 'default_key'
    const chunkSize = (media as any).chunkSize || getOptimalChunkSize(rotated.length)
    const encResult = await encryptChunked(rotated, encryptionKey, chunkSize)
    const encryptedData = encResult.encryptedData
    const chunkMetadata = encResult.metadata
    const fileSize = encryptedData.length
    const checksum = createHash('sha256').update(encryptedData).digest('hex')

    // Update the existing row in place so the UUID stays stable.
    const client = await getDbClient()
    try {
      await client.query(
        `UPDATE media_records
         SET encrypted_data = $1,
             file_size = $2,
             original_size = $3,
             checksum = $4,
             encryption_method = 'aes-gcm-unified',
             chunk_size = $5,
             encryption_metadata = $6,
             width = $7,
             height = $8
         WHERE uuid = $9`,
        [
          encryptedData,
          fileSize,
          fileSize,
          checksum,
          chunkMetadata.chunkSize,
          JSON.stringify(chunkMetadata),
          newWidth,
          newHeight,
          uuid
        ]
      )
    } finally {
      client.release()
    }

    logger.info(`🔄 Rotated image ${uuid} 90° CW (new dims: ${newWidth}x${newHeight})`)

    return {
      success: true,
      uuid,
      width: newWidth,
      height: newHeight,
      file_size: fileSize
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    logger.error('Failed to rotate image:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to rotate image: ${error.message || 'Unknown error'}`
    })
  }
})
