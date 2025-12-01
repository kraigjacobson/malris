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

      // Enhanced PWA visibility handling
      // const handleVisibilityChange = () => {
      //   if (document.hidden) {
      //     console.log('🌙 App going to background (PWA mode)')
      //     // Don't disconnect - let the browser handle it naturally
      //   } else {
      //     console.log('☀️ App returning to foreground (PWA mode)')
      //     // Delay reconnection to avoid triggering reloads during visibility change
      //     // Use a longer delay and check online status to prevent race conditions
      //     setTimeout(() => {
      //       if (!jobsStore.wsConnected && navigator.onLine) {
      //         console.log('🔌 PWA foreground reconnection...')
      //         jobsStore.connectWebSocket()
      //       }
      //     }, 3000)
      //   }
      // }

      // document.addEventListener('visibilitychange', handleVisibilityChange)

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
