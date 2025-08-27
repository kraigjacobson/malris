// WebSocket connection plugin with PWA support - connects immediately on app startup
export default defineNuxtPlugin({
  name: 'websocket-connection',
  enforce: 'post', // Run after other plugins
  setup() {
    // Only run on client side
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
      const handleVisibilityChange = () => {
        if (document.hidden) {
          console.log('🌙 App going to background (PWA mode)')
          // Don't disconnect - let the browser handle it naturally
          // The PWA will automatically reconnect when returning to foreground
        } else {
          console.log('☀️ App returning to foreground (PWA mode)')
          // Aggressively reconnect when coming back to foreground
          if (!jobsStore.wsConnected) {
            console.log('🔄 PWA foreground reconnection...')
            jobsStore.connectWebSocket()
          }
        }
      }
      
      document.addEventListener('visibilitychange', handleVisibilityChange)
      
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
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('pageshow', handlePageShow)
        window.removeEventListener('pagehide', handlePageHide)
        jobsStore.cleanup()
      })
    }
  }
})