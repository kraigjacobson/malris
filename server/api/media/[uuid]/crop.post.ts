import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { getDb, getDbClient } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { retrieveMedia } from '~/server/services/hybridMediaStorage'
import { encryptChunked, getOptimalChunkSize } from '~/server/services/chunkEncryption'
import { createHash } from 'crypto'
import { logger } from '~/server/utils/logger'

/**
 * Crop an image using pixel coords and replace its bytes in place.
 * Body: { x: number, y: number, width: number, height: number } — all in the
 * image's native pixel space (sharp will clamp to within bounds).
 *
 * BYTEA-only for now (same story as the rotate endpoint — subject source images
 * are almost always BYTEA).
 */
export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    if (!uuid) {
      throw createError({ statusCode: 400, statusMessage: 'UUID parameter is required' })
    }

    const body = await readBody(event)
    const x = Math.round(Number(body?.x))
    const y = Math.round(Number(body?.y))
    const width = Math.round(Number(body?.width))
    const height = Math.round(Number(body?.height))

    if (
      !Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(width) || !Number.isFinite(height) ||
      width <= 0 || height <= 0 || x < 0 || y < 0
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid crop region — need positive x, y, width, height'
      })
    }

    const db = getDb()
    const records = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, uuid)).limit(1)
    if (records.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Media not found' })
    }

    const media = records[0]
    if (media.type !== 'image') {
      throw createError({ statusCode: 400, statusMessage: 'Only images can be cropped' })
    }
    if ((media as any).storageType && (media as any).storageType !== 'bytea') {
      throw createError({ statusCode: 400, statusMessage: 'Crop not supported for large-object-stored images' })
    }

    const original = await retrieveMedia(uuid)
    if (!original) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve original image' })
    }

    // Normalize EXIF orientation into the pixels first (same reason as rotate:
    // we want to crop in the coordinate space the user actually sees).
    const oriented = sharp(original).rotate()
    const meta = await oriented.metadata()
    const srcW = meta.width ?? 0
    const srcH = meta.height ?? 0
    if (!srcW || !srcH) {
      throw createError({ statusCode: 500, statusMessage: 'Could not determine source image dimensions' })
    }

    // Clamp the crop region inside the source so sharp doesn't throw on a 1px overshoot.
    const left = Math.min(Math.max(0, x), Math.max(0, srcW - 1))
    const top = Math.min(Math.max(0, y), Math.max(0, srcH - 1))
    const w = Math.min(width, srcW - left)
    const h = Math.min(height, srcH - top)
    if (w <= 0 || h <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'Crop region is outside the image' })
    }

    const cropped = await sharp(original)
      .rotate()
      .extract({ left, top, width: w, height: h })
      .toBuffer()

    const outMeta = await sharp(cropped).metadata()
    const newWidth = outMeta.width ?? w
    const newHeight = outMeta.height ?? h

    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY || 'default_key'
    const chunkSize = (media as any).chunkSize || getOptimalChunkSize(cropped.length)
    const encResult = await encryptChunked(cropped, encryptionKey, chunkSize)
    const encryptedData = encResult.encryptedData
    const chunkMetadata = encResult.metadata
    const fileSize = encryptedData.length
    const checksum = createHash('sha256').update(encryptedData).digest('hex')

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
             height = $8,
             -- A crop changes the pixels and the framing, so every pixel-derived
             -- analysis is now stale. NULL the markers so each backfill sweep
             -- re-analyzes this row (they all select WHERE <field>_at IS NULL):
             -- sharpness, Florence caption, face embedding, perceptual hashes.
             sharpness = NULL, sharpness_at = NULL,
             caption = NULL, caption_at = NULL,
             face_embedding = NULL, face_embedded_at = NULL,
             dhash = NULL, phash = NULL, tile_hashes = NULL, perceptual_hashed_at = NULL
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

    logger.info(`✂️ Cropped image ${uuid} to ${w}x${h} @(${left},${top}) — new dims ${newWidth}x${newHeight}`)

    return {
      success: true,
      uuid,
      width: newWidth,
      height: newHeight,
      file_size: fileSize
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    logger.error('Failed to crop image:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to crop image: ${error.message || 'Unknown error'}`
    })
  }
})
