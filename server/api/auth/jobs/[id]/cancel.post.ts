export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'id')
  
  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Job ID is required'
    })
  }

  try {
    // Call the media server API to cancel the job
    const response = await $fetch(`http://localhost:8000/jobs/${jobId}/cancel`, {
      method: 'POST'
    })

    return {
      success: true,
      message: `Job ${jobId} has been cancelled`,
      data: response
    }
  } catch (error: any) {
    console.error('Failed to cancel job:', error)
    
    // Handle different error scenarios
    if (error.status === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }
    
    if (error.status === 400) {
      throw createError({
        statusCode: 400,
        statusMessage: error.data?.detail || 'Job cannot be cancelled'
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to cancel job'
    })
  }
})