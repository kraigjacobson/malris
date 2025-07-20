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
  
  // Skip authentication for API routes - they should handle their own auth if needed
  if (to.path.startsWith('/api/')) {
    return
  }
  
  // Redirect to login if not authenticated
  if (!user.value) {
    return navigateTo('/login')
  }
})