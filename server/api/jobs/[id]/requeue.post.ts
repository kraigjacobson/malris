export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'id')
  
  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Job ID is required'
    })
  }

  try {
    console.log(`🔄 Re-queuing failed job ${jobId} via Drizzle ORM...`)

    // Use Drizzle ORM instead of raw SQL
    const { getDb } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { eq, and } = await import('drizzle-orm')
    
    const db = getDb()

    // First check if job exists and can be re-queued
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
    
    // Check if job can be re-queued (only failed jobs can be re-queued)
    if (job.status !== 'failed') {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot re-queue job with status: ${job.status}. Only failed jobs can be re-queued.`
      })
    }

    // Delete all output purpose media records associated with this job
    console.log(`🗑️ Deleting output media records for job ${jobId}...`)
    const deletedMedia = await db.delete(mediaRecords)
      .where(and(
        eq(mediaRecords.jobId, jobId),
        eq(mediaRecords.purpose, 'output')
      ))
      .returning({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename
      })
    
    if (deletedMedia.length > 0) {
      console.log(`✅ Deleted ${deletedMedia.length} output media records:`, deletedMedia.map(m => m.filename))
    } else {
      console.log(`ℹ️ No output media records found for job ${jobId}`)
    }

    // Update job status to queued and clear error/source fields
    const requeuedJob = await db.update(jobs)
      .set({
        status: 'queued',
        errorMessage: null,
        sourceMediaUuid: null,
        progress: 0,
        startedAt: null,
        completedAt: null,
        updatedAt: new Date()
      })
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        status: jobs.status,
        updatedAt: jobs.updatedAt
      })
    
    const requeued = requeuedJob[0]
    console.log(`✅ Successfully re-queued job ${jobId}:`, requeued)

    // Update job counts for WebSocket clients
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      console.error('Failed to update job counts after job re-queue:', error)
    }

    return {
      success: true,
      message: `Job ${jobId} has been re-queued`,
      data: {
        job_id: requeued.id,
        status: requeued.status,
        updated_at: requeued.updatedAt,
        deleted_media_count: deletedMedia.length
      }
    }
  } catch (error: any) {
    console.error('Failed to re-queue job:', error)
    
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
        statusMessage: error.data?.detail || 'Job cannot be re-queued'
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to re-queue job'
    })
  }
})