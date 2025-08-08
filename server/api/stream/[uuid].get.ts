import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { decryptMediaData, getContentType } from '~/server/utils/encryption'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'UUID parameter is required'
      })
    }

    // Get media record from database
    const db = getDb()
    const mediaRecord = await db
      .select()
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)

    if (!mediaRecord.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media not found'
      })
    }

    const record = mediaRecord[0]

    // Validate that this is a video file
    if (record.type !== 'video') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Only video files can be streamed'
      })
    }

    // Check if encrypted data exists
    if (!record.encryptedData) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media record has no encrypted data'
      })
    }

    // Get encryption key from environment
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
    if (!encryptionKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media encryption not configured'
      })
    }

    // Decrypt the data
    let decryptedData: Buffer
    try {
      decryptedData = decryptMediaData(record.encryptedData, encryptionKey)
    } catch (error) {
      logger.error('Decryption error:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to decrypt media data'
      })
    }

    // Update access tracking
    await db
      .update(mediaRecords)
      .set({
        accessCount: (record.accessCount || 0) + 1,
        lastAccessed: new Date()
      })
      .where(eq(mediaRecords.uuid, uuid))

    // Determine content type
    const contentType = getContentType(record.filename, 'video/mp4')

    // Handle range requests for video streaming
    const range = getHeader(event, 'range')
    const fileSize = decryptedData.length

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = (end - start) + 1

      // Validate range
      if (start >= fileSize || end >= fileSize) {
        setResponseStatus(event, 416) // Range Not Satisfiable
        setHeader(event, 'Content-Range', `bytes */${fileSize}`)
        return 'Range Not Satisfiable'
      }

      // Set partial content headers
      setResponseStatus(event, 206) // Partial Content
      setHeader(event, 'Content-Range', `bytes ${start}-${end}/${fileSize}`)
      setHeader(event, 'Accept-Ranges', 'bytes')
      setHeader(event, 'Content-Length', chunkSize)
      setHeader(event, 'Content-Type', contentType)

      // Return the requested chunk
      return decryptedData.subarray(start, end + 1)
    } else {
      // Return full file
      setHeader(event, 'Content-Length', fileSize)
      setHeader(event, 'Content-Type', contentType)
      setHeader(event, 'Accept-Ranges', 'bytes')

      return decryptedData
    }

  } catch (error) {
    logger.error('Stream error:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})