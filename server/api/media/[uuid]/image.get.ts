import { getContentType } from '~/server/utils/encryption'
import { retrieveMedia, getMediaInfo } from '~/server/services/hybridMediaStorage'
import sharp from 'sharp'
import { logger } from '~/server/utils/logger'

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

    // Get media info first
    const mediaInfo = await getMediaInfo(uuid)
    
    if (!mediaInfo) {
      logger.error(`🖼️ Media record not found for UUID: ${uuid}`)
      throw createError({
        statusCode: 404,
        statusMessage: 'Media not found'
      })
    }
    
    // Verify it's an image or video (for thumbnails)
    if (!['image', 'video'].includes(mediaInfo.type)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Media type not supported for image endpoint'
      })
    }

    // Retrieve and decrypt the data using hybrid storage
    let decryptedData: Buffer | null
    try {
      decryptedData = await retrieveMedia(uuid)
    } catch (error) {
      logger.error('Decryption error:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to decrypt media data'
      })
    }

    if (!decryptedData) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media data not found'
      })
    }
    
    // Resize image based on size parameter
    let processedData: Buffer
    try {
      const sharpInstance = sharp(decryptedData)
      
      switch (size) {
        case 'thumbnail':
          processedData = await sharpInstance
            .resize(150, 200, {
              fit: 'cover',
              position: 'top'
            })
            .jpeg({ quality: 80 })
            .toBuffer()
          break
        case 'sm':
          processedData = await sharpInstance
            .resize(300, 400, {
              fit: 'cover',
              position: 'top'
            })
            .jpeg({ quality: 85 })
            .toBuffer()
          break
        case 'md':
          processedData = await sharpInstance
            .resize(600, 800, {
              fit: 'cover',
              position: 'top'
            })
            .jpeg({ quality: 90 })
            .toBuffer()
          break
        case 'lg':
          processedData = await sharpInstance
            .resize(1200, 1600, {
              fit: 'cover',
              position: 'top'
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
      logger.error('Image processing error:', error)
      // Fallback to original data if processing fails
      processedData = decryptedData
    }
    
    // Determine content type - always JPEG for processed images
    const contentType = size === 'full' ? getContentType(mediaInfo.filename, 'image/jpeg') : 'image/jpeg'
    
    // Set response headers for inline display
    setHeader(event, 'content-type', contentType)
    setHeader(event, 'content-disposition', 'inline')
    setHeader(event, 'cache-control', 'public, max-age=3600')
    setHeader(event, 'access-control-allow-origin', '*')
    setHeader(event, 'access-control-allow-methods', 'GET')
    
    return processedData

  } catch (error: any) {
    logger.error('Error serving image:', error)
    
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