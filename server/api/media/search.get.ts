import { getDb } from '~/server/utils/database'
import { mediaRecords, jobs, subjects } from '~/server/utils/schema'
import { eq, and, gte, lte, isNotNull, isNull, count, desc, asc, notInArray, notExists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Get query parameters
    const query = getQuery(event)
    const {
      uuid,
      media_type,
      purpose,
      status,
      exclude_statuses,
      tags,
      only_untagged,
      filename_pattern,
      subject_uuid,
      exclude_subject_uuid,
      job_id,
      dest_media_uuid_ref,
      has_subject,
      min_file_size,
      max_file_size,
      min_width,
      max_width,
      min_height,
      max_height,
      min_duration,
      max_duration,
      created_after,
      created_before,
      updated_after,
      updated_before,
      accessed_after,
      accessed_before,
      min_access_count,
      max_access_count,
      min_completions,
      max_completions,
      tags_confirmed,
      sort_by = 'created_at',
      sort_order = 'desc',
      limit = 100,
      offset = 0,
      page,
      pick_random = false,
      include_thumbnails = false,
      include_images = false
    } = query

    // Debug logging for include_thumbnails parameter
    logger.info('🔍 Media search parameters:', {
      include_thumbnails,
      include_thumbnails_type: typeof include_thumbnails,
      media_type,
      purpose,
      job_id,
      limit
    })

    const db = getDb()

    // Handle UUID-based search - if UUID is provided, ignore all other filters
    if (uuid) {
      logger.info('🔍 UUID-based search for:', uuid)
      
      // Create aliases for the different media record joins
      const videoThumbnailMedia = alias(mediaRecords, 'video_thumbnail_media')
      const subjectThumbnailMedia = alias(mediaRecords, 'subject_thumbnail_media')

      // Conditionally include thumbnail data based on include_thumbnails or include_images parameter
      const shouldIncludeThumbnails = include_thumbnails === 'true' || include_thumbnails === true || include_images === 'true' || include_images === true

      // Build query conditionally based on whether thumbnails are needed
      let queryBuilder = db
        .select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          purpose: mediaRecords.purpose,
          status: mediaRecords.status,
          file_size: mediaRecords.fileSize,
          original_size: mediaRecords.originalSize,
          width: mediaRecords.width,
          height: mediaRecords.height,
          duration: mediaRecords.duration,
          fps: mediaRecords.fps,
          codec: mediaRecords.codec,
          bitrate: mediaRecords.bitrate,
          tags: mediaRecords.tags,
          subject_uuid: mediaRecords.subjectUuid,
          source_media_uuid_ref: mediaRecords.sourceMediaUuidRef,
          dest_media_uuid_ref: mediaRecords.destMediaUuidRef,
          job_id: mediaRecords.jobId,
          thumbnail_uuid: mediaRecords.thumbnailUuid,
          created_at: mediaRecords.createdAt,
          updated_at: mediaRecords.updatedAt,
          last_accessed: mediaRecords.lastAccessed,
          access_count: mediaRecords.accessCount,
          completions: mediaRecords.completions,
          tags_confirmed: mediaRecords.tagsConfirmed,
          subject_thumbnail_uuid: subjects.thumbnail,
          // Only include encrypted data if thumbnails are requested to avoid massive response
          video_thumbnail_data: shouldIncludeThumbnails ? videoThumbnailMedia.encryptedData : sql`NULL`,
          video_thumbnail_filename: shouldIncludeThumbnails ? videoThumbnailMedia.filename : sql`NULL`,
          subject_thumbnail_data: shouldIncludeThumbnails ? subjectThumbnailMedia.encryptedData : sql`NULL`,
          subject_thumbnail_filename: shouldIncludeThumbnails ? subjectThumbnailMedia.filename : sql`NULL`
        })
        .from(mediaRecords)
        .leftJoin(subjects, eq(mediaRecords.subjectUuid, subjects.id))

      // Add thumbnail joins only if thumbnails are requested
      if (shouldIncludeThumbnails) {
        queryBuilder = queryBuilder
          .leftJoin(videoThumbnailMedia, eq(mediaRecords.thumbnailUuid, videoThumbnailMedia.uuid))
          .leftJoin(subjectThumbnailMedia, eq(subjects.thumbnail, subjectThumbnailMedia.uuid))
      }

      // Execute the query with UUID filter
      const results = await queryBuilder
        .where(eq(mediaRecords.uuid, uuid as string))
        .limit(1)

      if (results.length === 0) {
        return {
          results: [],
          count: 0,
          limit: 1,
          offset: 0,
          total_count: 0
        }
      }

      // Transform results to match expected format
      const transformedResults = results.map(result => ({
        uuid: result.uuid,
        filename: result.filename,
        type: result.type,
        purpose: result.purpose,
        status: result.status,
        file_size: result.file_size,
        original_size: result.original_size,
        width: result.width,
        height: result.height,
        duration: result.duration,
        fps: result.fps,
        codec: result.codec,
        bitrate: result.bitrate,
        tags: result.tags,
        subject_uuid: result.subject_uuid,
        source_media_uuid_ref: result.source_media_uuid_ref,
        dest_media_uuid_ref: result.dest_media_uuid_ref,
        job_id: result.job_id,
        thumbnail_uuid: result.thumbnail_uuid,
        subject_thumbnail_uuid: result.subject_thumbnail_uuid,
        created_at: result.created_at,
        updated_at: result.updated_at,
        last_accessed: result.last_accessed,
        access_count: result.access_count,
        completions: result.completions,
        tags_confirmed: result.tags_confirmed,
        // Add thumbnail processing flags - prioritize output thumbnail for output videos, subject thumbnail for others
        has_thumbnail: result.type === 'video' ?
          (result.purpose === 'output' ? !!result.thumbnail_uuid : !!result.subject_thumbnail_uuid) :
          !!result.thumbnail_uuid,
        thumbnail: null as string | null,
        // Include raw thumbnail data for processing
        _video_thumbnail_data: result.video_thumbnail_data,
        _video_thumbnail_filename: result.video_thumbnail_filename,
        _subject_thumbnail_data: result.subject_thumbnail_data,
        _subject_thumbnail_filename: result.subject_thumbnail_filename
      }))

      // Process thumbnails if include_thumbnails or include_images is explicitly true
      if (include_thumbnails === 'true' || include_thumbnails === true || include_images === 'true' || include_images === true) {
        logger.info('🖼️ Setting thumbnail URLs for UUID search result...')
        
        for (const result of transformedResults) {
          // Handle video thumbnails - prioritize video thumbnail for dest and output videos, subject thumbnail for others
          if (result.type === 'video') {
            let thumbnailUuid = null
            
            // For destination videos, ONLY use video thumbnails - never subject thumbnails
            if (result.purpose === 'dest') {
              thumbnailUuid = result.thumbnail_uuid
            }
            // For output videos, prioritize video thumbnail over subject thumbnail
            else if (result.purpose === 'output') {
              thumbnailUuid = result.thumbnail_uuid || result.subject_thumbnail_uuid
            } else {
              // For other videos (source, intermediate), prioritize subject thumbnail
              thumbnailUuid = result.subject_thumbnail_uuid || result.thumbnail_uuid
            }
            
            if (thumbnailUuid) {
              result.thumbnail = `/api/media/${thumbnailUuid}/image?size=md`
            } else {
              logger.warn(`⚠️ Video ${result.uuid} has no thumbnail available`)
            }
          }
          
          // Handle image data directly - images use their own data as thumbnail
          else if (result.type === 'image') {
            result.thumbnail = `/api/media/${result.uuid}/image?size=md`
          }
          
          // Clean up internal fields
          const { _video_thumbnail_data, _video_thumbnail_filename, _subject_thumbnail_data, _subject_thumbnail_filename, ...cleanResult } = result
          Object.assign(result, cleanResult)
        }
      }

      const response = {
        results: transformedResults,
        count: transformedResults.length,
        limit: 1,
        offset: 0,
        total_count: transformedResults.length
      }

      logger.info('🔍 UUID search completed:', {
        uuid: uuid,
        found: transformedResults.length > 0,
        result_type: transformedResults.length > 0 ? transformedResults[0].type : 'none'
      })

      return response
    }

    // Validate sort parameters
    const validMediaSortFields = [
      'filename', 'type', 'purpose', 'status', 'file_size', 'original_size',
      'width', 'height', 'duration', 'created_at', 'updated_at', 'last_accessed', 'access_count', 'random'
    ]
    
    if (!validMediaSortFields.includes(sort_by as string)) {
      throw createError({
        statusCode: 400,
        statusMessage: `sort_by must be one of: ${validMediaSortFields.join(', ')}`
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

    if (media_type) {
      conditions.push(eq(mediaRecords.type, media_type as string))
    }

    if (purpose) {
      conditions.push(eq(mediaRecords.purpose, purpose as string))
    }

    if (status) {
      conditions.push(eq(mediaRecords.status, status as string))
    }

    // Handle exclude_statuses
    if (exclude_statuses) {
      const excludeList = (exclude_statuses as string).split(',').map(s => s.trim())
      if (excludeList.includes('null')) {
        // Exclude null values and other specified statuses
        const nonNullExcludes = excludeList.filter(s => s !== 'null')
        if (nonNullExcludes.length > 0) {
          conditions.push(and(
            isNotNull(mediaRecords.status),
            notInArray(mediaRecords.status, nonNullExcludes)
          ))
        } else {
          conditions.push(isNotNull(mediaRecords.status))
        }
      } else {
        conditions.push(notInArray(mediaRecords.status, excludeList))
      }
    }

    if (subject_uuid) {
      conditions.push(eq(mediaRecords.subjectUuid, subject_uuid as string))
    }

    // Exclude destination videos that are already assigned to jobs with the SAME subject UUID
    // This allows the same video to be used for different subjects simultaneously
    if (exclude_subject_uuid) {
      conditions.push(
        notExists(
          db.select().from(jobs).where(and(
            eq(jobs.subjectUuid, exclude_subject_uuid as string),
            eq(jobs.destMediaUuid, mediaRecords.uuid)
          ))
        )
      )
    }

    if (has_subject !== undefined) {
      if (has_subject === 'true' || has_subject === true) {
        conditions.push(isNotNull(mediaRecords.subjectUuid))
      } else {
        conditions.push(isNull(mediaRecords.subjectUuid))
      }
    }

    if (job_id) {
      conditions.push(eq(mediaRecords.jobId, job_id as string))
    }

    if (dest_media_uuid_ref) {
      conditions.push(eq(mediaRecords.destMediaUuidRef, dest_media_uuid_ref as string))
    }

    if (filename_pattern) {
      conditions.push(sql`${mediaRecords.filename} ILIKE ${`%${filename_pattern}%`}`)
    }

    // File size filters
    if (min_file_size !== undefined) {
      conditions.push(gte(mediaRecords.fileSize, parseInt(min_file_size as string)))
    }
    if (max_file_size !== undefined) {
      conditions.push(lte(mediaRecords.fileSize, parseInt(max_file_size as string)))
    }

    // Dimension filters
    if (min_width !== undefined) {
      conditions.push(gte(mediaRecords.width, parseInt(min_width as string)))
    }
    if (max_width !== undefined) {
      conditions.push(lte(mediaRecords.width, parseInt(max_width as string)))
    }
    if (min_height !== undefined) {
      conditions.push(gte(mediaRecords.height, parseInt(min_height as string)))
    }
    if (max_height !== undefined) {
      conditions.push(lte(mediaRecords.height, parseInt(max_height as string)))
    }

    // Duration filters
    if (min_duration !== undefined) {
      conditions.push(gte(mediaRecords.duration, parseFloat(min_duration as string)))
    }
    if (max_duration !== undefined) {
      conditions.push(lte(mediaRecords.duration, parseFloat(max_duration as string)))
    }

    // Date filters
    if (created_after) {
      conditions.push(gte(mediaRecords.createdAt, new Date(created_after as string)))
    }
    if (created_before) {
      conditions.push(lte(mediaRecords.createdAt, new Date(created_before as string)))
    }
    if (updated_after) {
      conditions.push(gte(mediaRecords.updatedAt, new Date(updated_after as string)))
    }
    if (updated_before) {
      conditions.push(lte(mediaRecords.updatedAt, new Date(updated_before as string)))
    }
    if (accessed_after) {
      conditions.push(gte(mediaRecords.lastAccessed, new Date(accessed_after as string)))
    }
    if (accessed_before) {
      conditions.push(lte(mediaRecords.lastAccessed, new Date(accessed_before as string)))
    }

    // Access count filters
    if (min_access_count !== undefined) {
      conditions.push(gte(mediaRecords.accessCount, parseInt(min_access_count as string)))
    }
    if (max_access_count !== undefined) {
      conditions.push(lte(mediaRecords.accessCount, parseInt(max_access_count as string)))
    }

    // Completions filters
    if (min_completions !== undefined) {
      conditions.push(gte(mediaRecords.completions, parseInt(min_completions as string)))
    }
    if (max_completions !== undefined) {
      conditions.push(lte(mediaRecords.completions, parseInt(max_completions as string)))
    }

    // Tags confirmed filter
    if (tags_confirmed !== undefined) {
      if (tags_confirmed === 'true' || tags_confirmed === true) {
        conditions.push(eq(mediaRecords.tagsConfirmed, true))
      } else if (tags_confirmed === 'false' || tags_confirmed === false) {
        conditions.push(eq(mediaRecords.tagsConfirmed, false))
      }
    }

    // Tag filtering using JSONB array element search like subjects
    if (tags) {
      const tagList = (tags as string).split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
      
      if (tagList.length > 0) {
        // Use JSONB array element text search for partial matching (AND logic)
        const tagConditions = tagList.map(tag =>
          sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${mediaRecords.tags}->'tags') AS tag_elem WHERE tag_elem ILIKE ${`%${tag}%`})`
        )
        
        // Use AND logic - all tags must be found
        conditions.push(and(...tagConditions))
      }
    }

    // Only show untagged filter - records with no tags or empty tags array
    if (only_untagged === 'true' || only_untagged === true) {
      conditions.push(
        sql`(${mediaRecords.tags} IS NULL OR ${mediaRecords.tags}->'tags' IS NULL OR jsonb_array_length(${mediaRecords.tags}->'tags') = 0)`
      )
    }

    // Handle pagination
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000)
    let offsetNum = parseInt(offset as string) || 0

    if (page) {
      const pageNum = parseInt(page as string) || 1
      offsetNum = (pageNum - 1) * limitNum
    }

    // Handle random selection
    if (pick_random === 'true' || pick_random === true) {
      // For random selection, we'll get the count first, then use a random offset
      const countResult = await db
        .select({ count: count() })
        .from(mediaRecords)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
      
      const totalCount = countResult[0].count
      if (totalCount === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: 'No media found matching the specified criteria'
        })
      }

      // Use random offset
      const randomOffset = Math.floor(Math.random() * totalCount)
      
      const randomResult = await db
        .select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          purpose: mediaRecords.purpose,
          status: mediaRecords.status,
          file_size: mediaRecords.fileSize,
          original_size: mediaRecords.originalSize,
          width: mediaRecords.width,
          height: mediaRecords.height,
          duration: mediaRecords.duration,
          fps: mediaRecords.fps,
          codec: mediaRecords.codec,
          bitrate: mediaRecords.bitrate,
          tags: mediaRecords.tags,
          subject_uuid: mediaRecords.subjectUuid,
          source_media_uuid_ref: mediaRecords.sourceMediaUuidRef,
          dest_media_uuid_ref: mediaRecords.destMediaUuidRef,
          job_id: mediaRecords.jobId,
          thumbnail_uuid: mediaRecords.thumbnailUuid,
          created_at: mediaRecords.createdAt,
          updated_at: mediaRecords.updatedAt,
          last_accessed: mediaRecords.lastAccessed,
          access_count: mediaRecords.accessCount,
          completions: mediaRecords.completions,
          tags_confirmed: mediaRecords.tagsConfirmed
        })
        .from(mediaRecords)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(1)
        .offset(randomOffset)

      if (randomResult.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: 'No media found matching the specified criteria'
        })
      }

      return {
        uuid: randomResult[0].uuid,
        media_type: randomResult[0].type,
        filename: randomResult[0].filename,
        purpose: randomResult[0].purpose,
        total_matching: totalCount,
        random_selection: true,
        record: randomResult[0]
      }
    }

    // Create the order by clause
    let orderByClause
    const sortDirection = (sort_order as string).toLowerCase() === 'desc' ? desc : asc
    
    switch (sort_by) {
      case 'random':
        orderByClause = sql`RANDOM()`
        break
      case 'filename':
        orderByClause = sortDirection(mediaRecords.filename)
        break
      case 'type':
        orderByClause = sortDirection(mediaRecords.type)
        break
      case 'purpose':
        orderByClause = sortDirection(mediaRecords.purpose)
        break
      case 'status':
        orderByClause = sortDirection(mediaRecords.status)
        break
      case 'file_size':
        orderByClause = sortDirection(mediaRecords.fileSize)
        break
      case 'original_size':
        orderByClause = sortDirection(mediaRecords.originalSize)
        break
      case 'width':
        orderByClause = sortDirection(mediaRecords.width)
        break
      case 'height':
        orderByClause = sortDirection(mediaRecords.height)
        break
      case 'duration':
        orderByClause = sortDirection(mediaRecords.duration)
        break
      case 'updated_at':
        orderByClause = sortDirection(mediaRecords.updatedAt)
        break
      case 'last_accessed':
        orderByClause = sortDirection(mediaRecords.lastAccessed)
        break
      case 'access_count':
        orderByClause = sortDirection(mediaRecords.accessCount)
        break
      default: // created_at
        orderByClause = sortDirection(mediaRecords.createdAt)
        break
    }

    // Create aliases for the different media record joins
    const videoThumbnailMedia = alias(mediaRecords, 'video_thumbnail_media')
    const subjectThumbnailMedia = alias(mediaRecords, 'subject_thumbnail_media')

    // Conditionally include thumbnail data based on include_thumbnails or include_images parameter
    const shouldIncludeThumbnails = include_thumbnails === 'true' || include_thumbnails === true || include_images === 'true' || include_images === true

    // Build query conditionally based on whether thumbnails are needed
    let queryBuilder = db
      .select({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename,
        type: mediaRecords.type,
        purpose: mediaRecords.purpose,
        status: mediaRecords.status,
        file_size: mediaRecords.fileSize,
        original_size: mediaRecords.originalSize,
        width: mediaRecords.width,
        height: mediaRecords.height,
        duration: mediaRecords.duration,
        fps: mediaRecords.fps,
        codec: mediaRecords.codec,
        bitrate: mediaRecords.bitrate,
        tags: mediaRecords.tags,
        subject_uuid: mediaRecords.subjectUuid,
        source_media_uuid_ref: mediaRecords.sourceMediaUuidRef,
        dest_media_uuid_ref: mediaRecords.destMediaUuidRef,
        job_id: mediaRecords.jobId,
        thumbnail_uuid: mediaRecords.thumbnailUuid,
        created_at: mediaRecords.createdAt,
        updated_at: mediaRecords.updatedAt,
        last_accessed: mediaRecords.lastAccessed,
        access_count: mediaRecords.accessCount,
        completions: mediaRecords.completions,
        tags_confirmed: mediaRecords.tagsConfirmed,
        subject_thumbnail_uuid: subjects.thumbnail,
        // Only include encrypted data if thumbnails are requested to avoid massive response
        video_thumbnail_data: shouldIncludeThumbnails ? videoThumbnailMedia.encryptedData : sql`NULL`,
        video_thumbnail_filename: shouldIncludeThumbnails ? videoThumbnailMedia.filename : sql`NULL`,
        subject_thumbnail_data: shouldIncludeThumbnails ? subjectThumbnailMedia.encryptedData : sql`NULL`,
        subject_thumbnail_filename: shouldIncludeThumbnails ? subjectThumbnailMedia.filename : sql`NULL`
      })
      .from(mediaRecords)
      .leftJoin(subjects, eq(mediaRecords.subjectUuid, subjects.id))

    // Add thumbnail joins only if thumbnails are requested
    if (shouldIncludeThumbnails) {
      queryBuilder = queryBuilder
        .leftJoin(videoThumbnailMedia, eq(mediaRecords.thumbnailUuid, videoThumbnailMedia.uuid))
        .leftJoin(subjectThumbnailMedia, eq(subjects.thumbnail, subjectThumbnailMedia.uuid))
    }

    // Execute the query
    const results = await queryBuilder
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByClause)
      .limit(limitNum)
      .offset(offsetNum)

    // Get total count for pagination info
    const totalCountResult = await db
      .select({ count: count() })
      .from(mediaRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
    
    const totalCount = totalCountResult[0].count

    // Transform results to match expected format
    const transformedResults = results.map(result => ({
      uuid: result.uuid,
      filename: result.filename,
      type: result.type,
      purpose: result.purpose,
      status: result.status,
      file_size: result.file_size,
      original_size: result.original_size,
      width: result.width,
      height: result.height,
      duration: result.duration,
      fps: result.fps,
      codec: result.codec,
      bitrate: result.bitrate,
      tags: result.tags,
      subject_uuid: result.subject_uuid,
      source_media_uuid_ref: result.source_media_uuid_ref,
      dest_media_uuid_ref: result.dest_media_uuid_ref,
      job_id: result.job_id,
      thumbnail_uuid: result.thumbnail_uuid,
      subject_thumbnail_uuid: result.subject_thumbnail_uuid,
      created_at: result.created_at,
      updated_at: result.updated_at,
      last_accessed: result.last_accessed,
      access_count: result.access_count,
      completions: result.completions,
      tags_confirmed: result.tags_confirmed,
      // Add thumbnail processing flags - prioritize output thumbnail for output videos, subject thumbnail for others
      has_thumbnail: result.type === 'video' ?
        (result.purpose === 'output' ? !!result.thumbnail_uuid : !!result.subject_thumbnail_uuid) :
        !!result.thumbnail_uuid,
      thumbnail: null as string | null,
      // Include raw thumbnail data for processing
      _video_thumbnail_data: result.video_thumbnail_data,
      _video_thumbnail_filename: result.video_thumbnail_filename,
      _subject_thumbnail_data: result.subject_thumbnail_data,
      _subject_thumbnail_filename: result.subject_thumbnail_filename
    }))

    // Process thumbnails and images if include_thumbnails or include_images is explicitly true
    if (include_thumbnails === 'true' || include_thumbnails === true || include_images === 'true' || include_images === true) {
      logger.info('🖼️ Setting thumbnail URLs for media results...')
      
      for (const result of transformedResults) {
        // Handle video thumbnails - prioritize video thumbnail for dest and output videos, subject thumbnail for others
        if (result.type === 'video') {
          let thumbnailUuid = null
          
          // For destination videos, ONLY use video thumbnails - never subject thumbnails
          if (result.purpose === 'dest') {
            thumbnailUuid = result.thumbnail_uuid
          }
          // For output videos, prioritize video thumbnail over subject thumbnail
          else if (result.purpose === 'output') {
            thumbnailUuid = result.thumbnail_uuid || result.subject_thumbnail_uuid
          } else {
            // For other videos (source, intermediate), prioritize subject thumbnail
            thumbnailUuid = result.subject_thumbnail_uuid || result.thumbnail_uuid
          }
          
          if (thumbnailUuid) {
            result.thumbnail = `/api/media/${thumbnailUuid}/image?size=thumbnail`
          } else {
            logger.warn(`⚠️ Video ${result.uuid} has no thumbnail available`)
          }
        }
        
        // Handle image data directly - images use their own data as thumbnail
        else if (result.type === 'image') {
          result.thumbnail = `/api/media/${result.uuid}/image?size=thumbnail`
        }
        
        // Clean up internal fields
        const { _video_thumbnail_data, _video_thumbnail_filename, _subject_thumbnail_data, _subject_thumbnail_filename, ...cleanResult } = result
        Object.assign(result, cleanResult)
      }
    } else {
      logger.info('🚫 Skipping thumbnail processing - include_thumbnails is false')
    }

    const response = {
      results: transformedResults,
      count: transformedResults.length,
      limit: limitNum,
      offset: offsetNum,
      total_count: totalCount
    }

    logger.info('🔍 Media search completed:', {
      total_results: transformedResults.length,
      total_count: totalCount,
      videos_with_thumbnails: transformedResults.filter(r => r.type === 'video' && r.has_thumbnail).length
    })

    return response

  } catch (error: any) {
    logger.error('Error searching media from database:', error)
    
    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to search media: ${error.message || 'Unknown error'}`
    })
  }
})