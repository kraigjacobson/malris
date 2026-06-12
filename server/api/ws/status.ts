/**
 * WebSocket endpoint for real-time system status updates
 * Provides instant notifications when system status changes
 * Supports commands for processing control
 */
import { logger } from '~/server/utils/logger'
import { addWebSocketClient, getCurrentStatus } from '~/server/services/systemStatusManager'
import { startSingleJob, startContinuousProcessing, stopAllProcessing, getProcessingStatus, setPickOrder, setPresetFilter } from '~/server/services/jobProcessingService'

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
          isContinuous: processingStatus.isContinuous,
          sourceType: processingStatus.sourceType,
          pickOrder: processingStatus.pickOrder,
          presetFilter: processingStatus.presetFilter,
          jobLimit: processingStatus.jobLimit,
          jobsProcessedCount: processingStatus.jobsProcessedCount
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
      // Optional integer cap on continuous processing; null means unlimited
      const rawLimit = command.job_limit
      const jobLimit = typeof rawLimit === 'number' && rawLimit > 0 ? Math.floor(rawLimit) : null

      // Handle different command types
      switch (command.type) {
        case 'ping':
          peer.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }))
          break

        case 'start_continuous':
          await handleStartContinuous(peer, sourceType, jobLimit)
          break

        case 'start_single':
          await handleStartSingle(peer, sourceType)
          break

        case 'stop_processing':
          await handleStopProcessing(peer)
          break

        case 'force_restart_workers':
          await handleForceRestartWorkers(peer)
          break

        case 'request_state_sync':
          await handleRequestStateSync(peer)
          break

        case 'set_pick_order':
          await handleSetPickOrder(peer, command.pick_order)
          break

        case 'set_preset_filter':
          await handleSetPresetFilter(peer, command.preset_filter)
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
async function handleStartContinuous(peer: any, sourceType: 'all' | 'source' | 'vid' | 'vid_faceswap' | 'fs' | 'i2v' = 'all', jobLimit: number | null = null) {
  try {
    const result = startContinuousProcessing(sourceType, jobLimit)

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

      const limitSuffix = jobLimit ? `, jobLimit: ${jobLimit}` : ''
      logger.info(`✅ Continuous processing started via WebSocket command (sourceType: ${sourceType}${limitSuffix})`)
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

async function handleStartSingle(peer: any, sourceType: 'all' | 'source' | 'vid' | 'vid_faceswap' | 'fs' | 'i2v' = 'all') {
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

async function handleForceRestartWorkers(peer: any) {
  try {
    const result = await stopAllProcessing({ forceRestart: true })

    peer.send(JSON.stringify({
      type: 'command_ack',
      data: {
        command: 'force_restart_workers',
        success: true,
        message: result.message
      },
      timestamp: new Date().toISOString()
    }))

    logger.info('✅ Workers force-restarted via WebSocket command')
  } catch (error: any) {
    logger.error('❌ Failed to force restart workers:', error)
    peer.send(JSON.stringify({
      type: 'command_error',
      data: {
        command: 'force_restart_workers',
        success: false,
        error: error.message || 'Failed to force restart workers'
      },
      timestamp: new Date().toISOString()
    }))
  }
}

async function handleSetPickOrder(peer: any, pickOrder: unknown) {
  try {
    if (pickOrder !== 'chronological' && pickOrder !== 'random') {
      throw new Error(`Invalid pick_order: ${pickOrder}`)
    }
    setPickOrder(pickOrder)
    peer.send(JSON.stringify({
      type: 'command_ack',
      data: { command: 'set_pick_order', success: true, pickOrder },
      timestamp: new Date().toISOString()
    }))
    logger.info(`✅ pickOrder set to ${pickOrder} via WebSocket`)
  } catch (error: any) {
    logger.error('❌ Failed to set pickOrder:', error)
    peer.send(JSON.stringify({
      type: 'command_error',
      data: { command: 'set_pick_order', success: false, error: error.message || 'Failed to set pick order' },
      timestamp: new Date().toISOString()
    }))
  }
}

async function handleSetPresetFilter(peer: any, presetFilter: unknown) {
  try {
    // Accept null/undefined/'all' as "no filter"; otherwise expect a UUID string.
    let next: string | null = null
    if (presetFilter && presetFilter !== 'all') {
      if (typeof presetFilter !== 'string') {
        throw new Error(`Invalid preset_filter: ${presetFilter}`)
      }
      next = presetFilter
    }
    setPresetFilter(next)
    peer.send(JSON.stringify({
      type: 'command_ack',
      data: { command: 'set_preset_filter', success: true, presetFilter: next },
      timestamp: new Date().toISOString()
    }))
    logger.info(`✅ presetFilter set to ${next ?? 'all'} via WebSocket`)
  } catch (error: any) {
    logger.error('❌ Failed to set presetFilter:', error)
    peer.send(JSON.stringify({
      type: 'command_error',
      data: { command: 'set_preset_filter', success: false, error: error.message || 'Failed to set preset filter' },
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
          isContinuous: processingStatus.isContinuous,
          sourceType: processingStatus.sourceType,
          pickOrder: processingStatus.pickOrder,
          presetFilter: processingStatus.presetFilter,
          jobLimit: processingStatus.jobLimit,
          jobsProcessedCount: processingStatus.jobsProcessedCount
        }
      },
      timestamp: new Date().toISOString()
    }))

    logger.info('✅ State sync sent to client')
  } catch (error: any) {
    logger.error('❌ Failed to send state sync:', error)
  }
}