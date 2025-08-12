/**
 * Centralized System Status Manager
 * Tracks all system states and broadcasts changes via WebSocket
 */

import type {
  SystemStatus,
  SystemHealth,
  ComfyUIProcessingStatus,
  AutoProcessingStatus,
  WebSocketMessage
} from '~/types/systemStatus'
import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { count } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

// WebSocket clients management
const wsClients = new Set<any>()

// Timeout for resetting active jobs after ComfyUI becomes idle
let resetActiveJobsTimeout: NodeJS.Timeout | null = null

// Current system status - this is our single source of truth
let currentStatus: SystemStatus = {
  timestamp: new Date().toISOString(),
  systemHealth: 'unknown',
  runpodWorker: {
    status: 'unknown',
    message: 'Not checked yet',
    lastChecked: new Date().toISOString()
  },
  comfyui: {
    status: 'unknown', 
    message: 'Not checked yet',
    lastChecked: new Date().toISOString()
  },
  comfyuiProcessing: {
    status: 'unknown',
    runningJobs: 0,
    queuedJobs: 0,
    lastChecked: new Date().toISOString()
  },
  autoProcessing: {
    status: 'disabled',
    message: 'Auto processing is disabled',
    lastToggled: new Date().toISOString(),
    intervalActive: false
  },
  jobCounts: {
    total: 0,
    queued: 0,
    active: 0,
    completed: 0,
    failed: 0,
    canceled: 0,
    needInput: 0
  }
}

// Status update intervals
let runpodHealthInterval: NodeJS.Timeout | null = null
let comfyuiHealthInterval: NodeJS.Timeout | null = null

const RUNPOD_CHECK_INTERVAL = 30000  // 30 seconds
const COMFYUI_CHECK_INTERVAL = 15000 // 15 seconds

// WebSocket client management
export function addWebSocketClient(ws: any) {
  wsClients.add(ws)
  logger.info(`🔌 WebSocket client connected. Total clients: ${wsClients.size}`)
  
  // Send current status to new client immediately
  sendToClient(ws, {
    type: 'status_update',
    data: currentStatus,
    timestamp: new Date().toISOString()
  })
  
  // Handle client disconnect
  ws.on('close', () => {
    wsClients.delete(ws)
    logger.info(`🔌 WebSocket client disconnected. Total clients: ${wsClients.size}`)
  })
}

// Broadcast message to all connected clients
function broadcastToClients(message: WebSocketMessage) {
  const messageStr = JSON.stringify(message)
  
  wsClients.forEach(ws => {
    try {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(messageStr)
      } else {
        wsClients.delete(ws) // Clean up dead connections
      }
    } catch (error) {
      logger.error('❌ Failed to send WebSocket message:', error)
      wsClients.delete(ws) // Remove failed connection
    }
  })
}

// Send message to specific client
function sendToClient(ws: any, message: WebSocketMessage) {
  try {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(message))
    }
  } catch (error) {
    logger.error('❌ Failed to send WebSocket message to client:', error)
    wsClients.delete(ws)
  }
}

// Calculate overall system health based on component statuses
function calculateSystemHealth(): SystemHealth {
  const { runpodWorker, comfyui, autoProcessing } = currentStatus
  
  // If any critical component is unhealthy, system is unhealthy
  if (runpodWorker.status === 'unhealthy' || comfyui.status === 'unhealthy') {
    return 'unhealthy'
  }
  
  // If any component is unknown, system health is unknown
  if (runpodWorker.status === 'unknown' || comfyui.status === 'unknown') {
    return 'unknown'
  }
  
  // If auto processing is enabled but has issues, system is degraded
  if (autoProcessing.status === 'paused') {
    return 'degraded'
  }
  
  // All systems healthy
  return 'healthy'
}

// Update system status and broadcast changes
function updateStatus(updates: Partial<SystemStatus>, eventType: string = 'status_update') {
  const previousStatus = { ...currentStatus }
  
  // Apply updates
  currentStatus = {
    ...currentStatus,
    ...updates,
    timestamp: new Date().toISOString(),
    systemHealth: calculateSystemHealth()
  }
  
  // Broadcast the change
  broadcastToClients({
    type: eventType as any,
    data: currentStatus,
    timestamp: currentStatus.timestamp
  })
  
  // Log significant changes
  if (previousStatus.systemHealth !== currentStatus.systemHealth) {
    logger.info(`🏥 System health changed: ${previousStatus.systemHealth} → ${currentStatus.systemHealth}`)
  }
}

// Check RunPod worker health
async function checkRunPodWorkerHealth() {
  const startTime = Date.now()
  
  try {
    const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
    const response = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })
    
    const responseTime = Date.now() - startTime
    const timestamp = new Date().toISOString()
    
    if (!response.ok) {
      updateStatus({
        runpodWorker: {
          status: 'unhealthy',
          message: `Worker responded with ${response.status}`,
          lastChecked: timestamp,
          responseTime
        }
      }, 'runpod_status_change')
      return
    }
    
    const healthData = await response.json()
    const isHealthy = healthData.status === 'healthy'
    
    updateStatus({
      runpodWorker: {
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: healthData.message || 'Worker is responding',
        lastChecked: timestamp,
        responseTime
      }
    }, 'runpod_status_change')
    
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    updateStatus({
      runpodWorker: {
        status: 'unhealthy',
        message: `Health check failed: ${error.message}`,
        lastChecked: new Date().toISOString(),
        responseTime
      }
    }, 'runpod_status_change')
  }
}

// Check ComfyUI health and processing status
async function checkComfyUIHealth() {
  const startTime = Date.now()
  
  try {
    const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
    const response = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })
    
    const responseTime = Date.now() - startTime
    const timestamp = new Date().toISOString()
    
    if (!response.ok) {
      updateStatus({
        comfyui: {
          status: 'unhealthy',
          message: `ComfyUI check failed: ${response.status}`,
          lastChecked: timestamp,
          responseTime
        },
        comfyuiProcessing: {
          status: 'unknown',
          runningJobs: 0,
          queuedJobs: 0,
          lastChecked: timestamp
        }
      }, 'comfyui_status_change')
      return
    }
    
    const healthData = await response.json()
    const isHealthy = healthData.status === 'healthy'
    
    // Determine processing status
    const runningCount = healthData.active_jobs?.running_count || 0
    const pendingCount = healthData.active_jobs?.pending_count || 0
    
    let processingStatus: ComfyUIProcessingStatus = 'idle'
    if (runningCount > 0) {
      processingStatus = 'processing'
    } else if (pendingCount > 0) {
      processingStatus = 'queued'
    }
    
    updateStatus({
      comfyui: {
        status: isHealthy ? 'healthy' : 'unhealthy',
        message: healthData.message || 'ComfyUI is responding',
        lastChecked: timestamp,
        responseTime,
        version: healthData.version
      },
      comfyuiProcessing: {
        status: processingStatus,
        runningJobs: runningCount,
        queuedJobs: pendingCount,
        lastChecked: timestamp
      }
    }, 'comfyui_status_change')
    
    // DISABLED: Don't reset active jobs to queued when ComfyUI is idle
    // This was causing completed jobs to be reset to queued status
    // if (processingStatus === 'idle' && currentStatus.jobCounts.active > 0) {
    //   if (!resetActiveJobsTimeout) {
    //     logger.info(`🔄 ComfyUI is idle but ${currentStatus.jobCounts.active} jobs are marked as active - will reset to queued in 60 seconds`)
    //     resetActiveJobsTimeout = setTimeout(async () => {
    //       logger.info(`⏰ 60 seconds elapsed since ComfyUI became idle - resetting active jobs to queued`)
    //       await resetActiveJobsToQueued()
    //       resetActiveJobsTimeout = null
    //     }, 60000) // 60 seconds
    //   }
    // } else {
    //   // Clear timeout if ComfyUI is no longer idle or no active jobs
    //   if (resetActiveJobsTimeout) {
    //     logger.info(`✅ ComfyUI is no longer idle or no active jobs - canceling reset timeout`)
    //     clearTimeout(resetActiveJobsTimeout)
    //     resetActiveJobsTimeout = null
    //   }
    // }
    
    // Clear any existing timeout since we're disabling this functionality
    if (resetActiveJobsTimeout) {
      clearTimeout(resetActiveJobsTimeout)
      resetActiveJobsTimeout = null
    }
    
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    updateStatus({
      comfyui: {
        status: 'unhealthy',
        message: `ComfyUI check failed: ${error.message}`,
        lastChecked: new Date().toISOString(),
        responseTime
      },
      comfyuiProcessing: {
        status: 'unknown',
        runningJobs: 0,
        queuedJobs: 0,
        lastChecked: new Date().toISOString()
      }
    }, 'comfyui_status_change')
  }
}

// Update job counts from database - call this when jobs are modified
export async function updateJobCounts() {
  const startTime = performance.now()
  
  try {
    const db = getDb()
    
    // Get status counts in a single query using GROUP BY
    const statusCounts = await db
      .select({
        status: jobs.status,
        count: count()
      })
      .from(jobs)
      .groupBy(jobs.status)
    
    // Get total count separately
    const totalResult = await db.select({ count: count() }).from(jobs)
    const total = totalResult[0].count
    
    const queryTime = performance.now() - startTime
    logger.info(`📊 [JOB COUNTS] Status counts query completed in ${queryTime.toFixed(2)}ms`)
    
    // Build counts object from results
    const counts = {
      total,
      queued: 0,
      active: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
      needInput: 0
    }
    
    // Map status counts to our structure
    statusCounts.forEach(row => {
      switch (row.status) {
        case 'queued':
          counts.queued = row.count
          break
        case 'active':
          counts.active = row.count
          break
        case 'completed':
          counts.completed = row.count
          break
        case 'failed':
          counts.failed = row.count
          break
        case 'canceled':
          counts.canceled = row.count
          break
        case 'need_input':
          counts.needInput = row.count
          break
      }
    })
    
    updateStatus({
      jobCounts: counts
    }, 'job_counts_update')
    
    const totalTime = performance.now() - startTime
    logger.info(`📊 [JOB COUNTS] Update completed in ${totalTime.toFixed(2)}ms - total: ${counts.total}, queued: ${counts.queued}, active: ${counts.active}`)
    
  } catch (error: any) {
    const totalTime = performance.now() - startTime
    logger.error(`❌ [JOB COUNTS] Failed to update job counts after ${totalTime.toFixed(2)}ms:`, error)
  }
}

// DISABLED: Reset active jobs to queued when ComfyUI is idle but jobs are stuck as active
// This function is no longer used since we disabled the watchdog functionality
// async function resetActiveJobsToQueued() {
//   try {
//     const db = getDb()
//
//     // Update all active jobs to queued status
//     const resetJobs = await db
//       .update(jobs)
//       .set({
//         status: 'queued',
//         startedAt: null,
//         updatedAt: new Date()
//       })
//       .where(eq(jobs.status, 'active'))
//       .returning({ id: jobs.id })
//
//     if (resetJobs.length > 0) {
//       logger.info(`✅ Reset ${resetJobs.length} stuck active jobs to queued status`)
//
//       // Update job counts after resetting jobs
//       await updateJobCounts()
//     }
//
//   } catch (error: any) {
//     logger.error('❌ Failed to reset active jobs to queued:', error)
//   }
// }

// Update auto processing status
export function updateAutoProcessingStatus(
  status: AutoProcessingStatus, 
  message: string, 
  intervalActive: boolean = false
) {
  updateStatus({
    autoProcessing: {
      status,
      message,
      lastToggled: new Date().toISOString(),
      intervalActive
    }
  }, 'auto_processing_toggle')
}

// Start all monitoring intervals
export function startSystemMonitoring() {
  logger.info('🚀 Starting system status monitoring...')
  
  // Stop any existing intervals
  stopSystemMonitoring()
  
  // Start health checks immediately
  checkRunPodWorkerHealth()
  checkComfyUIHealth()
  updateJobCounts()
  
  // Set up intervals (no job counts polling - updated reactively)
  runpodHealthInterval = setInterval(checkRunPodWorkerHealth, RUNPOD_CHECK_INTERVAL)
  comfyuiHealthInterval = setInterval(checkComfyUIHealth, COMFYUI_CHECK_INTERVAL)
  
  logger.info('✅ System monitoring started')
}

// Stop all monitoring intervals
export function stopSystemMonitoring() {
  if (runpodHealthInterval) {
    clearInterval(runpodHealthInterval)
    runpodHealthInterval = null
  }
  
  if (comfyuiHealthInterval) {
    clearInterval(comfyuiHealthInterval)
    comfyuiHealthInterval = null
  }
  
  logger.info('⏹️ System monitoring stopped')
}

// Get current status
export function getCurrentStatus(): SystemStatus {
  return { ...currentStatus }
}

// Get connected clients count
export function getConnectedClientsCount(): number {
  return wsClients.size
}

// Worker health check function for job processing service
// Returns specific data needed for job processing
export async function checkWorkerHealth() {
  try {
    const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
    const response = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    
    if (!response.ok) {
      return { healthy: false, available: false, runningJobIds: [] }
    }
    
    const healthData = await response.json()
    const isHealthy = healthData.status === 'healthy'
    
    // Use the correct fields from active_jobs
    const actualRunningCount = healthData.active_jobs?.running_count || 0
    const actualPendingCount = healthData.active_jobs?.pending_count || 0
    const isAvailable = actualRunningCount === 0 && actualPendingCount === 0
    
    // Get the actual running job IDs from the worker
    const runningJobIds = healthData.running_jobs || []
    
    // No longer doing zombie cleanup here - we handle this by marking all other active jobs
    // as failed when a new job is sent to the worker
    
    return {
      healthy: isHealthy,
      available: isAvailable,
      runningJobIds,
      actualRunningCount,
      healthData
    }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error: any) {
    return { healthy: false, available: false, runningJobIds: [] }
  }
}

// Initialize monitoring on module load
startSystemMonitoring()

// Graceful shutdown
process.on('SIGTERM', stopSystemMonitoring)
process.on('SIGINT', stopSystemMonitoring)