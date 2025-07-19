/**
 * Get storage statistics
 * Replaces the FastAPI /stats route
 */
export default defineEventHandler(async (_event) => {
  try {
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      // Get media stats
      const mediaStatsQuery = `
        SELECT
          COUNT(*) as total_files,
          SUM(file_size) as total_size,
          SUM(original_size) as total_encrypted_size,
          COUNT(CASE WHEN type = 'image' THEN 1 END) as image_count,
          COUNT(CASE WHEN type = 'video' THEN 1 END) as video_count,
          COUNT(CASE WHEN type = 'audio' THEN 1 END) as audio_count,
          COUNT(CASE WHEN purpose = 'source' THEN 1 END) as source_count,
          COUNT(CASE WHEN purpose = 'dest' THEN 1 END) as dest_count,
          COUNT(CASE WHEN purpose = 'output' THEN 1 END) as output_count,
          COUNT(CASE WHEN purpose = 'intermediate' THEN 1 END) as intermediate_count
        FROM media_records
      `
      
      const subjectsQuery = 'SELECT COUNT(*) as count FROM subjects'
      const jobsQuery = 'SELECT COUNT(*) as count FROM jobs'
      
      const [mediaResult, subjectsResult, jobsResult] = await Promise.all([
        client.query(mediaStatsQuery),
        client.query(subjectsQuery),
        client.query(jobsQuery)
      ])
      
      const mediaStats = mediaResult.rows[0]
      const totalSize = parseInt(mediaStats.total_size || '0')
      const totalEncryptedSize = parseInt(mediaStats.total_encrypted_size || '0')
      
      return {
        total_files: parseInt(mediaStats.total_files || '0'),
        total_size: totalSize,
        total_encrypted_size: totalEncryptedSize,
        compression_ratio: totalEncryptedSize > 0 ? totalSize / totalEncryptedSize : 0,
        media_types: {
          image: parseInt(mediaStats.image_count || '0'),
          video: parseInt(mediaStats.video_count || '0'),
          audio: parseInt(mediaStats.audio_count || '0')
        },
        purposes: {
          source: parseInt(mediaStats.source_count || '0'),
          dest: parseInt(mediaStats.dest_count || '0'),
          output: parseInt(mediaStats.output_count || '0'),
          intermediate: parseInt(mediaStats.intermediate_count || '0')
        },
        subjects_count: parseInt(subjectsResult.rows[0]?.count || '0'),
        jobs_count: parseInt(jobsResult.rows[0]?.count || '0')
      }
    } finally {
      client.release()
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`
    })
  }
})