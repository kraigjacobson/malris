// WebSocket connection plugin with PWA support - connects immediately on app startup
export default defineNuxtPlugin({
  name: 'websocket-connection',
  enforce: 'post', // Run after other plugins
  setup(nuxtApp) {
    // Intercept navigation to see what's causing reloads
    nuxtApp.hook('page:start', () => {
      console.log('🔀 [NAVIGATION] Page navigation starting!')
      $fetch('/api/debug-log', {
        method: 'POST',
        body: { message: 'NAVIGATION: page:start hook fired - page is navigating' }
      }).catch(() => {})
    })

    // Only run on client side
    // Force unregister any existing service workers to ensure clean state
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          console.log('🧹 Unregistering service worker:', registration)
          registration.unregister()
        }
      })
    }
    if (import.meta.client) {
      const jobsStore = useJobsStore()

      // Connect WebSocket immediately when app loads
      console.log('🔌 Initializing WebSocket connection on app startup...')

      // Try immediate connection first
      try {
        jobsStore.connectWebSocket()
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        console.log('🔌 Immediate connection failed, retrying in 50ms...')
        // Minimal delay fallback if immediate connection fails
        setTimeout(() => {
          jobsStore.connectWebSocket()
        }, 50)
      }

      // PWA-specific page lifecycle events
      const handlePageShow = () => {
        console.log('📱 PWA page show event')
        if (!jobsStore.wsConnected) {
          jobsStore.connectWebSocket()
        }
      }

      const handlePageHide = () => {
        console.log('📱 PWA page hide event')
        // Don't force disconnect - let it happen naturally
      }

      window.addEventListener('pageshow', handlePageShow)
      window.addEventListener('pagehide', handlePageHide)

      // Cleanup when page unloads
      window.addEventListener('beforeunload', () => {
        // document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('pageshow', handlePageShow)
        window.removeEventListener('pagehide', handlePageHide)
        jobsStore.cleanup()
      })
    }
  }
})
