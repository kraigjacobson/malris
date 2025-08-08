/**
 * System Status API Endpoint
 * Returns comprehensive system status information
 */

import { getCurrentStatus, getConnectedClientsCount } from '~/server/services/systemStatusManager'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (_event) => {
  try {
    const systemStatus = getCurrentStatus()
    
    return {
      success: true,
      ...systemStatus,
      // Additional metadata
      websocket_clients: getConnectedClientsCount(),
      api_version: '2.0'
    }
    
  } catch (error: any) {
    logger.error('❌ [API] Error fetching system status:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch system status: ${error.message || 'Unknown error'}`
    })
  }
})