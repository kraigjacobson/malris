import { getContentType } from '~/server/utils/encryption'
import { logger } from '~/server/utils/logger'
import { streamMedia, getMediaInfo } from '~/server/services/hybridMediaStorage'

export default defineEventHandler(async event => {
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

    // Handle range requests for video streaming
    const range = getHeader(event, 'range')
    const fileSize = mediaInfo.fileSize // Now this is the decrypted file size

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

        // Ensure range doesn't exceed file boundaries
        rangeStart = Math.max(0, Math.min(rangeStart, fileSize - 1))
        rangeEnd = Math.max(rangeStart, Math.min(rangeEnd, fileSize - 1))

        // Aggressive chunk limiting for smooth streaming
        const MAX_CHUNK_SIZE = 4 * 1024 * 1024 // 4MB max per request
        const originalRequestSize = rangeEnd - rangeStart + 1

        // Always limit chunk size to prevent long delays
        if (originalRequestSize > MAX_CHUNK_SIZE) {
          rangeEnd = rangeStart + MAX_CHUNK_SIZE - 1
          // Ensure we don't exceed file size after limiting
          rangeEnd = Math.min(rangeEnd, fileSize - 1)
        }

        // Validate range against decrypted file size
        if (rangeStart >= fileSize || rangeEnd >= fileSize || rangeStart > rangeEnd) {
          logger.error(`❌ Invalid range: ${rangeStart}-${rangeEnd} for decrypted file size ${fileSize}`)
          throw createError({
            statusCode: 416,
            statusMessage: 'Range Not Satisfiable'
          })
        }
      } else {
        logger.warn(`⚠️ Invalid range header format: ${range}`)
      }
    } else {
      // For no range header, limit to first chunk to encourage range requests
      rangeEnd = Math.min(4 * 1024 * 1024 - 1, fileSize - 1) // 4MB max
      logger.info(`📁 Full file request limited to first ${rangeEnd + 1} bytes to encourage range requests`)
    }

    // Handle HEAD requests (after parsing range for proper headers)
    if (event.method === 'HEAD') {
      if (isRangeRequest) {
        setResponseStatus(event, 206) // Partial Content
        setHeader(event, 'Content-Range', `bytes ${rangeStart}-${rangeEnd}/${fileSize}`)
        setHeader(event, 'Content-Length', rangeEnd - rangeStart + 1)
      } else {
        setHeader(event, 'Content-Length', fileSize)
      }
      setHeader(event, 'Access-Control-Allow-Origin', '*')
      setHeader(event, 'Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      setHeader(event, 'Access-Control-Allow-Headers', 'Range')
      return null
    }

    // Stream with range support for efficient chunked decryption
    let streamResult
    if (isRangeRequest) {
      // Handle range request with chunked streaming
      streamResult = await streamMedia(uuid, { start: rangeStart, end: rangeEnd, size: rangeEnd - rangeStart + 1 })
    } else {
      // Handle full file request
      streamResult = await streamMedia(uuid)
    }

    if (!streamResult) {
      logger.error(`Stream result is null for UUID: ${uuid}`)
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

    // Set appropriate response headers
    if (isRangeRequest) {
      setResponseStatus(event, 206) // Partial Content
      // Calculate the actual end position based on what we returned
      const actualRangeEnd = rangeStart + streamResult.buffer.length - 1
      setHeader(event, 'Content-Range', `bytes ${rangeStart}-${actualRangeEnd}/${streamResult.totalSize}`)
      setHeader(event, 'Content-Length', streamResult.buffer.length)
    } else {
      // For no range header, return as full content
      setHeader(event, 'Content-Length', streamResult.buffer.length)
    }

    setHeader(event, 'Content-Type', contentType)
    setHeader(event, 'Accept-Ranges', 'bytes')
    setHeader(event, 'Access-Control-Allow-Origin', '*')
    setHeader(event, 'Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    setHeader(event, 'Access-Control-Allow-Headers', 'Range')

    return streamResult.buffer
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
