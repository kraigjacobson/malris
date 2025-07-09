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
    const mediaServerUrl = config.public.mediaServerUrl || 'http://localhost:8000'
    
    console.log(`🗑️ Deleting job ${jobId} via media server...`)
    
    // Make the DELETE request to the media server
    const response = await $fetch(`${mediaServerUrl}/jobs/${jobId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    console.log('✅ Job deleted successfully:', response)
    
    return {
      success: true,
      message: `Job ${jobId} deleted successfully`,
      data: response
    }
  } catch (error: any) {
    console.error('❌ Failed to delete job:', error)
    
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