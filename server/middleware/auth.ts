import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  // Only apply auth to routes in the /api/auth/ folder
  if (!event.node.req.url?.startsWith('/api/auth/')) {
    return
  }

  const config = useRuntimeConfig()
  const supabaseUrl = config.supabaseUrl
  const supabaseKey = config.supabaseKey

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration')
    return
  }

  // Get the authorization header
  const authHeader = getHeader(event, 'authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Missing or invalid authorization header'
    })
  }

  const token = authHeader.replace('Bearer ', '')

  try {
    // Create Supabase client for server-side auth verification
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Verify the JWT token
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid or expired token'
      })
    }

    // Add user to the event context for use in API routes
    event.context.user = user
    
  } catch (error) {
    console.error('Auth verification error:', error)
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication failed'
    })
  }
})