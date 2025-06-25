export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    
    // Extract query parameters
    const name_pattern = query.name_pattern as string || ''
    const tags = query.tags ? (query.tags as string).split(',').filter(Boolean) : undefined
    const note_pattern = query.note_pattern as string || ''
    const has_hero_image = query.has_hero_image !== undefined ? query.has_hero_image === 'true' : undefined
    const limit = parseInt(query.limit as string) || 20
    const offset = parseInt(query.offset as string) || 0
    const page = parseInt(query.page as string) || 1
    const image_size = (query.image_size as string) || 'sm'
    
    // Calculate offset from page if provided
    const calculatedOffset = page > 1 ? (page - 1) * limit : offset
    
    // Make request to media service
    const params = new URLSearchParams()
    if (name_pattern) params.append('name_pattern', name_pattern)
    if (note_pattern) params.append('note_pattern', note_pattern)
    if (tags && tags.length > 0) params.append('tags', tags.join(','))
    if (has_hero_image !== undefined) params.append('has_hero_image', has_hero_image.toString())
    
    // Date filters
    if (query.created_after) params.append('created_after', query.created_after as string)
    if (query.created_before) params.append('created_before', query.created_before as string)
    if (query.updated_after) params.append('updated_after', query.updated_after as string)
    if (query.updated_before) params.append('updated_before', query.updated_before as string)
    
    params.append('per_page', limit.toString())
    params.append('page', page.toString())
    params.append('image_size', image_size)
    params.append('include_images', 'true') // Enable hero images
    
    // Add sorting parameters with validation
    const validSubjectSortFields = ['name', 'created_at', 'updated_at']
    const sortBy = (query.sort_by as string) || 'name'
    const sortOrder = (query.sort_order as string) || 'asc'
    
    // Validate and add sort parameters
    if (validSubjectSortFields.includes(sortBy)) {
      params.append('sort_by', sortBy)
    } else {
      params.append('sort_by', 'name')
    }
    
    if (['asc', 'desc'].includes(sortOrder.toLowerCase())) {
      params.append('sort_order', sortOrder.toLowerCase())
    } else {
      params.append('sort_order', 'asc')
    }
    
    console.log('🔍 Subjects search params:', Object.fromEntries(params))
    
    // Make request to subjects API - now always returns JSON with embedded base64 hero images
    const response = await fetch(`http://localhost:8000/subjects?${params.toString()}`, {
      method: 'GET'
    })

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: `Subjects API error: ${response.statusText}`
      })
    }

    const jsonResponse = await response.json()
    
    console.log('📊 Subjects API Response:')
    console.log('- Total subjects:', jsonResponse.subjects?.length || 0)
    console.log('- Images included:', jsonResponse.images_included || false)

    return {
      subjects: jsonResponse.subjects || [],
      pagination: {
        page,
        limit,
        offset: calculatedOffset,
        total: jsonResponse.pagination?.total_count || 0,
        has_more: jsonResponse.pagination?.has_next || false
      }
    }
    
  } catch (error: any) {
    console.error('Subjects search error:', error)
    
    // Handle different error types
    if (error.cause?.code === 'ECONNREFUSED') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Media service unavailable',
        data: { message: 'Could not connect to media service on localhost:8000' }
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to search subjects',
      data: { message: error.message || 'Unknown error occurred' }
    })
  }
})