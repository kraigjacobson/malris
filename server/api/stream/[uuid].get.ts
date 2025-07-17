export default defineEventHandler(async (event) => {
  try {
    // Get the UUID from the route parameter
    const uuid = getRouterParam(event, 'uuid')
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Video UUID is required'
      })
    }

    // Get range header from the request
    const rangeHeader = getHeader(event, 'range')

    // Prepare headers for the media API request
    const headers: Record<string, string> = {
      'Accept': 'video/*'
    }

    // Forward range header if present
    if (rangeHeader) {
      headers['Range'] = rangeHeader
    }

    // Get runtime config for API URL
    const config = useRuntimeConfig()
    const apiUrl = config.public.apiUrl || 'http://localhost:8000'
    
    // Make request to media API streaming endpoint
    const response = await fetch(`${apiUrl}/stream/${uuid}`, {
      method: 'GET',
      headers
    })

    if (!response.ok) {
      console.error(`Media API streaming error: ${response.status} ${response.statusText}`)
      throw createError({
        statusCode: response.status,
        statusMessage: `Media API streaming error: ${response.statusText}`
      })
    }

    // Forward all relevant headers from the media API response
    const contentType = response.headers.get('content-type') || 'video/mp4'
    const contentLength = response.headers.get('content-length')
    const contentRange = response.headers.get('content-range')
    const acceptRanges = response.headers.get('accept-ranges')

    // Set response headers
    setHeader(event, 'content-type', contentType)
    setHeader(event, 'cache-control', 'public, max-age=3600')
    setHeader(event, 'access-control-allow-origin', '*')
    setHeader(event, 'access-control-allow-methods', 'GET')
    
    if (contentLength) {
      setHeader(event, 'content-length', parseInt(contentLength))
    }
    
    if (contentRange) {
      setHeader(event, 'content-range', contentRange)
    }
    
    if (acceptRanges) {
      setHeader(event, 'accept-ranges', acceptRanges)
    }

    // Set status code (206 for partial content if range request)
    if (rangeHeader && response.status === 206) {
      setResponseStatus(event, 206)
    }
    
    // Stream the response directly without buffering
    if (!response.body) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Video stream is empty'
      })
    }
    
    return sendStream(event, response.body)

  } catch (error: any) {
    console.error('Error streaming video:', error)
    
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
      statusMessage: `Failed to stream video: ${error.message || 'Unknown error'}`
    })
  }
})