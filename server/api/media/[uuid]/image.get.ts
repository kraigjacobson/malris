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
    const size = query.size || 'md' // Default to medium size for thumbnails

    console.log('Serving image for UUID:', uuid, 'size:', size)

    // Make request to media API to get the file stream with size parameter
    const response = await fetch(`http://localhost:8000/media/${uuid}/download?size=${size}`, {
      method: 'GET',
      headers: {
        'Accept': 'image/*'
      }
    })

    if (!response.ok) {
      console.error(`Media API error: ${response.status} ${response.statusText}`)
      throw createError({
        statusCode: response.status,
        statusMessage: `Media API error: ${response.statusText}`
      })
    }

    // Get content type from response headers
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    
    // Get the image data as buffer
    const buffer = await response.arrayBuffer()
    
    if (buffer.byteLength === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Image data is empty'
      })
    }
    
    // Set response headers for inline display
    setHeader(event, 'content-type', contentType)
    setHeader(event, 'content-disposition', 'inline')
    setHeader(event, 'cache-control', 'public, max-age=3600')
    setHeader(event, 'access-control-allow-origin', '*')
    setHeader(event, 'access-control-allow-methods', 'GET')
    
    console.log(`Successfully serving image: ${uuid}, size: ${size}, type: ${contentType}, bytes: ${buffer.byteLength}`)
    
    // Convert ArrayBuffer to Buffer for proper binary response
    return Buffer.from(buffer)

  } catch (error: any) {
    console.error('Error serving image:', error)
    
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
      statusMessage: `Failed to serve image: ${error.message || 'Unknown error'}`
    })
  }
})