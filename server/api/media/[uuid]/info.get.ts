/**
 * Get media record information (without file data)
 * Replaces the FastAPI /media/{record_uuid} route
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
    
    // Get media record from database
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      const query = `
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
        WHERE uuid = $1
      `
      
      const result = await client.query(query, [uuid])
      
      if (result.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Media record not found"
        })
      }
      
      const record = result.rows[0]
      
      // Update last_accessed timestamp
      await client.query(
        'UPDATE media_records SET last_accessed = NOW(), access_count = access_count + 1 WHERE uuid = $1',
        [uuid]
      )
      
      return {
        uuid: record.uuid,
        filename: record.filename,
        type: record.type,
        purpose: record.purpose,
        status: record.status,
        file_size: record.file_size,
        original_size: record.original_size,
        width: record.width,
        height: record.height,
        duration: record.duration,
        tags: record.tags,
        subject_uuid: record.subject_uuid,
        source_media_uuid_ref: record.source_media_uuid_ref,
        dest_media_uuid_ref: record.dest_media_uuid_ref,
        job_id: record.job_id,
        thumbnail_uuid: record.thumbnail_uuid,
        created_at: record.created_at,
        updated_at: record.updated_at,
        last_accessed: record.last_accessed,
        access_count: record.access_count + 1, // Return updated count
        completions: record.completions
      }
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: "Media record not found"
      })
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to get media info: ${error instanceof Error ? error.message : String(error)}`
    })
  }
})