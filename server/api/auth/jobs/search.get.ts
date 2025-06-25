export default defineEventHandler(async (event) => {
  try {
    // Get query parameters
    const query = getQuery(event)
    const { 
      status, 
      job_type, 
      source_media_uuid,
      dest_media_uuid,
      output_uuid,
      min_progress,
      max_progress,
      created_after,
      created_before,
      started_after,
      started_before,
      completed_after,
      completed_before,
      updated_after,
      updated_before,
      has_error,
      sort_by = 'created_at',
      sort_order = 'desc',
      limit = 100, 
      offset = 0,
      include_thumbnails = false,
      thumbnail_size = 'sm'
    } = query

    // Get media server URL from runtime config
    const config = useRuntimeConfig()
    const mediaServerUrl = config.public.apiUrl || 'http://localhost:8000'

    // Build query string for the media server
    const searchParams = new URLSearchParams()
    if (status) searchParams.append('status', status as string)
    if (job_type) searchParams.append('job_type', job_type as string)
    if (source_media_uuid) searchParams.append('source_media_uuid', source_media_uuid as string)
    if (dest_media_uuid) searchParams.append('dest_media_uuid', dest_media_uuid as string)
    if (output_uuid) searchParams.append('output_uuid', output_uuid as string)
    if (min_progress) searchParams.append('min_progress', min_progress as string)
    if (max_progress) searchParams.append('max_progress', max_progress as string)
    if (created_after) searchParams.append('created_after', created_after as string)
    if (created_before) searchParams.append('created_before', created_before as string)
    if (started_after) searchParams.append('started_after', started_after as string)
    if (started_before) searchParams.append('started_before', started_before as string)
    if (completed_after) searchParams.append('completed_after', completed_after as string)
    if (completed_before) searchParams.append('completed_before', completed_before as string)
    if (updated_after) searchParams.append('updated_after', updated_after as string)
    if (updated_before) searchParams.append('updated_before', updated_before as string)
    if (has_error !== undefined) searchParams.append('has_error', has_error as string)
    searchParams.append('sort_by', sort_by as string)
    searchParams.append('sort_order', sort_order as string)
    searchParams.append('limit', limit as string)
    searchParams.append('offset', offset as string)
    searchParams.append('include_thumbnails', include_thumbnails as string)
    searchParams.append('thumbnail_size', thumbnail_size as string)

    // Forward the request to the media server using native fetch (like working endpoints)
    const response = await fetch(`${mediaServerUrl}/jobs/search?${searchParams.toString()}`, {
      method: 'GET'
    })

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: `Media Server API error: ${response.statusText}`
      })
    }

    const jsonResponse = await response.json()
    return jsonResponse

  } catch (error: any) {
    console.error('Error searching jobs from Media Server API:', error)
    
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
      statusMessage: `Failed to search jobs: ${error.message || 'Unknown error'}`
    })
  }
})