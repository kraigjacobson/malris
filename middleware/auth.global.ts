export default defineNuxtRouteMiddleware(async (to, from) => {
  console.log('🔐 [AUTH] Middleware running:', { to: to.path, from: from?.path })

  // Allow access to login page before initializing Supabase
  if (to.path === '/login') {
    console.log('🔐 [AUTH] Allowing access to login page')
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
    console.log('🔐 [AUTH] No user, redirecting to login')
    $fetch('/api/debug-log', {
      method: 'POST',
      body: { message: 'AUTH redirecting to login - no user found' }
    }).catch(() => {})
    return navigateTo('/login')
  }

  console.log('🔐 [AUTH] User authenticated, allowing access')
})
