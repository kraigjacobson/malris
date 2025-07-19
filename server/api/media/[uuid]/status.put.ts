/**
 * Update media record status
 * Replaces the FastAPI /media/{record_uuid}/status PUT route
 */
export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: "UUID parameter is required"
      })
    }
    
    // Parse form data to get status
    const body = await readBody(event)
    const status = body.status
    
    if (!status) {
      throw createError({
        statusCode: 400,
        statusMessage: "Status is required"
      })
    }
    
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      // Check if record exists
      const checkQuery = 'SELECT uuid FROM media_records WHERE uuid = $1'
      const checkResult = await client.query(checkQuery, [uuid])
      
      if (checkResult.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Media record not found"
        })
      }
      
      // Update status
      const updateQuery = `
        UPDATE media_records 
        SET status = $1, updated_at = NOW() 
        WHERE uuid = $2
      `
      await client.query(updateQuery, [status, uuid])
      
      return {
        message: "Status updated successfully",
        uuid,
        status
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
      statusMessage: `Status update failed: ${error.message || 'Unknown error'}`
    })
  }
})