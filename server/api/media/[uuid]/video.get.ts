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

    // Get query parameters for size
    const query = getQuery(event)
    const size = query.size || 'md' // Default to medium size

    console.log('Serving video for UUID:', uuid, 'size:', size)

    // Make request to media API to get the video file stream
    const response = await fetch(`http://localhost:8000/media/${uuid}/download?size=${size}`, {
      method: 'GET',
      headers: {
        'Accept': 'video/*'
      }
    })

    if (!response.ok) {
      console.error(`Media API error: ${response.status} ${response.statusText}`)
      throw createError({
        statusCode: response.status,
        statusMessage: `Media API error: ${response.statusText}`
      })
    }

    // Get the video data as buffer
    const buffer = await response.arrayBuffer()
    
    if (buffer.byteLength === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Video data is empty'
      })
    }

    // Determine content type based on the first few bytes or default to mp4
    let contentType = 'video/mp4'
    const uint8Array = new Uint8Array(buffer)
    
    // Check for MP4 signature (ftyp box)
    if (uint8Array[4] === 0x66 && uint8Array[5] === 0x74 && uint8Array[6] === 0x79 && uint8Array[7] === 0x70) {
      contentType = 'video/mp4'
    }
    // Check for WebM signature
    else if (uint8Array[0] === 0x1A && uint8Array[1] === 0x45 && uint8Array[2] === 0xDF && uint8Array[3] === 0xA3) {
      contentType = 'video/webm'
    }
    // Check for AVI signature
    else if (uint8Array[8] === 0x41 && uint8Array[9] === 0x56 && uint8Array[10] === 0x49 && uint8Array[11] === 0x20) {
      contentType = 'video/avi'
    }
    
    // Set response headers for inline display
    setHeader(event, 'content-type', contentType)
    setHeader(event, 'content-disposition', 'inline')
    setHeader(event, 'cache-control', 'public, max-age=3600')
    setHeader(event, 'access-control-allow-origin', '*')
    setHeader(event, 'access-control-allow-methods', 'GET')
    setHeader(event, 'accept-ranges', 'bytes')
    
    console.log(`Successfully serving video: ${uuid}, size: ${size}, type: ${contentType}, bytes: ${buffer.byteLength}`)
    
    return buffer

  } catch (error: any) {
    console.error('Error serving video:', error)
    
    // Handle different types of errors
    if (error.cause?.code === 'ECONNREFUSED') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Media API is not available. Please ensure the service is running on localhost:8000'
      })
    }
    
    if (error.cause?.code === 'ETIMEDOUT') {
      throw createError({
        statusCode: 504,
        statusMessage: 'Request to Media API timed out.'
      })
    }

    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to serve video: ${error.message || 'Unknown error'}`
    })
  }
})