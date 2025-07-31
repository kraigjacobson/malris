import { getCurrentStatus } from '~/server/services/systemStatusManager'

export default defineEventHandler(async (_event) => {
  try {
    // Get comprehensive system status from our centralized manager
    const systemStatus = getCurrentStatus()
    
    // Return enhanced queue status with all system information
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

    return queueStatus

  } catch (error: any) {
    console.error('❌ [API] Error fetching system status:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch system status: ${error.message || 'Unknown error'}`
    })
  }
})