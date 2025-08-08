import { logger } from '~/server/utils/logger'
/**
 * Create a new job and add it to the queue
 * Replaces the FastAPI /jobs POST route
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { 
      job_type, 
      subject_uuid, 
      dest_media_uuid, 
      source_media_uuid, 
      frames_per_batch, 
      parameters 
    } = body
    
    // Validate required fields
    if (!job_type) {
      throw createError({
        statusCode: 400,
        statusMessage: "job_type is required"
      })
    }
    
    if (!subject_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: "subject_uuid is required"
      })
    }
    
    if (!dest_media_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: "dest_media_uuid is required"
      })
    }
    
    // Validate job type - only allow vid_faceswap
    if (job_type !== "vid_faceswap") {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid job type '${job_type}'. Only 'vid_faceswap' is supported.`
      })
    }
    
    const { getDb } = await import('~/server/utils/database')
    const { jobs, subjects, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()
    
    // Verify subject exists
    const subject = await db.select().from(subjects).where(eq(subjects.id, subject_uuid)).limit(1)
    
    if (subject.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Subject not found"
      })
    }
    
    // Verify dest media exists
    const destMedia = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, dest_media_uuid)).limit(1)
    
    if (destMedia.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Destination media not found"
      })
    }
    
    // Verify source media exists if provided
    if (source_media_uuid) {
      const sourceMedia = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, source_media_uuid)).limit(1)
      
      if (sourceMedia.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Source media not found"
        })
      }
    }
    
    // Parse parameters
    let params: any = {}
    if (parameters) {
      if (typeof parameters === 'string') {
        try {
          params = JSON.parse(parameters)
        } catch (error: any) {
          logger.error("error", error)
          throw createError({
            statusCode: 400,
            statusMessage: "Invalid parameters JSON"
          })
        }
      } else {
        params = parameters
      }
    }
    
    // Add frames_per_batch to parameters if provided
    if (frames_per_batch !== undefined) {
      params.frames_per_batch = frames_per_batch
    }
    
    // Create job using Drizzle ORM
    const newJob = await db.insert(jobs).values({
      jobType: job_type,
      subjectUuid: subject_uuid,
      destMediaUuid: dest_media_uuid,
      sourceMediaUuid: source_media_uuid || null,
      parameters: Object.keys(params).length > 0 ? params : null,
      status: 'queued',
      progress: 0
    }).returning({
      id: jobs.id,
      jobType: jobs.jobType,
      status: jobs.status,
      createdAt: jobs.createdAt
    })
    
    const createdJob = newJob[0]
    
    // Update job counts for WebSocket clients
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('Failed to update job counts after job creation:', error)
    }
    
    return {
      success: true,
      job_id: createdJob.id,
      job_type: createdJob.jobType,
      status: createdJob.status,
      created_at: createdJob.createdAt,
      message: "Job created successfully"
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create job: ${error.message || 'Unknown error'}`
    })
  }
})