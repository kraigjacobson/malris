import { getDb } from '~/server/utils/database'
import { jobs, subjects, mediaRecords } from '~/server/utils/schema'
import { eq, and, gte, lte, isNotNull, isNull, count, desc, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    // Get query parameters
    const query = getQuery(event)
    const {
      status,
      job_type,
      subject_uuid,
      source_media_uuid,
      dest_media_uuid,
      output_uuid,
      source_type,
      min_progress,
      max_progress,
      created_after,
      created_before,
      started_after,
      started_before,
      completed_after,
      completed_before,
      updated_after,
      updated_before,
      has_error,
      sort_by = 'created_at',
      sort_order = 'desc',
      limit = 100,
      offset = 0,
      include_thumbnails = false
    } = query

    const db = getDb()

    // Validate sort parameters
    const validSortFields = ['id', 'status', 'job_type', 'progress', 'created_at', 'started_at', 'completed_at', 'updated_at']
    if (!validSortFields.includes(sort_by as string)) {
      throw createError({
        statusCode: 400,
        statusMessage: `sort_by must be one of: ${validSortFields.join(', ')}`
      })
    }

    if (!['asc', 'desc'].includes((sort_order as string).toLowerCase())) {
      throw createError({
        statusCode: 400,
        statusMessage: "sort_order must be 'asc' or 'desc'"
      })
    }

    // Build where conditions
    const conditions = []

    if (status) {
      conditions.push(eq(jobs.status, status as any))
    }

    if (job_type) {
      conditions.push(eq(jobs.jobType, job_type as string))
    }

    if (subject_uuid) {
      conditions.push(eq(jobs.subjectUuid, subject_uuid as string))
    }

    if (source_media_uuid) {
      conditions.push(eq(jobs.sourceMediaUuid, source_media_uuid as string))
    }

    if (dest_media_uuid) {
      conditions.push(eq(jobs.destMediaUuid, dest_media_uuid as string))
    }

    if (output_uuid) {
      conditions.push(eq(jobs.outputUuid, output_uuid as string))
    }

    // Source type filtering
    if (source_type) {
      if (source_type === 'vid') {
        // Jobs with source_media_uuid (video jobs)
        conditions.push(isNotNull(jobs.sourceMediaUuid))
      } else if (source_type === 'source') {
        // Jobs without source_media_uuid (source jobs)
        conditions.push(isNull(jobs.sourceMediaUuid))
      }
      // 'all' case doesn't add any condition
    }

    if (min_progress !== undefined) {
      const minProg = parseInt(min_progress as string)
      if (minProg >= 0 && minProg <= 100) {
        conditions.push(gte(jobs.progress, minProg))
      }
    }

    if (max_progress !== undefined) {
      const maxProg = parseInt(max_progress as string)
      if (maxProg >= 0 && maxProg <= 100) {
        conditions.push(lte(jobs.progress, maxProg))
      }
    }

    // Date filters
    if (created_after) {
      conditions.push(gte(jobs.createdAt, new Date(created_after as string)))
    }
    if (created_before) {
      conditions.push(lte(jobs.createdAt, new Date(created_before as string)))
    }
    if (started_after) {
      conditions.push(gte(jobs.startedAt, new Date(started_after as string)))
    }
    if (started_before) {
      conditions.push(lte(jobs.startedAt, new Date(started_before as string)))
    }
    if (completed_after) {
      conditions.push(gte(jobs.completedAt, new Date(completed_after as string)))
    }
    if (completed_before) {
      conditions.push(lte(jobs.completedAt, new Date(completed_before as string)))
    }
    if (updated_after) {
      conditions.push(gte(jobs.updatedAt, new Date(updated_after as string)))
    }
    if (updated_before) {
      conditions.push(lte(jobs.updatedAt, new Date(updated_before as string)))
    }

    // Error filter
    if (has_error !== undefined) {
      if (has_error === 'true' || has_error === true) {
        conditions.push(isNotNull(jobs.errorMessage))
      } else {
        conditions.push(isNull(jobs.errorMessage))
      }
    }

    // Build the query with proper ordering
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000) // Cap at 1000
    const offsetNum = parseInt(offset as string) || 0

    // Create the order by clause
    let orderByClause
    const sortDirection = (sort_order as string).toLowerCase() === 'desc' ? desc : asc
    
    switch (sort_by) {
      case 'id':
        orderByClause = sortDirection(jobs.id)
        break
      case 'status':
        orderByClause = sortDirection(jobs.status)
        break
      case 'job_type':
        orderByClause = sortDirection(jobs.jobType)
        break
      case 'progress':
        orderByClause = sortDirection(jobs.progress)
        break
      case 'started_at':
        orderByClause = sortDirection(jobs.startedAt)
        break
      case 'completed_at':
        orderByClause = sortDirection(jobs.completedAt)
        break
      case 'updated_at':
        orderByClause = sortDirection(jobs.updatedAt)
        break
      default: // created_at
        orderByClause = sortDirection(jobs.createdAt)
        break
    }

    // Execute the main query with joins
    const results = await db
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
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByClause)
      .limit(limitNum)
      .offset(offsetNum)

    // Get total count for pagination info
    const totalCountResult = await db
      .select({ count: count() })
      .from(jobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
    
    const filteredCount = totalCountResult[0].count

    // Get additional media info for each job (source, dest, output)
    const enhancedResults = await Promise.all(
      results.map(async (job) => {
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

        return {
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
          output_media: outputMedia[0] || null
        }
      })
    )

    // Get total jobs count for additional metadata
    const totalJobsResult = await db.select({ count: count() }).from(jobs)
    const totalJobsCount = totalJobsResult[0].count

    const response: any = {
      results: enhancedResults,
      count: filteredCount,
      total_jobs_count: totalJobsCount,
      limit: limitNum,
      offset: offsetNum
    }

    // TODO: Add thumbnail processing if include_thumbnails is true
    if (include_thumbnails === 'true' || include_thumbnails === true) {
      response.thumbnails_included = true
      // Thumbnail processing would go here - requires decryption logic
    }

    return response

  } catch (error: any) {
    console.error('Error searching jobs from database:', error)
    
    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to search jobs: ${error.message || 'Unknown error'}`
    })
  }
})