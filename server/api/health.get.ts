/**
 * Health check endpoint
 * Replaces the FastAPI /health route
 */
export default defineEventHandler(async (_event) => {
  try {
    // Test database connection
    const { testConnection, getDbClient } = await import('~/server/utils/database')
    const isDbHealthy = await testConnection()
    
    let totalFiles = 0
    if (isDbHealthy) {
      try {
        const client = await getDbClient()
        const result = await client.query('SELECT COUNT(*) as count FROM media_records')
        totalFiles = parseInt(result.rows[0]?.count || '0')
        client.release()
      } catch (error) {
        console.warn('Could not get file count:', error)
      }
    }
    
    return {
      status: isDbHealthy ? "healthy" : "unhealthy",
      database: isDbHealthy ? "connected" : "disconnected",
      total_files: totalFiles,
      timestamp: new Date().toISOString(),
      service: "nuxt-media-api"
    }
  } catch (error) {
    throw createError({
      statusCode: 503,
      statusMessage: `Service unhealthy: ${error instanceof Error ? error.message : String(error)}`
    })
  }
})