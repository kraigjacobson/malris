export default defineEventHandler(async (event) => {
  try {
    // Get the request body
    const body = await readBody(event)
    
    // Validate the input - expecting new media server format
    if (!body || !body.job_type || !body.subject_uuid || !body.dest_media_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid request body. Expected format: { job_type: "...", subject_uuid: "...", dest_media_uuid: "...", parameters?: {...} }'
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
      parameters: body.parameters || {}
    }

    console.log('Submitting job to Media Server API:', jobData)

    // Use internal job creation logic directly
    console.log('Creating job internally...')
    
    // Import the job creation logic directly
    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    
    const db = getDb()
    
    // Generate a unique job ID
    const jobId = crypto.randomUUID()
    
    // Create the job record in the database
    const newJob = {
      id: jobId,
      jobType: jobData.job_type,
      subjectUuid: jobData.subject_uuid,
      destMediaUuid: jobData.dest_media_uuid,
      parameters: jobData.parameters,
      status: 'queued' as const,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    await db.insert(jobs).values(newJob)
    
    console.log('Job created successfully:', newJob)

    return {
      success: true,
      job_id: jobId,
      status: 'queued',
      job_type: jobData.job_type,
      workflow_type: 'standard',
      created_at: newJob.createdAt,
      message: `Job submitted successfully. Type: ${jobData.job_type}`
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