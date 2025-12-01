/**
 * Remote logging plugin - sends console logs to server
 * Useful for debugging on devices where we can't access the console
 */
export default defineNuxtPlugin({
  name: 'remote-logger',
  setup() {
    if (import.meta.client) {
      // Capture important lifecycle events and send to server
      const sendLog = (message: string, data?: any, useBeacon = false) => {
        try {
          const payload = JSON.stringify({ message, data, timestamp: new Date().toISOString() })

          if (useBeacon && navigator.sendBeacon) {
            // Use sendBeacon for events that happen during page unload
            navigator.sendBeacon('/api/debug-log', new Blob([payload], { type: 'application/json' }))
          } else {
            // Normal fetch for other events
            $fetch('/api/debug-log', {
              method: 'POST',
              body: { message, data, timestamp: new Date().toISOString() }
            }).catch(() => {})
          }
        } catch {
          // Silently fail if logging endpoint doesn't exist
        }
      }

      // Log page visibility changes
      document.addEventListener('visibilitychange', () => {
        sendLog(`VISIBILITY CHANGE: ${document.hidden ? 'hidden' : 'visible'}`)
      })

      // Log before page unloads - use sendBeacon to ensure it sends
      window.addEventListener('beforeunload', () => {
        sendLog('BEFOREUNLOAD event fired - page is reloading/closing', undefined, true)
      })

      // Log page show/hide
      window.addEventListener('pageshow', e => {
        sendLog('PAGESHOW event', { persisted: (e as PageTransitionEvent).persisted })
      })

      window.addEventListener('pagehide', () => {
        sendLog('PAGEHIDE event fired', undefined, true)
      })

      // Log when app is ready
      sendLog('Remote logger initialized - app loaded')

      console.log('📡 Remote logger initialized')
    }
  }
})
