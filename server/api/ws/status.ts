/**
 * WebSocket endpoint for real-time system status updates
 * Provides instant notifications when system status changes
 */
import { logger } from '~/server/utils/logger'

import { addWebSocketClient } from '~/server/services/systemStatusManager'

export default defineWebSocketHandler({
  open(peer) {
    logger.info('🔌 New WebSocket connection opened for system status')
    
    // Add this client to the status manager
    addWebSocketClient(peer.websocket)
  },

  message(peer, message) {
    // Handle incoming messages from clients if needed
    try {
      const data = JSON.parse(message.text())
      logger.info('📨 Received WebSocket message:', data)
      
      // Could handle client requests here (like requesting specific status updates)
      if (data.type === 'ping') {
        peer.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }))
      }
    } catch (error) {
      logger.error('❌ Failed to parse WebSocket message:', error)
    }
  },

  close(peer, event) {
    logger.info('🔌 WebSocket connection closed:', event.code, event.reason)
    // Client cleanup is handled automatically in systemStatusManager
  },

  error(peer, error) {
    logger.error('❌ WebSocket error:', error)
  }
})