export default defineEventHandler(async (_event) => {
  try {
    console.log('Checking media API health...')

    // Test connection to media API
    const response = await $fetch('http://localhost:8000/health', {
      method: 'GET',
      timeout: 5000
    })

    console.log('Media API health response:', response)

    return {
      status: 'healthy',
      mediaApi: response,
      message: 'Media API is accessible'
    }

  } catch (error: any) {
    console.error('Media API health check failed:', error)
    
    // Handle different types of errors
    if (error.cause?.code === 'ECONNREFUSED') {
      return {
        status: 'unhealthy',
        error: 'Media API is not running on localhost:8000',
        suggestion: 'Start the media API server'
      }
    }
    
    if (error.cause?.code === 'ETIMEDOUT') {
      return {
        status: 'unhealthy',
        error: 'Media API connection timed out',
        suggestion: 'Check if the media API is responding'
      }
    }

    return {
      status: 'unhealthy',
      error: error.message || 'Unknown error',
      details: error.statusText || 'Media API returned an error'
    }
  }
})