// Media server response types
interface MediaObject {
  uuid: string
  thumbnail_data?: string
  [key: string]: any
}

interface MediaServerJob {
  id: string
  status: string
  job_type: string
  progress?: number
  created_at: string
  completed_at?: string
  source_media_uuid: string
  dest_media_uuid?: string
  subject_uuid?: string
  output_uuid?: string
  parameters?: any
  error_message?: string
  // Nested media objects with thumbnail data
  subject?: MediaObject
  dest_media?: MediaObject
  source_media?: MediaObject
  output_media?: MediaObject
  // Flat thumbnail fields (what frontend expects)
  subject_thumbnail?: string
  dest_media_thumbnail?: string
  source_media_thumbnail?: string
  output_thumbnail?: string
}

interface MediaServerResponse {
  success: boolean
  job: MediaServerJob
}

export default defineEventHandler(async (event) => {
  try {
    // Get job ID from route parameters
    const jobId = getRouterParam(event, 'id')
    
    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required'
      })
    }

    // Get query parameters for thumbnails
    const query = getQuery(event)
    const includeThumbnails = query.include_thumbnails || 'false'
    const thumbnailSize = query.thumbnail_size || 'md'

    // Get media server URL from runtime config
    const config = useRuntimeConfig()
    const mediaServerUrl = config.public.apiUrl || 'http://localhost:8000'

    // Build query string for media server
    const queryParams = new URLSearchParams()
    if (includeThumbnails === 'true') {
      queryParams.append('include_thumbnails', 'true')
      queryParams.append('thumbnail_size', thumbnailSize.toString())
    }

    const queryString = queryParams.toString()
    const url = queryString ? `${mediaServerUrl}/jobs/${jobId}?${queryString}` : `${mediaServerUrl}/jobs/${jobId}`

    // Forward the request to the media server
    const response = await $fetch<MediaServerResponse>(url, {
      method: 'GET',
      timeout: 30000
    })
    
    // Map nested thumbnail data to flat structure
    if (response.job && includeThumbnails === 'true') {
      const job = response.job
      job.subject_thumbnail = job.subject?.thumbnail_data
      job.dest_media_thumbnail = job.dest_media?.thumbnail_data
      job.source_media_thumbnail = job.source_media?.thumbnail_data
      job.output_thumbnail = job.output_media?.thumbnail_data
    }

    return response

  } catch (error: any) {
    console.error('Error fetching job from Media Server API:', error)
    
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
      statusMessage: `Failed to fetch job: ${error.message || 'Unknown error'}`
    })
  }
})