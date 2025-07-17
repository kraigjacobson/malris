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

    console.log('Deleting media for UUID:', uuid)

    // Get runtime config for API URL
    const config = useRuntimeConfig()
    const apiUrl = config.public.apiUrl || 'http://localhost:8000'
    
    // Make request to media API to delete the media
    const response = await $fetch(`${apiUrl}/media/${uuid}`, {
      method: 'DELETE',
      timeout: 10000
    })

    console.log('Media deletion response:', response)

    return {
      success: true,
      message: 'Media deleted successfully',
      uuid: uuid
    }

  } catch (error: any) {
    console.error('Error deleting media:', error)
    
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
      statusMessage: `Failed to delete media: ${error.message || 'Unknown error'}`
    })
  }
})