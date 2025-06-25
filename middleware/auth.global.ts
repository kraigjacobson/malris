export default defineNuxtRouteMiddleware(async (_to) => {
  // TODO: Authentication temporarily disabled - uncomment the code below to re-enable
  return
  
  /* COMMENTED OUT FOR NOW - UNCOMMENT TO RE-ENABLE AUTHENTICATION
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()
  
  // Allow access to login page
  if (to.path === '/login') {
    return
  }
  
  // Skip authentication for API routes - they should handle their own auth if needed
  if (to.path.startsWith('/api/')) {
    return
  }
  
  // Only check authentication on client side
  if (import.meta.client) {
    // Check if we should require login everytime
    try {
      // Import localforage dynamically to avoid SSR issues
      const localforage = await import('localforage')
      const requireLoginEverytime = await localforage.default.getItem<boolean>('requireLoginEverytime')
      
      // Only enforce "require login everytime" if explicitly set to true
      // We'll use a different approach - check if user just came from login page
      if (requireLoginEverytime === true && user.value) {
        // Check if user has a fresh login flag
        const lastLoginTime = await localforage.default.getItem<number>('lastLoginTime')
        const now = Date.now()
        
        // If no login time recorded or login was more than 5 minutes ago, require fresh login
        if (!lastLoginTime || (now - lastLoginTime) > 5 * 60 * 1000) {
          await supabase.auth.signOut()
          return navigateTo('/login')
        }
      }
    } catch (error) {
      console.error('Error checking requireLoginEverytime setting:', error)
      // Don't force logout on error - just log the error
    }
    
    // Redirect to login if not authenticated
    if (!user.value) {
      return navigateTo('/login')
    }
  }
  */
})