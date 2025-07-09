import type { Job } from '~/types'

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

    console.log(`Retrying job ${jobId}...`)

    // Get media server URL from runtime config
    const config = useRuntimeConfig()
    const mediaServerUrl = config.public.apiUrl || 'http://localhost:8000'

    // First, get the job details to extract the original parameters
    const jobResponse = await $fetch(`${mediaServerUrl}/jobs/${jobId}`, {
      method: 'GET',
      timeout: 30000
    }) as { job: Job } | Job

    const job: Job = 'job' in jobResponse ? jobResponse.job : jobResponse
    
    if (!job) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    // Check if the job is in a retryable state (canceled, failed, or completed)
    if (!['canceled', 'failed', 'completed'].includes(job.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot retry job with status: ${job.status}. Only canceled, failed, or completed jobs can be retried.`
      })
    }

    // Validate required fields for retry
    if (!job.job_type || !job.subject_uuid || !job.dest_media_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job is missing required fields for retry (job_type, subject_uuid, dest_media_uuid)'
      })
    }

    // Prepare the job data for resubmission
    const jobData = {
      job_type: job.job_type,
      subject_uuid: job.subject_uuid,
      dest_media_uuid: job.dest_media_uuid,
      parameters: job.parameters || {}
    }

    console.log('Resubmitting job to Media Server API:', jobData)

    // Create FormData for the media server API
    const formData = new FormData()
    formData.append('job_type', jobData.job_type)
    formData.append('subject_uuid', jobData.subject_uuid)
    formData.append('dest_media_uuid', jobData.dest_media_uuid)
    
    // Include parameters if there are any
    if (Object.keys(jobData.parameters).length > 0) {
      formData.append('parameters', JSON.stringify(jobData.parameters))
    }

    // Make the request to the Media Server API to create a new job
    const mediaServerResponse = await $fetch(`${mediaServerUrl}/jobs`, {
      method: 'POST',
      body: formData,
      timeout: 30000
    })

    console.log('Media Server API response for retry:', mediaServerResponse)

    // If the new job was created successfully, clean up the old job and its output media
    const response = mediaServerResponse as { job_id: string; status: string }
    
    try {
      // Delete the old job record (this automatically deletes any associated output image media)
      console.log(`Deleting old job ${jobId} and its output media...`)
      await $fetch(`${mediaServerUrl}/jobs/${jobId}`, {
        method: 'DELETE',
        timeout: 30000
      })
      console.log(`Successfully deleted old job ${jobId} and its output media`)
      
    } catch (cleanupError) {
      console.error('Error during cleanup (new job still created):', cleanupError)
      // Don't fail the retry if cleanup fails - the new job was created successfully
    }

    // Return the response from Media Server API
    return {
      success: true,
      data: mediaServerResponse,
      job_id: response.job_id,
      status: response.status,
      original_job_id: jobId,
      message: `Job retried successfully. New job ID: ${response.job_id}, Type: ${jobData.job_type}. Old job and output media cleaned up.`
    }

  } catch (error: any) {
    console.error('Error retrying job:', error)
    
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
      statusMessage: `Failed to retry job: ${error.message || 'Unknown error'}`
    })
  }
})