export default defineEventHandler(async (event) => {
  try {
    // Get query parameters from the request
    const query = getQuery(event)
    
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
    const apiUrl = config.public.apiUrl || 'http://media-app:8000'
    
    // Build query string from parameters
    const queryString = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined) {
        queryString.append(key, String(value))
      }
    }
    
    // Make request to media API random streaming endpoint
    const url = `${apiUrl}/stream/random${queryString.toString() ? `?${queryString.toString()}` : ''}`
    console.log('Proxying random stream request to:', url)
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    })

    if (!response.ok) {
      console.error(`Media API random streaming error: ${response.status} ${response.statusText}`)
      throw createError({
        statusCode: response.status,
        statusMessage: `Media API random streaming error: ${response.statusText}`
      })
    }

    // Forward all relevant headers from the media API response
    const contentType = response.headers.get('content-type') || 'video/mp4'
    const contentLength = response.headers.get('content-length')
    const contentRange = response.headers.get('content-range')
    const acceptRanges = response.headers.get('accept-ranges')
    const videoUuid = response.headers.get('x-video-uuid') || response.headers.get('video-uuid')
    
    // Log content type for debugging
    console.log('🎬 Streaming video with content-type:', contentType, 'UUID:', videoUuid || 'unknown')

    // Set response headers with mobile-friendly settings
    setHeader(event, 'content-type', contentType)
    setHeader(event, 'cache-control', 'public, max-age=3600')
    setHeader(event, 'access-control-allow-origin', '*')
    setHeader(event, 'access-control-allow-methods', 'GET')
    setHeader(event, 'access-control-allow-headers', 'Range')
    // Mobile-specific headers for better video streaming
    setHeader(event, 'x-content-type-options', 'nosniff')
    setHeader(event, 'vary', 'Accept-Encoding')
    
    if (contentLength) {
      setHeader(event, 'content-length', parseInt(contentLength))
    }
    
    if (contentRange) {
      setHeader(event, 'content-range', contentRange)
    }
    
    if (acceptRanges) {
      setHeader(event, 'accept-ranges', acceptRanges)
    }
    
    if (videoUuid) {
      setHeader(event, 'x-video-uuid', videoUuid)
      console.log('🎬 Streaming video UUID:', videoUuid)
    }

    // Set status code (206 for partial content if range request)
    if (rangeHeader && response.status === 206) {
      setResponseStatus(event, 206)
    }
    
    // Stream the response directly without buffering
    if (!response.body) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Random video stream is empty'
      })
    }
    
    return sendStream(event, response.body)

  } catch (error: any) {
    console.error('Error streaming random video:', error)
    
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
      statusMessage: `Failed to stream random video: ${error.message || 'Unknown error'}`
    })
  }
})