import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { decryptMediaData, getContentType } from '~/server/utils/encryption'
import sharp from 'sharp'

export default defineEventHandler(async (event) => {
  try {
    // Get the UUID from the route parameter
    const uuid = getRouterParam(event, 'uuid')
    
    if (!uuid || uuid === 'undefined' || uuid === 'null') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Valid Media UUID is required'
      })
    }

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(uuid)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid UUID format'
      })
    }

    // Get query parameters for size
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
    
    // Resize image based on size parameter
    let processedData: Buffer
    try {
      const sharpInstance = sharp(decryptedData)
      
      switch (size) {
        case 'thumbnail':
          processedData = await sharpInstance
            .resize(150, 150, {
              fit: 'cover',
              position: 'center'
            })
            .jpeg({ quality: 80 })
            .toBuffer()
          break
        case 'sm':
          processedData = await sharpInstance
            .resize(300, 300, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: 85 })
            .toBuffer()
          break
        case 'md':
          processedData = await sharpInstance
            .resize(600, 600, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: 90 })
            .toBuffer()
          break
        case 'lg':
          processedData = await sharpInstance
            .resize(1200, 1200, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: 95 })
            .toBuffer()
          break
        case 'full':
        default:
          // Return original size but optimize
          processedData = await sharpInstance
            .jpeg({ quality: 95 })
            .toBuffer()
          break
      }
    } catch (error) {
      console.error('Image processing error:', error)
      // Fallback to original data if processing fails
      processedData = decryptedData
    }
    
    // Determine content type - always JPEG for processed images
    const contentType = size === 'full' ? getContentType(record.filename, 'image/jpeg') : 'image/jpeg'
    
    // Set response headers for inline display
    setHeader(event, 'content-type', contentType)
    setHeader(event, 'content-disposition', 'inline')
    setHeader(event, 'cache-control', 'public, max-age=3600')
    setHeader(event, 'access-control-allow-origin', '*')
    setHeader(event, 'access-control-allow-methods', 'GET')
    
    return processedData

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