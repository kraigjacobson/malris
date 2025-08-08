import { logger } from '~/server/utils/logger'
/**
 * Direct media search endpoint (bypasses external API)
 * Replaces the FastAPI /media/search route with direct database access
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      // Build WHERE conditions
      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1
      
      // Basic filters
      if (query.media_type) {
        conditions.push(`type = $${paramIndex}`)
        params.push(query.media_type)
        paramIndex++
      }
      
      if (query.purpose) {
        conditions.push(`purpose = $${paramIndex}`)
        params.push(query.purpose)
        paramIndex++
      }
      
      if (query.status) {
        conditions.push(`status = $${paramIndex}`)
        params.push(query.status)
        paramIndex++
      }
      
      if (query.subject_uuid) {
        conditions.push(`subject_uuid = $${paramIndex}`)
        params.push(query.subject_uuid)
        paramIndex++
      }
      
      if (query.job_id) {
        conditions.push(`job_id = $${paramIndex}`)
        params.push(query.job_id)
        paramIndex++
      }
      
      // File size filters
      if (query.min_file_size) {
        conditions.push(`file_size >= $${paramIndex}`)
        params.push(parseInt(query.min_file_size as string))
        paramIndex++
      }
      
      if (query.max_file_size) {
        conditions.push(`file_size <= $${paramIndex}`)
        params.push(parseInt(query.max_file_size as string))
        paramIndex++
      }
      
      // Dimension filters
      if (query.min_width) {
        conditions.push(`width >= $${paramIndex}`)
        params.push(parseInt(query.min_width as string))
        paramIndex++
      }
      
      if (query.max_width) {
        conditions.push(`width <= $${paramIndex}`)
        params.push(parseInt(query.max_width as string))
        paramIndex++
      }
      
      if (query.min_height) {
        conditions.push(`height >= $${paramIndex}`)
        params.push(parseInt(query.min_height as string))
        paramIndex++
      }
      
      if (query.max_height) {
        conditions.push(`height <= $${paramIndex}`)
        params.push(parseInt(query.max_height as string))
        paramIndex++
      }
      
      // Duration filters
      if (query.min_duration) {
        conditions.push(`duration >= $${paramIndex}`)
        params.push(parseFloat(query.min_duration as string))
        paramIndex++
      }
      
      if (query.max_duration) {
        conditions.push(`duration <= $${paramIndex}`)
        params.push(parseFloat(query.max_duration as string))
        paramIndex++
      }
      
      // Filename pattern
      if (query.filename_pattern) {
        conditions.push(`filename ILIKE $${paramIndex}`)
        params.push(`%${query.filename_pattern}%`)
        paramIndex++
      }
      
      // Tags search (JSONB)
      if (query.tags) {
        const tagList = (query.tags as string).split(',').map(tag => tag.trim()).filter(tag => tag)
        const tagMatchMode = (query.tag_match_mode as string) || 'exact'
        
        if (tagMatchMode === 'exact') {
          // Exact tag matching
          for (const tag of tagList) {
            conditions.push(`tags->'tags' ? $${paramIndex}`)
            params.push(tag)
            paramIndex++
          }
        } else {
          // Partial tag matching using JSONB path expressions
          for (const tag of tagList) {
            conditions.push(`jsonb_path_exists(tags->'tags', $${paramIndex})`)
            params.push(`$[*] ? (@ like_regex "${tag}.*" flag "i")`)
            paramIndex++
          }
        }
      }
      
      // Build the main query
      let baseQuery = `
        SELECT 
          uuid,
          filename,
          type,
          purpose,
          status,
          file_size,
          original_size,
          width,
          height,
          duration,
          tags,
          subject_uuid,
          source_media_uuid_ref,
          dest_media_uuid_ref,
          job_id,
          thumbnail_uuid,
          created_at,
          updated_at,
          last_accessed,
          access_count,
          completions
        FROM media_records
      `
      
      if (conditions.length > 0) {
        baseQuery += ` WHERE ${conditions.join(' AND ')}`
      }
      
      // Add sorting
      const sortBy = (query.sort_by as string) || 'random'
      const sortOrder = (query.sort_order as string) || 'desc'
      const validSortFields = ['filename', 'type', 'purpose', 'status', 'file_size', 'original_size', 'width', 'height', 'duration', 'created_at', 'updated_at', 'last_accessed', 'access_count', 'random']
      
      if (sortBy === 'random') {
        // Use PostgreSQL's RANDOM() function for true database-level random sorting
        baseQuery += ` ORDER BY RANDOM()`
      } else if (validSortFields.includes(sortBy)) {
        baseQuery += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`
      } else {
        baseQuery += ` ORDER BY created_at DESC`
      }
      
      // Handle random selection
      if (query.pick_random === 'true') {
        const countQuery = `SELECT COUNT(*) as count FROM media_records${conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''}`
        const countResult = await client.query(countQuery, params)
        const totalCount = parseInt(countResult.rows[0]?.count || '0')
        
        if (totalCount === 0) {
          throw createError({
            statusCode: 404,
            statusMessage: "No media found matching the specified criteria"
          })
        }
        
        const randomOffset = Math.floor(Math.random() * totalCount)
        baseQuery += ` LIMIT 1 OFFSET ${randomOffset}`
        
        const result = await client.query(baseQuery, params)
        const record = result.rows[0]
        
        return {
          uuid: record.uuid,
          media_type: record.type,
          filename: record.filename,
          purpose: record.purpose,
          total_matching: totalCount,
          random_selection: true,
          record: record
        }
      }
      
      // Add pagination
      const limit = parseInt((query.limit as string) || '100')
      const offset = parseInt((query.offset as string) || '0')
      
      baseQuery += ` LIMIT ${limit} OFFSET ${offset}`
      
      // Execute query
      const result = await client.query(baseQuery, params)
      
      return {
        results: result.rows,
        count: result.rows.length,
        limit,
        offset,
        search_params: query.tags ? {
          tags: (query.tags as string).split(',').map(tag => tag.trim()),
          tag_match_mode: query.tag_match_mode || 'exact'
        } : undefined
      }
      
    } finally {
      client.release()
    }
  } catch (error: any) {
    logger.error('Error in direct media search:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to search media: ${error.message || 'Unknown error'}`
    })
  }
})