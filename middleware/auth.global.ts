export default defineNuxtRouteMiddleware(async (to) => {
  // Allow access to login page before initializing Supabase
  if (to.path === '/login') {
    return
  }
  
  // Only initialize Supabase on client side and for protected routes
  if (!import.meta.client) {
    return
  }
  
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()
  
  // Skip authentication for API routes - they should handle their own auth if needed
  if (to.path.startsWith('/api/')) {
    return
  }
  
  // Check if we should require login everytime for time-based expiry
  try {
    // Import localforage dynamically to avoid SSR issues
    const localforage = await import('localforage')
    const requireLoginEverytime = await localforage.default.getItem<boolean>('requireLoginEverytime')
    
    // Only enforce time-based expiry if explicitly set to true and user is authenticated
    if (requireLoginEverytime === true && user.value) {
      // Check if user has a fresh login flag for time-based expiry
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
})