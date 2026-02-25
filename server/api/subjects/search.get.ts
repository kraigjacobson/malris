import { ilike, and, or, isNotNull, isNull, sql, desc, asc } from 'drizzle-orm'
import { subjects, mediaRecords, jobs } from '~/server/utils/schema'
import { getDb } from '~/server/utils/database'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async event => {
  try {
    const query = getQuery(event)

    // Extract query parameters
    const name_pattern = (query.name_pattern as string) || ''
    const tags = query.tags ? (query.tags as string).split(',').filter(Boolean) : undefined
    const tag_match_mode = (query.tag_match_mode as string) || 'partial'
    const has_hero_image = query.has_hero_image !== undefined ? query.has_hero_image === 'true' : undefined
    const limit = query.limit ? parseInt(query.limit as string) : undefined
    const offset = parseInt(query.offset as string) || 0
    const page = parseInt(query.page as string) || 1

    // Name category filters
    const name_filters = {
      celeb: query.name_filter_celeb === 'true',
      asmr: query.name_filter_asmr === 'true',
      real: query.name_filter_real === 'true'
    }

    // Calculate offset from page if provided - only if limit is specified
    const calculatedOffset = limit && page > 1 ? (page - 1) * limit : offset

    // Add sorting parameters with validation
    const sortBy = (query.sort_by as string) || 'total_jobs'
    const sortOrder = (query.sort_order as string) || 'desc'

    const startTime = Date.now()
    logger.info('🔍 Searching subjects via ORM...')

    const db = getDb()
    const dbConnectTime = Date.now() - startTime
    logger.info(`⏱️ DB connection: ${dbConnectTime}ms`)

    // Build WHERE conditions
    const whereConditions = []

    if (name_pattern) {
      whereConditions.push(ilike(subjects.name, `%${name_pattern}%`))
    }

    // Add name category filtering
    if (name_filters.celeb || name_filters.asmr || name_filters.real) {
      const nameConditions = []

      if (name_filters.celeb) {
        nameConditions.push(ilike(subjects.name, '%celeb%'))
      }

      if (name_filters.asmr) {
        nameConditions.push(ilike(subjects.name, '%asmr%'))
      }

      if (name_filters.real) {
        // Real means names that don't contain 'celeb' or 'asmr'
        nameConditions.push(and(sql`${subjects.name} NOT ILIKE '%celeb%'`, sql`${subjects.name} NOT ILIKE '%asmr%'`))
      }

      // Use OR logic for name filters - any of the selected categories
      if (nameConditions.length > 0) {
        whereConditions.push(or(...nameConditions))
      }
    }

    if (has_hero_image !== undefined) {
      if (has_hero_image) {
        whereConditions.push(isNotNull(subjects.thumbnail))
      } else {
        whereConditions.push(isNull(subjects.thumbnail))
      }
    }

    // Add tag filtering
    if (tags && tags.length > 0) {
      const tagConditions = tags.map(tag => {
        if (tag_match_mode === 'partial') {
          // Use JSONB array element text search for partial matching
          return sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${subjects.tags}->'tags') AS tag_elem WHERE tag_elem ILIKE ${`%${tag}%`})`
        } else {
          // Exact match using JSONB contains operator
          return sql`${subjects.tags}->'tags' ? ${tag}`
        }
      })
      // Use AND logic - all tags must be found
      whereConditions.push(and(...tagConditions))
    }

    // Use optimized correlated subqueries instead of JOINs to avoid slow Cartesian product
    // This is MUCH faster as it pre-aggregates counts independently
    const baseSelect = db
      .select({
        id: subjects.id,
        name: subjects.name,
        thumbnail: subjects.thumbnail,
        tags: subjects.tags,
        createdAt: subjects.createdAt,
        updatedAt: subjects.updatedAt,
        has_thumbnail: sql<boolean>`CASE WHEN ${subjects.thumbnail} IS NOT NULL THEN true ELSE false END`,
        output_video_count: sql<number>`(
          SELECT COUNT(*)
          FROM ${mediaRecords}
          WHERE ${mediaRecords.subjectUuid} = ${subjects.id}
            AND ${mediaRecords.purpose} = 'output'
            AND ${mediaRecords.type} = 'video'
        )`,
        pending_job_count: sql<number>`(
          SELECT COUNT(*)
          FROM ${jobs}
          WHERE ${jobs.subjectUuid} = ${subjects.id}
            AND ${jobs.status} IN ('queued', 'active', 'need_input')
        )`,
        completed_job_count: sql<number>`(
          SELECT COUNT(*)
          FROM ${jobs}
          WHERE ${jobs.subjectUuid} = ${subjects.id}
            AND ${jobs.status} = 'completed'
        )`,
        total_job_count: sql<number>`(
          SELECT COUNT(*)
          FROM ${jobs}
          WHERE ${jobs.subjectUuid} = ${subjects.id}
        )`
      })
      .from(subjects)

    // Apply WHERE conditions if any
    const queryWithWhere = whereConditions.length > 0 ? baseSelect.where(and(...whereConditions)) : baseSelect

    // Apply sorting
    let queryWithSort
    const sortDirection = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'asc'

    if (sortBy === 'name') {
      queryWithSort = sortDirection === 'desc' ? queryWithWhere.orderBy(desc(subjects.name)) : queryWithWhere.orderBy(asc(subjects.name))
    } else if (sortBy === 'created_at') {
      queryWithSort = sortDirection === 'desc' ? queryWithWhere.orderBy(desc(subjects.createdAt)) : queryWithWhere.orderBy(asc(subjects.createdAt))
    } else if (sortBy === 'updated_at') {
      queryWithSort = sortDirection === 'desc' ? queryWithWhere.orderBy(desc(subjects.updatedAt)) : queryWithWhere.orderBy(asc(subjects.updatedAt))
    } else if (sortBy === 'total_jobs') {
      queryWithSort = sortDirection === 'desc' ? queryWithWhere.orderBy(desc(sql`(SELECT COUNT(*) FROM ${jobs} WHERE ${jobs.subjectUuid} = ${subjects.id})`)) : queryWithWhere.orderBy(asc(sql`(SELECT COUNT(*) FROM ${jobs} WHERE ${jobs.subjectUuid} = ${subjects.id})`))
    } else {
      // Default to total job count descending (most jobs first)
      queryWithSort = queryWithWhere.orderBy(desc(sql`(SELECT COUNT(*) FROM ${jobs} WHERE ${jobs.subjectUuid} = ${subjects.id})`))
    }

    // Apply pagination only if limit is specified
    const queryStartTime = Date.now()
    let result
    if (limit) {
      result = await queryWithSort.limit(limit).offset(calculatedOffset)
    } else {
      // No pagination - return all results
      result = await queryWithSort
    }
    const queryTime = Date.now() - queryStartTime
    logger.info(`⏱️ Main query execution: ${queryTime}ms`)

    // Get total count for pagination - use the same WHERE conditions for accuracy
    const countStartTime = Date.now()
    const countSelect = db.select({ count: sql<number>`count(*)` }).from(subjects)
    const countQuery = whereConditions.length > 0 ? countSelect.where(and(...whereConditions)) : countSelect
    const countResult = await countQuery
    const totalCount = countResult[0]?.count || 0
    const countTime = Date.now() - countStartTime
    logger.info(`⏱️ Count query execution: ${countTime}ms`)

    // Process results to set thumbnail URLs instead of decrypting data
    const processStartTime = Date.now()
    const processedSubjects = result.map(subject => {
      let thumbnail_url = null

      if (subject.thumbnail) {
        // Return higher quality thumbnail URL instead of base64 data for much faster responses
        thumbnail_url = `/api/media/${subject.thumbnail}/image?size=sm`
      }

      return {
        id: subject.id,
        name: subject.name,
        thumbnail: subject.thumbnail,
        tags: subject.tags,
        created_at: subject.createdAt,
        updated_at: subject.updatedAt,
        has_thumbnail: subject.has_thumbnail,
        thumbnail_url,
        output_video_count: subject.output_video_count || 0,
        pending_job_count: subject.pending_job_count || 0,
        completed_job_count: subject.completed_job_count || 0,
        total_job_count: subject.total_job_count || 0
      }
    })
    const processTime = Date.now() - processStartTime

    const totalTime = Date.now() - startTime
    logger.info(`✅ Found ${processedSubjects.length} subjects (${totalCount} total)`)
    logger.info(`⏱️ Processing results: ${processTime}ms`)
    logger.info(`⏱️ Total time: ${totalTime}ms (query: ${queryTime}ms, count: ${countTime}ms, process: ${processTime}ms)`)

    const response: any = {
      subjects: processedSubjects,
      total: totalCount
    }

    // Only include pagination info if limit was specified
    if (limit) {
      response.pagination = {
        page,
        limit,
        offset: calculatedOffset,
        total: totalCount,
        has_more: calculatedOffset + limit < totalCount
      }
    }

    return response
  } catch (error: any) {
    logger.error('Subjects search error:', error)

    // Handle database errors
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to search subjects',
      data: { message: error.message || 'Database error occurred' }
    })
  }
})
