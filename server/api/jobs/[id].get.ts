import { getDb } from '~/server/utils/database'
import { jobs, subjects, mediaRecords } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'

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

    // Check if this is a prefixed tagging job ID - these are not stored in the jobs table
    if (jobId.startsWith('tag_')) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Tagging jobs are not stored in the jobs table. This is a temporary workflow identifier.'
      })
    }

    // Get query parameters for thumbnails
    const query = getQuery(event)
    const _thumbnailSize = query.thumbnail_size || 'md'

    const db = getDb()

    // Get the job with subject information
    const jobResult = await db
      .select({
        id: jobs.id,
        job_type: jobs.jobType,
        status: jobs.status,
        subject_uuid: jobs.subjectUuid,
        source_media_uuid: jobs.sourceMediaUuid,
        dest_media_uuid: jobs.destMediaUuid,
        output_uuid: jobs.outputUuid,
        parameters: jobs.parameters,
        progress: jobs.progress,
        error_message: jobs.errorMessage,
        created_at: jobs.createdAt,
        started_at: jobs.startedAt,
        completed_at: jobs.completedAt,
        updated_at: jobs.updatedAt,
        // Subject info
        subject_name: subjects.name,
        subject_tags: subjects.tags,
        subject_thumbnail_uuid: subjects.thumbnail,
      })
      .from(jobs)
      .leftJoin(subjects, eq(jobs.subjectUuid, subjects.id))
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (jobResult.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    const job = jobResult[0]

    // Get additional media info for source, dest, and output
    const [sourceMedia, destMedia, outputMedia] = await Promise.all([
      // Get source media info
      job.source_media_uuid ? 
        db.select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          thumbnail_uuid: mediaRecords.thumbnailUuid
        })
        .from(mediaRecords)
        .where(eq(mediaRecords.uuid, job.source_media_uuid))
        .limit(1) : Promise.resolve([]),
      
      // Get dest media info
      job.dest_media_uuid ? 
        db.select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          thumbnail_uuid: mediaRecords.thumbnailUuid
        })
        .from(mediaRecords)
        .where(eq(mediaRecords.uuid, job.dest_media_uuid))
        .limit(1) : Promise.resolve([]),
      
      // Get output media info
      job.output_uuid ? 
        db.select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          thumbnail_uuid: mediaRecords.thumbnailUuid
        })
        .from(mediaRecords)
        .where(eq(mediaRecords.uuid, job.output_uuid))
        .limit(1) : Promise.resolve([])
    ])

    // Build the response in the expected format
    const jobResponse = {
      id: job.id,
      job_type: job.job_type,
      status: job.status,
      subject_uuid: job.subject_uuid,
      source_media_uuid: job.source_media_uuid,
      dest_media_uuid: job.dest_media_uuid,
      output_uuid: job.output_uuid,
      parameters: job.parameters,
      progress: job.progress,
      error_message: job.error_message,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      updated_at: job.updated_at,
      subject: job.subject_name ? {
        id: job.subject_uuid,
        name: job.subject_name,
        tags: job.subject_tags,
        thumbnail_uuid: job.subject_thumbnail_uuid
      } : null,
      source_media: sourceMedia[0] || null,
      dest_media: destMedia[0] || null,
      output_media: outputMedia[0] || null,
      // Thumbnail UUIDs for frontend to construct image URLs
      subject_thumbnail_uuid: job.subject_thumbnail_uuid,
      source_media_thumbnail_uuid: sourceMedia[0]?.thumbnail_uuid || null,
      dest_media_thumbnail_uuid: destMedia[0]?.thumbnail_uuid || null,
      output_thumbnail_uuid: outputMedia[0]?.thumbnail_uuid || null
    }

    return {
      success: true,
      job: jobResponse
    }

  } catch (error: any) {
    console.error('Error fetching job from database:', error)
    
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