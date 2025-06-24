export default defineEventHandler(async (event) => {
  try {
    // Get query parameters
    const query = getQuery(event)
    
    // Get media server URL from runtime config
    const config = useRuntimeConfig()
    const mediaServerUrl = config.public.apiUrl || 'http://localhost:8000'

    // Build query parameters for the media server
    const params = new URLSearchParams()
    
    // Add search parameter if provided
    if (query.search) {
      params.append('name_pattern', query.search as string)
    }
    
    // Add pagination parameters
    params.append('per_page', (query.limit as string) || '100')
    params.append('page', '1')
    params.append('sort_by', 'name')
    params.append('sort_order', 'asc')

    // Forward the request to the media server subjects endpoint
    const response = await $fetch(`${mediaServerUrl}/subjects?${params.toString()}`, {
      method: 'GET',
      timeout: 30000
    })

    // Transform the response to include both names and UUIDs
    const responseData = response as any
    const subjects = responseData.subjects || []
    const subjectData = subjects.map((subject: any) => ({
      id: subject.id,
      name: subject.name,
      uuid: subject.id // Using id as UUID since that's what the API uses
    }))

    return {
      subjects: subjectData,
      names: subjects.map((subject: any) => subject.name),
      count: subjects.length
    }

  } catch (error: any) {
    console.error('Error fetching subjects from Media Server API:', error)
    
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
      statusMessage: `Failed to fetch subjects: ${error.message || 'Unknown error'}`
    })
  }
})