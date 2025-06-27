// This plugin handles additional auth checks with Supabase
export default defineNuxtPlugin({
  name: 'auth-check',
  enforce: 'pre', // Run before other plugins
  setup() {
    console.log('Auth check plugin running with Supabase')
    
    // Only run on client side
    if (import.meta.client) {
      try {
        // The auth middleware now handles most authentication logic
        // This plugin can be used for additional client-side auth checks if needed
        console.log('Auth check plugin - Supabase authentication enabled')
        console.log('Auth check plugin - current path:', window.location.pathname)
        
        // Additional auth logic can be added here if needed
        // For now, we'll let the middleware handle authentication
        
      } catch (error) {
        console.error('Error in auth check plugin:', error)
      }
    }
  }
})