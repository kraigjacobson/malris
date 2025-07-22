import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { decryptMediaData, getContentType } from '~/server/utils/encryption'

export default defineEventHandler(async (event) => {
  try {
    // Get the UUID from the route parameter
    const uuid = getRouterParam(event, 'uuid')
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Media UUID is required'
      })
    }

    // Get query parameters for size (currently not used but kept for future implementation)
    const query = getQuery(event)
    const size = query.size || 'md'

    console.log('🖼️ Serving image for UUID:', uuid, 'size:', size)

    // Get database connection
    const db = getDb()
    
    // Fetch media record from database
    const mediaRecord = await db
      .select()
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)

    if (!mediaRecord || mediaRecord.length === 0) {
      console.error(`🖼️ Media record not found for UUID: ${uuid}`)
      throw createError({
        statusCode: 404,
        statusMessage: 'Media not found'
      })
    }

    const record = mediaRecord[0]
    
    // Verify it's an image or video (for thumbnails)
    if (!['image', 'video'].includes(record.type)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Media type not supported for image endpoint'
      })
    }

    // Check if encrypted data exists
    if (!record.encryptedData) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media data not found'
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
      console.error('Decryption error:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to decrypt media data'
      })
    }
    
    // Determine content type based on file extension
    const contentType = getContentType(record.filename, 'image/jpeg')
    
    // Set response headers for inline display
    setHeader(event, 'content-type', contentType)
    setHeader(event, 'content-disposition', 'inline')
    setHeader(event, 'cache-control', 'public, max-age=3600')
    setHeader(event, 'access-control-allow-origin', '*')
    setHeader(event, 'access-control-allow-methods', 'GET')
    
    console.log(`🖼️ Successfully serving image: ${uuid}, size: ${size}, type: ${contentType}, bytes: ${decryptedData.length}`)
    
    return decryptedData

  } catch (error: any) {
    console.error('Error serving image:', error)
    
    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to serve image: ${error.message || 'Unknown error'}`
    })
  }
})