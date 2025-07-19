/**
 * Get a specific subject with hero image
 * Replaces the FastAPI /subjects/{subject_id} route
 */
export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const query = getQuery(event)
    const imageSize = (query.image_size as string) || 'md'
    
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Subject ID is required"
      })
    }
    
    // Validate image_size
    if (!['thumb', 'sm', 'md', 'lg'].includes(imageSize)) {
      throw createError({
        statusCode: 400,
        statusMessage: "image_size must be 'thumb', 'sm', 'md', or 'lg'"
      })
    }
    
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      // Get subject with hero image info
      const subjectQuery = `
        SELECT 
          s.id,
          s.name,
          s.tags,
          s.note,
          s.hero_image_uuid,
          s.created_at,
          s.updated_at,
          m.filename as hero_image_filename,
          m.type as hero_image_type,
          m.width as hero_image_width,
          m.height as hero_image_height
        FROM subjects s
        LEFT JOIN media_records m ON s.hero_image_uuid = m.uuid
        WHERE s.id = $1
      `
      
      const result = await client.query(subjectQuery, [id])
      
      if (result.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Subject not found"
        })
      }
      
      const subject = result.rows[0]
      
      // Build response
      const response: any = {
        id: subject.id,
        name: subject.name,
        tags: subject.tags,
        note: subject.note,
        hero_image_uuid: subject.hero_image_uuid,
        created_at: subject.created_at,
        updated_at: subject.updated_at,
        hero_image: null
      }
      
      // Add hero image info if available
      if (subject.hero_image_uuid && subject.hero_image_filename) {
        response.hero_image = {
          uuid: subject.hero_image_uuid,
          filename: subject.hero_image_filename,
          type: subject.hero_image_type,
          width: subject.hero_image_width,
          height: subject.hero_image_height
        }
        
        // TODO: Add base64 image data if requested
        // This would require decrypting and resizing the hero image
        response.thumbnail = subject.hero_image_uuid
      }
      
      return response
      
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to get subject: ${error.message || 'Unknown error'}`
    })
  }
})