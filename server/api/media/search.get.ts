export default defineEventHandler(async (event) => {
  try {
    // Get query parameters
    const query = getQuery(event)
    
    // Build query string for the media API
    const searchParams = new URLSearchParams()
    
    if (query.media_type) searchParams.append('media_type', query.media_type as string)
    if (query.purpose) searchParams.append('purpose', query.purpose as string)
    if (query.status) searchParams.append('status', query.status as string)
    if (query.tags) searchParams.append('tags', query.tags as string)
    if (query.filename_pattern) searchParams.append('filename_pattern', query.filename_pattern as string)
    if (query.limit) searchParams.append('limit', query.limit as string)
    if (query.offset) searchParams.append('offset', query.offset as string)

    console.log('Searching media with params:', Object.fromEntries(searchParams))

    // First check if media API is healthy
    try {
      await $fetch('http://localhost:8000/health', {
        method: 'GET',
        timeout: 5000
      })
    } catch (healthError: any) {
      console.error('Media API health check failed:', healthError)
      throw createError({
        statusCode: 503,
        statusMessage: 'Media API is not available. Please ensure the service is running on localhost:8000'
      })
    }

    // Make request to media API
    const response = await $fetch(`http://localhost:8000/media/search?${searchParams.toString()}`, {
      method: 'GET',
      timeout: 10000
    })

    return response

  } catch (error: any) {
    console.error('Error searching media:', error)
    
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
      statusMessage: `Failed to search media: ${error.message || 'Unknown error'}`
    })
  }
})