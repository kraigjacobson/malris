import { getContentType } from '~/server/utils/encryption'
import { logger } from '~/server/utils/logger'
import { streamMedia, getMediaInfo } from '~/server/services/hybridMediaStorage'

export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'UUID parameter is required'
      })
    }

    // Get media info first
    const mediaInfo = await getMediaInfo(uuid)
    logger.info(`Media info for ${uuid}:`, JSON.stringify(mediaInfo, null, 2))
    
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
    
    // Set content type header immediately for all requests (including HEAD)
    setHeader(event, 'Content-Type', contentType)
    setHeader(event, 'Accept-Ranges', 'bytes')
    
    // Handle HEAD requests
    if (getMethod(event) === 'HEAD') {
      setHeader(event, 'Content-Length', mediaInfo.fileSize)
      return null
    }

    // Handle range requests for video streaming
    const range = getHeader(event, 'range')
    const fileSize = mediaInfo.fileSize
    
    logger.info(`File size: ${fileSize}`)

    // Always serve full file for now - disable range requests to avoid chunk alignment issues
    {
      // Handle full file request or bytes=0- request
      logger.info(`Streaming full file for UUID: ${uuid}`)
      const streamResult = await streamMedia(uuid)
      
      if (!streamResult) {
        logger.error(`Stream result is null for full file UUID: ${uuid}`)
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to stream media data'
        })
      }

      if (!streamResult.buffer || streamResult.buffer.length === 0) {
        logger.error(`Stream result has no data for UUID: ${uuid}`)
        throw createError({
          statusCode: 500,
          statusMessage: 'No media data available'
        })
      }

      if (!streamResult.totalSize || streamResult.totalSize <= 0) {
        logger.error(`Stream result has invalid total size for UUID: ${uuid}: ${streamResult.totalSize}`)
        throw createError({
          statusCode: 500,
          statusMessage: 'Invalid media size'
        })
      }

      logger.info(`Full file stream result: ${streamResult.buffer.length} bytes returned, total size: ${streamResult.totalSize}`)
      
      // Validate that we got video data (check first few bytes for video signatures)
      const firstBytes = streamResult.buffer.slice(0, 8)
      logger.info(`First 8 bytes: ${Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}`)

      // For bytes=0- requests, return as partial content
      if (range === 'bytes=0-') {
        setResponseStatus(event, 206) // Partial Content
        setHeader(event, 'Content-Range', `bytes 0-${streamResult.totalSize - 1}/${streamResult.totalSize}`)
        setHeader(event, 'Content-Length', streamResult.totalSize)
      } else {
        // For no range header, return as full content
        setHeader(event, 'Content-Length', streamResult.totalSize)
      }
      
      setHeader(event, 'Content-Type', contentType)
      setHeader(event, 'Accept-Ranges', 'bytes')
      setHeader(event, 'Access-Control-Allow-Origin', '*')
      setHeader(event, 'Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      setHeader(event, 'Access-Control-Allow-Headers', 'Range')

      return streamResult.buffer
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