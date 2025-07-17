export default defineEventHandler(async (event) => {
  try {
    // Get query parameters
    const query = getQuery(event)
    
    // Build query string for the media API
    const searchParams = new URLSearchParams()
    
    if (query.media_type) searchParams.append('media_type', query.media_type as string)
    if (query.purpose) searchParams.append('purpose', query.purpose as string)
    if (query.status) searchParams.append('status', query.status as string)
    if (query.exclude_statuses) searchParams.append('exclude_statuses', query.exclude_statuses as string)
    if (query.tags) searchParams.append('tags', query.tags as string)
    if (query.tag_match_mode) searchParams.append('tag_match_mode', query.tag_match_mode as string)
    if (query.filename_pattern) searchParams.append('filename_pattern', query.filename_pattern as string)
    if (query.subject_uuid) searchParams.append('subject_uuid', query.subject_uuid as string)
    if (query.job_id) searchParams.append('job_id', query.job_id as string)
    if (query.dest_media_uuid_ref) searchParams.append('dest_media_uuid_ref', query.dest_media_uuid_ref as string)
    if (query.has_subject !== undefined) searchParams.append('has_subject', query.has_subject as string)
    
    // File size filters
    if (query.min_file_size) searchParams.append('min_file_size', query.min_file_size as string)
    if (query.max_file_size) searchParams.append('max_file_size', query.max_file_size as string)
    
    // Dimension filters
    if (query.min_width) searchParams.append('min_width', query.min_width as string)
    if (query.max_width) searchParams.append('max_width', query.max_width as string)
    if (query.min_height) searchParams.append('min_height', query.min_height as string)
    if (query.max_height) searchParams.append('max_height', query.max_height as string)
    
    // Duration filters (for videos)
    if (query.min_duration) searchParams.append('min_duration', query.min_duration as string)
    if (query.max_duration) searchParams.append('max_duration', query.max_duration as string)
    
    // Date filters
    if (query.created_after) searchParams.append('created_after', query.created_after as string)
    if (query.created_before) searchParams.append('created_before', query.created_before as string)
    if (query.updated_after) searchParams.append('updated_after', query.updated_after as string)
    if (query.updated_before) searchParams.append('updated_before', query.updated_before as string)
    if (query.accessed_after) searchParams.append('accessed_after', query.accessed_after as string)
    if (query.accessed_before) searchParams.append('accessed_before', query.accessed_before as string)
    
    // Access count filters
    if (query.min_access_count) searchParams.append('min_access_count', query.min_access_count as string)
    if (query.max_access_count) searchParams.append('max_access_count', query.max_access_count as string)
    
    // Completion filters
    if (query.min_completions !== undefined) searchParams.append('min_completions', query.min_completions as string)
    if (query.max_completions !== undefined) searchParams.append('max_completions', query.max_completions as string)
    
    if (query.limit) searchParams.append('limit', query.limit as string)
    
    // Handle pagination - convert page to offset
    if (query.page) {
      const page = parseInt(query.page as string) || 1
      const limit = parseInt(query.limit as string) || 16
      const offset = (page - 1) * limit
      searchParams.append('offset', offset.toString())
    } else if (query.offset) {
      searchParams.append('offset', query.offset as string)
    }
    
    // Add sorting parameters with validation
    const validMediaSortFields = [
      'filename', 'type', 'purpose', 'status', 'file_size', 'original_size',
      'width', 'height', 'duration', 'created_at', 'updated_at', 'last_accessed', 'access_count'
    ]
    const sortBy = (query.sort_by as string) || 'created_at'
    const sortOrder = (query.sort_order as string) || 'desc'
    
    // Validate and add sort parameters
    if (validMediaSortFields.includes(sortBy)) {
      searchParams.append('sort_by', sortBy)
    } else {
      searchParams.append('sort_by', 'created_at')
    }
    
    if (['asc', 'desc'].includes(sortOrder.toLowerCase())) {
      searchParams.append('sort_order', sortOrder.toLowerCase())
    } else {
      searchParams.append('sort_order', 'desc')
    }

    // Always include thumbnails to get base64 thumbnail data for videos
    searchParams.set('include_thumbnails', 'true')

    console.log('🔍 Searching media with params:', Object.fromEntries(searchParams))

    // First check if media API is healthy
    // Get runtime config for API URL
    const config = useRuntimeConfig()
    const apiUrl = config.public.apiUrl || 'http://localhost:8000'
    
    try {
      await $fetch(`${apiUrl}/health`, {
        method: 'GET',
        timeout: 5000
      })
    } catch (healthError: any) {
      console.error('Media API health check failed:', healthError)
      throw createError({
        statusCode: 503,
        statusMessage: 'Media API is not available. Please ensure the service is running on localhost:8000'
      })
    }

    // Make request to media API - now always returns JSON with embedded base64 thumbnails
    const response = await fetch(`${apiUrl}/media/search?${searchParams.toString()}`, {
      method: 'GET'
    })

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: `Media API error: ${response.statusText}`
      })
    }

    const jsonResponse = await response.json()
    
    // Process results to convert base64 thumbnail data to data URLs for video elements
    if (jsonResponse.results) {
      jsonResponse.results = jsonResponse.results.map((result: any) => {
        if (result.type === 'video' && result.has_thumbnail && result.thumbnail) {
          // The thumbnail field already contains base64 data, convert to data URL for video poster
          result.thumbnail = `data:image/jpeg;base64,${result.thumbnail}`
        }
        return result
      })
    }
    
    console.log('🎬 Video results with thumbnails:',
      jsonResponse.results?.filter((r: any) => r.type === 'video' && r.thumbnail).length || 0)

    return jsonResponse

  } catch (error: any) {
    console.error('Error searching media:', error)
    
    // Handle different types of errors
    if (error.cause?.code === 'ECONNREFUSED') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Media API is not available. Please ensure the service is running on localhost:8000'
      })
    }
    
    if (error.cause?.code === 'ETIMEDOUT') {
      throw createError({
        statusCode: 504,
        statusMessage: 'Request to Media API timed out.'
      })
    }

    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to search media: ${error.message || 'Unknown error'}`
    })
  }
})