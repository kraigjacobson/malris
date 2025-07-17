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

    console.log('Getting media info for UUID:', uuid)

    // Get runtime config for API URL
    const config = useRuntimeConfig()
    const apiUrl = config.public.apiUrl || 'http://localhost:8000'
    
    // Make request to media API to get the media record information
    const response = await fetch(`${apiUrl}/media/${uuid}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      console.error(`Media API error: ${response.status} ${response.statusText}`)
      throw createError({
        statusCode: response.status,
        statusMessage: `Media API error: ${response.statusText}`
      })
    }

    const mediaInfo = await response.json()
    
    console.log(`Successfully retrieved media info for: ${uuid}`)
    
    return mediaInfo

  } catch (error: any) {
    console.error('Error getting media info:', error)
    
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
      statusMessage: `Failed to get media info: ${error.message || 'Unknown error'}`
    })
  }
})