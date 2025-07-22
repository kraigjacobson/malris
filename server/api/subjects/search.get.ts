import { eq, ilike, and, or, isNotNull, isNull, sql, desc, asc } from 'drizzle-orm'
import { subjects, mediaRecords } from '~/server/utils/schema'
import { getDb } from '~/server/utils/database'
import { decryptMediaData } from '~/server/utils/encryption'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    
    // Extract query parameters
    const name_pattern = query.name_pattern as string || ''
    const tags = query.tags ? (query.tags as string).split(',').filter(Boolean) : undefined
    const tag_match_mode = (query.tag_match_mode as string) || 'partial'
    const has_hero_image = query.has_hero_image !== undefined ? query.has_hero_image === 'true' : undefined
    const limit = parseInt(query.limit as string) || 20
    const offset = parseInt(query.offset as string) || 0
    const page = parseInt(query.page as string) || 1
    
    // Calculate offset from page if provided
    const calculatedOffset = page > 1 ? (page - 1) * limit : offset
    
    // Add sorting parameters with validation
    const sortBy = (query.sort_by as string) || 'name'
    const sortOrder = (query.sort_order as string) || 'asc'
    
    console.log('🔍 Subjects search params:', { name_pattern, tags, tag_match_mode, has_hero_image, limit, page })
    
    console.log('🔍 Searching subjects via ORM...')

    const db = getDb()

    // Build WHERE conditions
    const whereConditions = []

    if (name_pattern) {
      whereConditions.push(ilike(subjects.name, `%${name_pattern}%`))
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
      const tagConditions = tags.map((tag) => {
        if (tag_match_mode === 'partial') {
          // Use JSONB array element text search for partial matching
          return sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${subjects.tags}->'tags') AS tag_elem WHERE tag_elem ILIKE ${`%${tag}%`})`
        } else {
          // Exact match using JSONB contains operator
          return sql`${subjects.tags}->'tags' ? ${tag}`
        }
      })
      whereConditions.push(or(...tagConditions))
    }

    // Build the query step by step to avoid TypeScript issues
    const baseSelect = db
      .select({
        id: subjects.id,
        name: subjects.name,
        thumbnail: subjects.thumbnail,
        tags: subjects.tags,
        createdAt: subjects.createdAt,
        updatedAt: subjects.updatedAt,
        has_thumbnail: sql<boolean>`CASE WHEN ${subjects.thumbnail} IS NOT NULL THEN true ELSE false END`,
        encryptedThumbnailData: mediaRecords.encryptedData
      })
      .from(subjects)
      .leftJoin(mediaRecords, eq(subjects.thumbnail, mediaRecords.uuid))

    // Apply WHERE conditions if any
    const queryWithWhere = whereConditions.length > 0 
      ? baseSelect.where(and(...whereConditions))
      : baseSelect

    // Apply sorting
    let queryWithSort
    const sortDirection = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'asc'
    
    if (sortBy === 'name') {
      queryWithSort = sortDirection === 'desc' 
        ? queryWithWhere.orderBy(desc(subjects.name))
        : queryWithWhere.orderBy(asc(subjects.name))
    } else if (sortBy === 'created_at') {
      queryWithSort = sortDirection === 'desc' 
        ? queryWithWhere.orderBy(desc(subjects.createdAt))
        : queryWithWhere.orderBy(asc(subjects.createdAt))
    } else if (sortBy === 'updated_at') {
      queryWithSort = sortDirection === 'desc' 
        ? queryWithWhere.orderBy(desc(subjects.updatedAt))
        : queryWithWhere.orderBy(asc(subjects.updatedAt))
    } else {
      // Default to name sorting
      queryWithSort = queryWithWhere.orderBy(asc(subjects.name))
    }

    // Apply pagination
    const result = await queryWithSort.limit(limit).offset(calculatedOffset)

    // Get total count for pagination
    const countSelect = db.select({ count: sql<number>`count(*)` }).from(subjects)
    const countQuery = whereConditions.length > 0 
      ? countSelect.where(and(...whereConditions))
      : countSelect
    const countResult = await countQuery
    const totalCount = countResult[0]?.count || 0

    // Get encryption key from environment
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
    if (!encryptionKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media encryption key not configured',
        data: { message: 'MEDIA_ENCRYPTION_KEY environment variable is required' }
      })
    }

    // Process results to decrypt thumbnail data
    const processedSubjects = await Promise.all(result.map(async (subject) => {
      let thumbnail_data = null
      
      if (subject.encryptedThumbnailData) {
        try {
          const decryptedData = decryptMediaData(subject.encryptedThumbnailData, encryptionKey)
          thumbnail_data = decryptedData.toString('base64')
        } catch (error) {
          console.error('Failed to decrypt thumbnail for subject:', subject.id, error)
        }
      }

      return {
        id: subject.id,
        name: subject.name,
        thumbnail: subject.thumbnail,
        tags: subject.tags,
        created_at: subject.createdAt,
        updated_at: subject.updatedAt,
        has_thumbnail: subject.has_thumbnail,
        thumbnail_data
      }
    }))
    
    console.log(`✅ Found ${processedSubjects.length} subjects (${totalCount} total)`)

    return {
      subjects: processedSubjects,
      pagination: {
        page,
        limit,
        offset: calculatedOffset,
        total: totalCount,
        has_more: calculatedOffset + limit < totalCount
      }
    }
    
  } catch (error: any) {
    console.error('Subjects search error:', error)
    
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