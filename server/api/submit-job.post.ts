export default defineEventHandler(async (event) => {
  try {
    // Get the request body
    const body = await readBody(event)
    
    // Validate the input
    if (!body || !body.input) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid request body. Expected format: { input: { ... } }'
      })
    }

    const { input } = body
    
    // Validate required fields
    const requiredFields = ['jobtype', 'source_name', 'video_filename']
    for (const field of requiredFields) {
      if (!input[field]) {
        throw createError({
          statusCode: 400,
          statusMessage: `Missing required field: ${field}`
        })
      }
    }

    // Validate jobtype-specific fields
    if (input.jobtype === 'vid' && (input.source_index === null || input.source_index === undefined)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'source_index is required for vid jobtype'
      })
    }

    console.log('Submitting job to RunPod API:', input)

    // Make the request to the RunPod API
    const runpodResponse = await $fetch('http://localhost:8001/runsync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: { input },
      // Add timeout to prevent hanging
      timeout: 30000
    })

    console.log('RunPod API response:', runpodResponse)

    // Return the response from RunPod API
    return {
      success: true,
      data: runpodResponse,
      message: `Job submitted successfully. Type: ${input.jobtype}`
    }

  } catch (error: any) {
    console.error('Error submitting job to RunPod API:', error)
    
    // Handle different types of errors
    if (error.cause?.code === 'ECONNREFUSED') {
      throw createError({
        statusCode: 503,
        statusMessage: 'RunPod API is not available. Please ensure the service is running on localhost:8001'
      })
    }
    
    if (error.cause?.code === 'ETIMEDOUT') {
      throw createError({
        statusCode: 504,
        statusMessage: 'Request to RunPod API timed out. The service may be overloaded.'
      })
    }

    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to submit job: ${error.message || 'Unknown error'}`
    })
  }
})