export default defineEventHandler(async (_event) => {
  try {
    console.log('🔄 [API] Starting /api/jobs request...')
    const startTime = Date.now()
    
    // Get media server URL from runtime config
    const config = useRuntimeConfig()
    const mediaServerUrl = config.public.apiUrl || 'http://localhost:8000'
    
    console.log(`🌐 [API] Calling: ${mediaServerUrl}/jobs/queue/status`)

    // Use native fetch instead of $fetch (like the working media endpoints)
    const response = await fetch(`${mediaServerUrl}/jobs/queue/status`, {
      method: 'GET'
    })

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: `Media Server API error: ${response.statusText}`
      })
    }

    const jsonResponse = await response.json()
    console.log(`✅ [API] Queue status fetched in ${Date.now() - startTime}ms`)
    return jsonResponse

  } catch (error: any) {
    console.error('❌ [API] Error fetching jobs from Media Server API:', error)
    
    // Handle different types of errors
    if (error.cause?.code === 'ECONNREFUSED') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Media Server API is not available. Please ensure the service is running.'
      })
    }
    
    if (error.cause?.code === 'ETIMEDOUT') {
      throw createError({
        statusCode: 504,
        statusMessage: 'Request to Media Server API timed out. The service may be overloaded.'
      })
    }

    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch jobs: ${error.message || 'Unknown error'}`
    })
  }
})