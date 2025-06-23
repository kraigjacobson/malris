export default defineEventHandler(async (event) => {
  // Skip auth for public routes, login, media endpoints, and stream endpoints
  if (event.node.req.url?.startsWith('/api/public') ||
      event.node.req.url === '/api/auth/login' ||
      event.node.req.url?.startsWith('/api/media/') ||
      event.node.req.url?.startsWith('/api/stream/')) {
    console.log('Skipping auth for:', event.node.req.url)
    return
  }
  
  // Only protect API routes that need authentication
  if (event.node.req.url?.startsWith('/api/')) {
    try {
      // Import serverSupabaseUser from the Supabase module
      const { serverSupabaseUser } = await import('#supabase/server')
      const user = await serverSupabaseUser(event)
      
      if (!user) {
        console.log('No user found for API request:', event.node.req.url)
        throw createError({
          statusCode: 401,
          statusMessage: 'Authentication required'
        })
      }
      
      // Add user to event context for use in route handlers
      event.context.user = user
      console.log('User authenticated for API request:', event.node.req.url, 'User ID:', user.id)
    } catch (error) {
      console.error('Authentication error for API request:', event.node.req.url, error)
      throw createError({
        statusCode: 401,
        statusMessage: 'Authentication required'
      })
    }
  }
})