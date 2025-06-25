export default defineEventHandler(async (event) => {
  try {
    const jobId = getRouterParam(event, 'id')
    const body = await readBody(event)
    
    console.log(`🔄 [API] Adding source to job ${jobId}...`)
    
    // Get media server URL from runtime config
    const config = useRuntimeConfig()
    const mediaServerUrl = config.public.apiUrl || 'http://localhost:8000'
    
    // Prepare form data for the media server
    const formData = new FormData()
    formData.append('source_media_uuid', body.source_media_uuid)
    
    console.log(`🌐 [API] Calling: ${mediaServerUrl}/jobs/${jobId}/add-source`)
    
    // Call the media server API using PUT method
    const response = await fetch(`${mediaServerUrl}/jobs/${jobId}/add-source`, {
      method: 'PUT',
      body: formData
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw createError({
        statusCode: response.status,
        statusMessage: `Media Server API error: ${response.statusText} - ${errorText}`
      })
    }
    
    const result = await response.json()
    console.log(`✅ [API] Source added to job ${jobId} successfully`)
    
    return result
    
  } catch (error: any) {
    console.error(`❌ [API] Error adding source to job:`, error)
    
    // Handle different types of errors
    if (error.cause?.code === 'ECONNREFUSED') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Media Server API is not available. Please ensure the service is running.'
      })
    }
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to add source to job: ${error.message || 'Unknown error'}`
    })
  }
})