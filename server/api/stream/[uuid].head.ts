import { getContentType } from '~/server/utils/encryption'
import { logger } from '~/server/utils/logger'
import { getMediaInfo } from '~/server/services/hybridMediaStorage'

export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    const userAgent = getHeader(event, 'user-agent') || 'unknown'
    const referer = getHeader(event, 'referer') || 'direct'
    
    logger.info(`🎬 HEAD Stream Request - UUID: ${uuid}, User-Agent: ${userAgent.substring(0, 50)}..., Referer: ${referer}`)
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'UUID parameter is required'
      })
    }

    // Get media info first
    const mediaInfo = await getMediaInfo(uuid)
    logger.info(`📊 HEAD request - Media info for ${uuid}:`, JSON.stringify(mediaInfo, null, 2))
    
    if (!mediaInfo) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media not found'
      })
    }

    // Validate that this is a video file
    if (mediaInfo.type !== 'video') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Only video files can be streamed'
      })
    }

    // Determine content type
    const contentType = getContentType(mediaInfo.filename, 'video/mp4')
    
    // Handle range requests for HEAD
    const range = getHeader(event, 'range')
    const fileSize = mediaInfo.fileSize // Now this is the decrypted file size
    
    logger.info(`📏 HEAD request - Decrypted file size: ${fileSize}, Encrypted size: ${mediaInfo.encryptedSize}, Range header: ${range || 'NONE'}`)

    // Parse range header if present
    let rangeStart = 0
    let rangeEnd = fileSize - 1
    let isRangeRequest = false

    if (range) {
      const rangeMatch = range.match(/bytes=(\d+)-(\d*)/)
      if (rangeMatch) {
        isRangeRequest = true
        rangeStart = parseInt(rangeMatch[1], 10)
        rangeEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1
        
        // Validate range against decrypted file size
        if (rangeStart >= fileSize || rangeEnd >= fileSize || rangeStart > rangeEnd) {
          logger.error(`❌ HEAD Invalid range: ${rangeStart}-${rangeEnd} for decrypted file size ${fileSize}`)
          throw createError({
            statusCode: 416,
            statusMessage: 'Range Not Satisfiable'
          })
        }
        
        const requestSize = rangeEnd - rangeStart + 1
        const percentOfFile = ((requestSize / fileSize) * 100).toFixed(1)
        logger.info(`🎯 HEAD Range request: ${rangeStart}-${rangeEnd} (${requestSize} bytes = ${percentOfFile}% of decrypted file)`)
      } else {
        logger.warn(`⚠️ HEAD Invalid range header format: ${range}`)
      }
    } else {
      logger.info(`📁 HEAD Full file request (no range header)`)
    }

    // Set appropriate response headers for HEAD
    setHeader(event, 'Content-Type', contentType)
    setHeader(event, 'Accept-Ranges', 'bytes')
    setHeader(event, 'Access-Control-Allow-Origin', '*')
    setHeader(event, 'Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    setHeader(event, 'Access-Control-Allow-Headers', 'Range')
    
    if (isRangeRequest) {
      setResponseStatus(event, 206) // Partial Content
      setHeader(event, 'Content-Range', `bytes ${rangeStart}-${rangeEnd}/${fileSize}`)
      setHeader(event, 'Content-Length', rangeEnd - rangeStart + 1)
      logger.info(`✅ HEAD responding with 206 Partial Content: ${rangeEnd - rangeStart + 1} bytes (${rangeStart}-${rangeEnd}/${fileSize})`)
    } else {
      // Don't set status for HEAD requests, let Nuxt handle it
      setHeader(event, 'Content-Length', fileSize)
      logger.info(`✅ HEAD responding with 200 OK: Content-Length ${fileSize}`)
    }
    
    logger.info(`✅ HEAD response headers set:`)
    logger.info(`   Content-Type: ${contentType}`)
    logger.info(`   Accept-Ranges: bytes`)
    logger.info(`🚀 HEAD response complete for ${uuid}`)
    
    // Explicitly set status and return empty response for HEAD
    setResponseStatus(event, 200)
    return ''

  } catch (error) {
    logger.error('HEAD Stream error:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})