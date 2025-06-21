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

    // Make request to media API
    const response = await $fetch(`http://localhost:8000/media/${uuid}`, {
      method: 'GET',
      timeout: 10000
    })

    return response

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