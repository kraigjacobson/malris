/**
 * Create a new subject
 * Replaces the FastAPI /subjects POST route
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { name, tags, note, hero_image_uuid } = body
    
    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: "Name is required"
      })
    }
    
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      // Parse tags
      let tagList: string[] = []
      if (tags) {
        if (typeof tags === 'string') {
          tagList = tags.split(',').map(tag => tag.trim()).filter(tag => tag)
        } else if (Array.isArray(tags)) {
          tagList = tags
        }
      }
      
      // Check if name already exists
      const checkQuery = 'SELECT id FROM subjects WHERE name = $1'
      const checkResult = await client.query(checkQuery, [name])
      
      if (checkResult.rows.length > 0) {
        throw createError({
          statusCode: 409,
          statusMessage: "Subject with this name already exists"
        })
      }
      
      // Verify hero image exists if provided
      if (hero_image_uuid) {
        const imageQuery = 'SELECT uuid FROM media_records WHERE uuid = $1 AND type = $2'
        const imageResult = await client.query(imageQuery, [hero_image_uuid, 'image'])
        
        if (imageResult.rows.length === 0) {
          throw createError({
            statusCode: 404,
            statusMessage: "Hero image not found"
          })
        }
      }
      
      // Create subject
      const insertQuery = `
        INSERT INTO subjects (name, tags, note, hero_image_uuid, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id, name, created_at
      `
      
      const tagsJson = tagList.length > 0 ? JSON.stringify({ tags: tagList }) : null
      const result = await client.query(insertQuery, [name, tagsJson, note || null, hero_image_uuid || null])
      
      const newSubject = result.rows[0]
      
      return {
        id: newSubject.id,
        name: newSubject.name,
        message: "Subject created successfully",
        created_at: newSubject.created_at
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
      statusMessage: `Failed to create subject: ${error.message || 'Unknown error'}`
    })
  }
})