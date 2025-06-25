export default defineEventHandler(async (event) => {
  try {
    // Get the request body
    const body = await readBody(event)
    
    // Validate the input - expecting new media server format
    if (!body || !body.job_type || !body.subject_uuid || !body.dest_media_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid request body. Expected format: { job_type: "...", subject_uuid: "...", dest_media_uuid: "...", source_media_uuid?: "...", parameters?: {...} }'
      })
    }

    // Validate required fields
    if (!body.job_type) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: job_type'
      })
    }

    if (!body.subject_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: subject_uuid'
      })
    }

    if (!body.dest_media_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: dest_media_uuid'
      })
    }

    const jobData = {
      job_type: body.job_type,
      subject_uuid: body.subject_uuid,
      dest_media_uuid: body.dest_media_uuid,
      source_media_uuid: body.source_media_uuid, // Optional
      parameters: body.parameters || {}
    }

    console.log('Submitting job to Media Server API:', jobData)

    // Get media server URL from runtime config
    const config = useRuntimeConfig()
    const mediaServerUrl = config.public.apiUrl || 'http://localhost:8000'

    // Create FormData for the media server API
    const formData = new FormData()
    formData.append('job_type', jobData.job_type)
    formData.append('subject_uuid', jobData.subject_uuid)
    formData.append('dest_media_uuid', jobData.dest_media_uuid)
    
    // Only include source_media_uuid if provided
    if (jobData.source_media_uuid) {
      formData.append('source_media_uuid', jobData.source_media_uuid)
    }
    
    formData.append('parameters', JSON.stringify(jobData.parameters))

    // Make the request to the Media Server API
    const mediaServerResponse = await $fetch(`${mediaServerUrl}/jobs`, {
      method: 'POST',
      body: formData,
      // Add timeout to prevent hanging
      timeout: 30000
    })

    console.log('Media Server API response:', mediaServerResponse)

    // Return the response from Media Server API
    const response = mediaServerResponse as any
    return {
      success: true,
      data: mediaServerResponse,
      job_id: response.job_id,
      status: response.status,
      message: `Job submitted successfully to media server. Type: ${jobData.job_type}`
    }

  } catch (error: any) {
    console.error('Error submitting job to Media Server API:', error)
    
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
      statusMessage: `Failed to submit job: ${error.message || 'Unknown error'}`
    })
  }
})