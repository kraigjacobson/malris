import { logger } from '~/server/utils/logger'
/**
 * Update subject tags
 */
export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const body = await readBody(event)
    
    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Subject ID is required"
      })
    }
    
    if (!body || !Array.isArray(body.tags)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Tags array is required"
      })
    }
    
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      // First get the current tags structure to preserve metadata
      const getCurrentQuery = `SELECT tags FROM subjects WHERE id = $1`
      const currentResult = await client.query(getCurrentQuery, [id])
      
      if (currentResult.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Subject not found"
        })
      }
      
      // Parse existing tags structure or create new one
      let tagsStructure
      try {
        tagsStructure = currentResult.rows[0].tags || {}
      } catch (parseError) {
        logger.warn('Failed to parse existing tags structure:', parseError)
        tagsStructure = {}
      }
      
      // Update only the tags array while preserving other metadata
      tagsStructure.tags = body.tags
      tagsStructure.tag_count = body.tags.length
      tagsStructure.processed_at = new Date().toISOString()
      
      // Update subject tags
      const updateQuery = `
        UPDATE subjects
        SET tags = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, name, tags, note, created_at, updated_at
      `
      
      const result = await client.query(updateQuery, [JSON.stringify(tagsStructure), id])
      
      if (result.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Subject not found"
        })
      }
      
      return {
        success: true,
        subject: result.rows[0]
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
      statusMessage: `Failed to update subject tags: ${error.message || 'Unknown error'}`
    })
  }
})