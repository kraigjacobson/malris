export default defineEventHandler(async (event) => {
  try {
    const jobId = getRouterParam(event, 'id')
    const body = await readBody(event)
    
    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required'
      })
    }
    
    console.log(`🔄 [API] Adding source to job ${jobId} via Drizzle ORM...`)
    
    if (!body.source_media_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'source_media_uuid is required'
      })
    }

    // Use Drizzle ORM instead of raw SQL
    const { getDb } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()

    // First check if job exists
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

    // Verify source media exists
    const sourceMedia = await db.select({
      uuid: mediaRecords.uuid
    }).from(mediaRecords).where(eq(mediaRecords.uuid, body.source_media_uuid)).limit(1)
    
    if (sourceMedia.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Source media not found'
      })
    }

    // Update job with source media and set status back to queued
    const updatedJob = await db.update(jobs)
      .set({
        sourceMediaUuid: body.source_media_uuid,
        status: 'queued',
        updatedAt: new Date()
      })
      .where(eq(jobs.id, jobId))
      .returning({
        id: jobs.id,
        sourceMediaUuid: jobs.sourceMediaUuid,
        status: jobs.status,
        updatedAt: jobs.updatedAt
      })
    
    const updated = updatedJob[0]
    console.log(`✅ [API] Source added to job ${jobId} successfully:`, updated)

    return {
      success: true,
      message: `Source added to job ${jobId} successfully`,
      data: {
        job_id: updated.id,
        source_media_uuid: updated.sourceMediaUuid,
        updated_at: updated.updatedAt
      }
    }
    
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