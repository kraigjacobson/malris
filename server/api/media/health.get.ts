export default defineEventHandler(async (_event) => {
  try {
    console.log('Checking Nuxt backend health...')

    // Check internal Nuxt backend health instead of external media server
    // Check database connection
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()

    try {
      // Simple query to test database connectivity
      await client.query('SELECT 1')
      client.release()

      return {
        status: 'healthy',
        backend: 'operational',
        database: 'connected',
        message: 'Nuxt backend and database are running'
      }
    } catch (dbError) {
      client.release()
      throw dbError
    }

  } catch (error: any) {
    console.error('Backend health check failed:', error)
    
    return {
      status: 'unhealthy',
      error: error.message || 'Unknown error',
      details: 'Nuxt backend or database connection failed',
      suggestion: 'Check database connection and server status'
    }
  }
})