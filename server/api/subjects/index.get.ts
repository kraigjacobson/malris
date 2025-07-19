/**
 * Get paginated subjects with comprehensive filtering and sorting
 * Replaces the FastAPI /subjects route
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      // Parse query parameters
      const page = parseInt((query.page as string) || '1')
      const perPage = parseInt((query.per_page as string) || '20')
      const namePattern = query.name_pattern as string
      const tags = query.tags as string
      const notePattern = query.note_pattern as string
      const hasHeroImage = query.has_hero_image as string
      const sortBy = (query.sort_by as string) || 'created_at'
      const sortOrder = (query.sort_order as string) || 'desc'
      const imageSize = (query.image_size as string) || 'md'
      const includeImages = query.include_images === 'true'
      const nameOnly = query.name_only === 'true'
      
      // Validate parameters
      if (!['thumb', 'sm', 'md', 'lg'].includes(imageSize)) {
        throw createError({
          statusCode: 400,
          statusMessage: "image_size must be 'thumb', 'sm', 'md', or 'lg'"
        })
      }
      
      const validSortFields = ['name', 'created_at', 'updated_at']
      if (!validSortFields.includes(sortBy)) {
        throw createError({
          statusCode: 400,
          statusMessage: `sort_by must be one of: ${validSortFields.join(', ')}`
        })
      }
      
      if (!['asc', 'desc'].includes(sortOrder.toLowerCase())) {
        throw createError({
          statusCode: 400,
          statusMessage: "sort_order must be 'asc' or 'desc'"
        })
      }
      
      // Handle fast name-only queries
      if (nameOnly) {
        const conditions: string[] = []
        const params: any[] = []
        let paramIndex = 1
        
        // Apply filters for name-only query
        if (namePattern) {
          conditions.push(`name ILIKE $${paramIndex}`)
          params.push(`%${namePattern}%`)
          paramIndex++
        }
        
        if (tags) {
          const tagList = tags.split(',').map(tag => tag.trim()).filter(tag => tag)
          for (const tag of tagList) {
            conditions.push(`tags->'tags' ? $${paramIndex}`)
            params.push(tag)
            paramIndex++
          }
        }
        
        if (notePattern) {
          conditions.push(`note ILIKE $${paramIndex}`)
          params.push(`%${notePattern}%`)
          paramIndex++
        }
        
        if (hasHeroImage !== undefined) {
          if (hasHeroImage === 'true') {
            conditions.push('hero_image_uuid IS NOT NULL')
          } else {
            conditions.push('hero_image_uuid IS NULL')
          }
        }
        
        let nameQuery = 'SELECT id, name FROM subjects'
        if (conditions.length > 0) {
          nameQuery += ` WHERE ${conditions.join(' AND ')}`
        }
        
        // Add sorting
        nameQuery += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`
        
        // Add pagination
        const offset = (page - 1) * perPage
        nameQuery += ` LIMIT ${perPage} OFFSET ${offset}`
        
        const countQuery = `SELECT COUNT(*) as count FROM subjects${conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''}`
        
        const [results, countResult] = await Promise.all([
          client.query(nameQuery, params),
          client.query(countQuery, params)
        ])
        
        const totalCount = parseInt(countResult.rows[0]?.count || '0')
        
        return {
          subjects: results.rows.map(row => ({
            id: row.id,
            name: row.name
          })),
          total_count: totalCount,
          page,
          per_page: perPage,
          total_pages: Math.ceil(totalCount / perPage),
          name_only: true
        }
      }
      
      // Build full query with conditions
      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1
      
      if (namePattern) {
        conditions.push(`s.name ILIKE $${paramIndex}`)
        params.push(`%${namePattern}%`)
        paramIndex++
      }
      
      if (tags) {
        const tagList = tags.split(',').map(tag => tag.trim()).filter(tag => tag)
        for (const tag of tagList) {
          conditions.push(`s.tags->'tags' ? $${paramIndex}`)
          params.push(tag)
          paramIndex++
        }
      }
      
      if (notePattern) {
        conditions.push(`s.note ILIKE $${paramIndex}`)
        params.push(`%${notePattern}%`)
        paramIndex++
      }
      
      if (hasHeroImage !== undefined) {
        if (hasHeroImage === 'true') {
          conditions.push('s.hero_image_uuid IS NOT NULL')
        } else {
          conditions.push('s.hero_image_uuid IS NULL')
        }
      }
      
      // Build main query
      let mainQuery = `
        SELECT 
          s.id,
          s.name,
          s.tags,
          s.note,
          s.hero_image_uuid,
          s.created_at,
          s.updated_at,
          m.filename as hero_image_filename,
          m.type as hero_image_type
        FROM subjects s
        LEFT JOIN media_records m ON s.hero_image_uuid = m.uuid
      `
      
      if (conditions.length > 0) {
        mainQuery += ` WHERE ${conditions.join(' AND ')}`
      }
      
      // Add sorting
      mainQuery += ` ORDER BY s.${sortBy} ${sortOrder.toUpperCase()}`
      
      // Add pagination
      const offset = (page - 1) * perPage
      mainQuery += ` LIMIT ${perPage} OFFSET ${offset}`
      
      // Get count
      const countQuery = `
        SELECT COUNT(*) as count 
        FROM subjects s
        ${conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''}
      `
      
      const [results, countResult] = await Promise.all([
        client.query(mainQuery, params),
        client.query(countQuery, params)
      ])
      
      const totalCount = parseInt(countResult.rows[0]?.count || '0')
      
      // Process results
      const subjects = results.rows.map(row => ({
        id: row.id,
        name: row.name,
        tags: row.tags,
        note: row.note,
        hero_image_uuid: row.hero_image_uuid,
        created_at: row.created_at,
        updated_at: row.updated_at,
        hero_image: row.hero_image_filename ? {
          filename: row.hero_image_filename,
          type: row.hero_image_type
        } : null,
        thumbnail: row.hero_image_uuid // Will be used for image data if includeImages is true
      }))
      
      // TODO: Add image data processing if includeImages is true
      // This would require decrypting and resizing the hero images
      
      return {
        subjects,
        total_count: totalCount,
        page,
        per_page: perPage,
        total_pages: Math.ceil(totalCount / perPage),
        images_included: includeImages,
        name_only: false
      }
      
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to get subjects: ${error.message || 'Unknown error'}`
    })
  }
})