// This plugin handles additional auth checks with Supabase
export default defineNuxtPlugin({
  name: 'auth-check',
  enforce: 'pre', // Run before other plugins
  setup() {
    console.log('Auth check plugin running with Supabase')
    // Only run on client side
    if (import.meta.client) {
      try {
        const supabase = useSupabaseClient()
        const user = useSupabaseUser()

        console.log('Auth check plugin - Supabase authentication enabled')
        console.log('Auth check plugin - current path:', window.location.pathname)
        console.log('Auth check plugin - user:', user.value ? 'logged in' : 'not logged in')

        // Track if we're in a visibility transition to prevent reloads
        let inVisibilityTransition = false

        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            inVisibilityTransition = true
            // Clear flag after visibility transition completes
            setTimeout(() => {
              inVisibilityTransition = false
            }, 2000) // 2 second window after visibility returns
          }
        })

        // Override Nuxt Supabase's auth state change handler
        supabase.auth.onAuthStateChange((event, session) => {
          console.log('🔐 [AUTH STATE] Supabase auth state changed:', event)
          $fetch('/api/debug-log', {
            method: 'POST',
            body: { message: `Supabase auth state changed: ${event}`, data: { hasSession: !!session, inTransition: inVisibilityTransition } }
          }).catch(() => {})

          // CRITICAL: Prevent navigation during visibility transitions
          if (inVisibilityTransition) {
            console.log('🔐 [AUTH STATE] Visibility transition detected - preventing navigation')
            $fetch('/api/debug-log', {
              method: 'POST',
              body: { message: `Auth event ${event} blocked during visibility transition` }
            }).catch(() => {})
            // Return false to prevent the default Nuxt Supabase behavior
            return
          }

          // Only handle SIGNED_OUT for redirects, ignore other events
          if (event === 'SIGNED_OUT') {
            console.log('🔐 [AUTH STATE] User signed out')
            // Don't force redirect here - let the auth middleware handle it on next navigation
            // This prevents unwanted redirects when the tab wakes up and session is briefly invalid
          }
        })
      } catch (error) {
        console.error('Error in auth check plugin:', error)
      }
    }
  }
})
