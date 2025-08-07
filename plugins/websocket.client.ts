// WebSocket connection plugin - connects immediately on app startup
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
      
      // Also handle page visibility changes globally
      const handleVisibilityChange = () => {
        if (!document.hidden && !jobsStore.wsConnected) {
          console.log('🔌 Page visible, reconnecting WebSocket...')
          jobsStore.connectWebSocket()
        }
      }
      
      document.addEventListener('visibilitychange', handleVisibilityChange)
      
      // Cleanup on app unmount
      onBeforeUnmount(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        jobsStore.cleanup()
      })
    }
  }
})