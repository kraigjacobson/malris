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

    console.log(`🗑️ Deleting job ${jobId} via Drizzle ORM...`)

    // Use Drizzle ORM instead of raw SQL
    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()

    // First check if job exists
    const existingJob = await db.select({
      id: jobs.id,
      jobType: jobs.jobType,
      status: jobs.status
    }).from(jobs).where(eq(jobs.id, jobId)).limit(1)
    
    if (existingJob.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    // Delete the job from database
    const deletedJob = await db.delete(jobs).where(eq(jobs.id, jobId)).returning({
      id: jobs.id,
      jobType: jobs.jobType,
      status: jobs.status
    })
    
    const deleted = deletedJob[0]
    console.log(`✅ Successfully deleted job ${jobId} from database:`, deleted)

    return {
      success: true,
      message: `Job ${jobId} deleted successfully`,
      data: {
        deleted_job_id: deleted.id,
        job_type: deleted.jobType,
        status: deleted.status
      }
    }
  } catch (error: any) {
    console.error('❌ Failed to delete job:', error)
    console.error('❌ Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?._data
    })
    
    // Handle different types of errors
    if (error.response?.status === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }
    
    if (error.response?.status === 400) {
      throw createError({
        statusCode: 400,
        statusMessage: error.response._data?.detail || 'Bad request'
      })
    }
    
    // Generic error handling
    throw createError({
      statusCode: error.response?.status || 500,
      statusMessage: error.response?._data?.detail || error.message || 'Failed to delete job'
    })
  }
})