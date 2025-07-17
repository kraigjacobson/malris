export default defineEventHandler(async (event) => {
  try {
    // Get the job ID from the route parameters
    const jobId = getRouterParam(event, 'id')
    
    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required'
      })
    }

    // Get the media server URL from runtime config
    const config = useRuntimeConfig()
    const mediaServerUrl = config.public.apiUrl || 'http://localhost:8000'
    
    console.log(`🗑️ Deleting job ${jobId} via media server at ${mediaServerUrl}...`)
    console.log(`🔗 Full URL: ${mediaServerUrl}/jobs/${jobId}`)
    
    // Make the DELETE request to the media server
    const response = await fetch(`${mediaServerUrl}/jobs/${jobId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    
    console.log('✅ Job deleted successfully:', data)
    
    return {
      success: true,
      message: `Job ${jobId} deleted successfully`,
      data: data
    }
  } catch (error: any) {
    console.error('❌ Failed to delete job:', error)
    console.error('❌ Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?._data
    })
    
    // Handle different types of errors
    if (error.response?.status === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }
    
    if (error.response?.status === 400) {
      throw createError({
        statusCode: 400,
        statusMessage: error.response._data?.detail || 'Bad request'
      })
    }
    
    // Generic error handling
    throw createError({
      statusCode: error.response?.status || 500,
      statusMessage: error.response?._data?.detail || error.message || 'Failed to delete job'
    })
  }
})