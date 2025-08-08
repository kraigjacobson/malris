import { getCurrentStatus } from '~/server/services/systemStatusManager'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (_event) => {
  const startTime = performance.now()
  logger.info(`📊 [QUEUE API DEBUG] Queue status request started`)
  
  try {
    // Get comprehensive system status from our centralized manager
    const statusStartTime = performance.now()
    const systemStatus = getCurrentStatus()
    const statusTime = performance.now() - statusStartTime
    logger.info(`📊 [QUEUE API DEBUG] System status retrieved in ${statusTime.toFixed(2)}ms`)
    
    // Return enhanced queue status with all system information
    const buildStartTime = performance.now()
    const queueStatus = {
      success: true,
      queue: {
        total: systemStatus.jobCounts.total,
        queued: systemStatus.jobCounts.queued,
        active: systemStatus.jobCounts.active,
        completed: systemStatus.jobCounts.completed,
        failed: systemStatus.jobCounts.failed,
        need_input: systemStatus.jobCounts.needInput,
        canceled: systemStatus.jobCounts.canceled,
        is_paused: systemStatus.autoProcessing.status !== 'enabled',
        is_processing: systemStatus.autoProcessing.status === 'enabled'
      },
      // Enhanced system status information
      system_status: {
        overall_health: systemStatus.systemHealth,
        timestamp: systemStatus.timestamp,
        runpod_worker: systemStatus.runpodWorker,
        comfyui: systemStatus.comfyui,
        comfyui_processing: systemStatus.comfyuiProcessing,
        auto_processing: systemStatus.autoProcessing
      }
    }
    const buildTime = performance.now() - buildStartTime
    
    const totalTime = performance.now() - startTime
    logger.info(`📊 [QUEUE API DEBUG] Response built in ${buildTime.toFixed(2)}ms`)
    logger.info(`📊 [QUEUE API DEBUG] Queue status request completed in ${totalTime.toFixed(2)}ms - counts: total=${systemStatus.jobCounts.total}, queued=${systemStatus.jobCounts.queued}, active=${systemStatus.jobCounts.active}`)

    return queueStatus

  } catch (error: any) {
    const totalTime = performance.now() - startTime
    logger.error(`❌ [QUEUE API DEBUG] Queue status request failed after ${totalTime.toFixed(2)}ms:`, error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch system status: ${error.message || 'Unknown error'}`
    })
  }
})