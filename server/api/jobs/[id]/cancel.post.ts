export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'id')
  
  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Job ID is required'
    })
  }

  try {
    console.log(`🛑 Canceling job ${jobId} via Drizzle ORM...`)

    // Use Drizzle ORM instead of raw SQL
    const { getDb } = await import('~/server/utils/database')
    const { jobs } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()

    // First check if job exists and can be canceled
    const existingJob = await db.select({
      id: jobs.id,
      status: jobs.status
    }).from(jobs).where(eq(jobs.id, jobId)).limit(1)
    
    if (existingJob.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    const job = existingJob[0]
    
    // Check if job can be canceled (only queued or active jobs can be canceled)
    if (!['queued', 'active'].includes(job.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot cancel job with status: ${job.status}. Only queued or active jobs can be canceled.`
      })
    }

    // If job is currently active, try to interrupt ComfyUI
    if (job.status === 'active') {
      console.log(`🛑 Canceling active job ${jobId} - attempting to interrupt ComfyUI`)
      
      try {
        // Use ComfyUI API URL for interrupt endpoint (different port than worker API)
        const comfyuiUrl = process.env.COMFYUI_URL || 'http://localhost:8189'
        
        // Send interrupt signal to ComfyUI
        const response = await fetch(`${comfyuiUrl}/interrupt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        if (response.ok) {
          console.log(`✅ Successfully interrupted ComfyUI for job ${jobId}`)
        } else {
          console.log(`⚠️ ComfyUI interrupt response: ${response.status} ${response.statusText}`)
        }
      } catch (error: any) {
        console.log(`⚠️ Error interrupting ComfyUI for job ${jobId}: ${error.message}`)
        // Continue with cancellation even if interrupt fails
      }
    }

    // Update job status to canceled
    const canceledJob = await db.update(jobs)
      .set({
        status: 'canceled',
        errorMessage: 'Job canceled by user',
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        status: jobs.status,
        updatedAt: jobs.updatedAt
      })
    
    const canceled = canceledJob[0]
    console.log(`✅ Successfully canceled job ${jobId}:`, canceled)

    return {
      success: true,
      message: `Job ${jobId} has been cancelled`,
      data: {
        job_id: canceled.id,
        status: canceled.status,
        updated_at: canceled.updatedAt
      }
    }
  } catch (error: any) {
    console.error('Failed to cancel job:', error)
    
    // Handle different error scenarios
    if (error.status === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }
    
    if (error.status === 400) {
      throw createError({
        statusCode: 400,
        statusMessage: error.data?.detail || 'Job cannot be cancelled'
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to cancel job'
    })
  }
})