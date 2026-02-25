/**
 * WebSocket endpoint for real-time system status updates
 * Provides instant notifications when system status changes
 * Supports commands for processing control
 */
import { logger } from '~/server/utils/logger'
import { addWebSocketClient, getCurrentStatus } from '~/server/services/systemStatusManager'
import { startSingleJob, startContinuousProcessing, stopAllProcessing, getProcessingStatus } from '~/server/services/jobProcessingService'

export default defineWebSocketHandler({
  open(peer) {
    logger.info('🔌 New WebSocket connection opened for system status')

    // Add this client to the status manager
    addWebSocketClient(peer.websocket)

    // Send initial state immediately
    const currentStatus = getCurrentStatus()
    const processingStatus = getProcessingStatus()

    peer.send(JSON.stringify({
      type: 'initial_sync',
      data: {
        systemStatus: currentStatus,
        processingState: {
          mode: processingStatus.mode,
          isActive: processingStatus.isActive,
          isContinuous: processingStatus.isContinuous
        }
      },
      timestamp: new Date().toISOString()
    }))
  },

  async message(peer, message) {
    try {
      const command = JSON.parse(message.text())
      logger.info('📨 Received WebSocket command:', command.type, command.source_type ? `(sourceType: ${command.source_type})` : '')

      // Extract source_type parameter (default to 'all' if not provided)
      const sourceType = command.source_type || 'all'

      // Handle different command types
      switch (command.type) {
        case 'ping':
          peer.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }))
          break

        case 'start_continuous':
          await handleStartContinuous(peer, sourceType)
          break

        case 'start_single':
          await handleStartSingle(peer, sourceType)
          break

        case 'stop_processing':
          await handleStopProcessing(peer)
          break

        case 'request_state_sync':
          await handleRequestStateSync(peer)
          break

        default:
          logger.warn('⚠️ Unknown WebSocket command type:', command.type)
          peer.send(JSON.stringify({
            type: 'error',
            error: `Unknown command type: ${command.type}`,
            timestamp: new Date().toISOString()
          }))
      }
    } catch (error: any) {
      logger.error('❌ Failed to handle WebSocket message:', error)
      peer.send(JSON.stringify({
        type: 'error',
        error: error.message || 'Failed to process command',
        timestamp: new Date().toISOString()
      }))
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

// Command Handlers
async function handleStartContinuous(peer: any, sourceType: 'all' | 'source' | 'vid' = 'all') {
  try {
    const result = startContinuousProcessing(sourceType)

    if (result.success) {
      // Send acknowledgment to requesting client
      peer.send(JSON.stringify({
        type: 'command_ack',
        data: {
          command: 'start_continuous',
          success: true,
          message: result.message
        },
        timestamp: new Date().toISOString()
      }))

      logger.info(`✅ Continuous processing started via WebSocket command (sourceType: ${sourceType})`)
    } else {
      peer.send(JSON.stringify({
        type: 'command_error',
        data: {
          command: 'start_continuous',
          success: false,
          error: result.message
        },
        timestamp: new Date().toISOString()
      }))
    }
  } catch (error: any) {
    logger.error('❌ Failed to start continuous processing:', error)
    peer.send(JSON.stringify({
      type: 'command_error',
      data: {
        command: 'start_continuous',
        success: false,
        error: error.message || 'Failed to start continuous processing'
      },
      timestamp: new Date().toISOString()
    }))
  }
}

async function handleStartSingle(peer: any, sourceType: 'all' | 'source' | 'vid' = 'all') {
  try {
    // Note: startSingleJob is async, but we acknowledge immediately
    // The actual job processing happens in background
    startSingleJob(sourceType).then(result => {
      if (result.success) {
        logger.info('✅ Single job processing completed:', result.message)
      } else {
        logger.warn('⚠️ Single job processing finished with no action:', result.message)
      }
    }).catch(error => {
      logger.error('❌ Single job processing failed:', error)
    })

    // Send immediate acknowledgment
    peer.send(JSON.stringify({
      type: 'command_ack',
      data: {
        command: 'start_single',
        success: true,
        message: 'Single job processing initiated'
      },
      timestamp: new Date().toISOString()
    }))

    logger.info(`✅ Single job processing started via WebSocket command (sourceType: ${sourceType})`)
  } catch (error: any) {
    logger.error('❌ Failed to start single job processing:', error)
    peer.send(JSON.stringify({
      type: 'command_error',
      data: {
        command: 'start_single',
        success: false,
        error: error.message || 'Failed to start single job processing'
      },
      timestamp: new Date().toISOString()
    }))
  }
}

async function handleStopProcessing(peer: any) {
  try {
    const result = await stopAllProcessing()

    peer.send(JSON.stringify({
      type: 'command_ack',
      data: {
        command: 'stop_processing',
        success: true,
        message: result.message
      },
      timestamp: new Date().toISOString()
    }))

    logger.info('✅ Processing stopped via WebSocket command')
  } catch (error: any) {
    logger.error('❌ Failed to stop processing:', error)
    peer.send(JSON.stringify({
      type: 'command_error',
      data: {
        command: 'stop_processing',
        success: false,
        error: error.message || 'Failed to stop processing'
      },
      timestamp: new Date().toISOString()
    }))
  }
}

async function handleRequestStateSync(peer: any) {
  try {
    const currentStatus = getCurrentStatus()
    const processingStatus = getProcessingStatus()

    peer.send(JSON.stringify({
      type: 'state_sync_response',
      data: {
        systemStatus: currentStatus,
        processingState: {
          mode: processingStatus.mode,
          isActive: processingStatus.isActive,
          isContinuous: processingStatus.isContinuous
        }
      },
      timestamp: new Date().toISOString()
    }))

    logger.info('✅ State sync sent to client')
  } catch (error: any) {
    logger.error('❌ Failed to send state sync:', error)
  }
}