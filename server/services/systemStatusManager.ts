/**
 * Centralized System Status Manager
 * Tracks all system states and broadcasts changes via WebSocket
 */

import type { SystemStatus, SystemHealth, ComfyUIProcessingStatus, AutoProcessingStatus, WebSocketMessage } from '~/types/systemStatus'
import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { count, eq, and, sql } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'
// Register global error handlers FIRST to catch WebSocket errors
console.log('🛡️ [SYSTEM STATUS] Registering global error handlers...')

process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
  console.log('🔍 [ERROR HANDLER] Unhandled rejection caught:', {
    code: reason?.code,
    message: reason?.message,
    stack: reason?.stack?.split('\n').slice(0, 3).join('\n')
  })

  const isSilentError = reason?.code === 'ECONNRESET' || reason?.code === 'EPIPE' || reason?.code === 'ECONNREFUSED' || reason?.message?.includes('ECONNRESET') || reason?.message?.includes('EPIPE')

  if (isSilentError) {
    console.log(`✅ [ERROR HANDLER] Network disconnection handled silently: ${reason?.code || reason?.message}`)
  } else {
    console.log('❌ [ERROR HANDLER] Unexpected unhandled rejection:', reason)
    logger.error('Unhandled rejection:', reason)
  }
})

console.log('✅ [SYSTEM STATUS] Global error handlers registered')

// WebSocket clients management
const wsClients = new Set<any>()

// Timeout for resetting active jobs after ComfyUI becomes idle
let resetActiveJobsTimeout: NodeJS.Timeout | null = null

// Requeue any active DB jobs orphaned by a ComfyUI container restart
async function requeueOrphanedActiveJobs(): Promise<void> {
  try {
    const db = getDb()
    const activeJobs = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, 'active'))

    if (activeJobs.length === 0) {
      logger.info('ℹ️ [RESTART RECOVERY] No orphaned active jobs found')
      return
    }

    logger.warn(`⚠️ [RESTART RECOVERY] Found ${activeJobs.length} orphaned active job(s) - requeuing`)

    await db
      .update(jobs)
      .set({
        status: 'queued',
        progress: 0,
        startedAt: null,
        errorMessage: null,
        // Drop the preset snapshot — moving back to queued returns preset-backed
        // jobs to pure-reference mode, picking up the preset's current values on
        // the next pickup. Preset-LESS jobs (inline t2v/i2v, sweeps) keep their
        // params: they ARE the job, and there's no preset to restore from.
        parameters: sql`CASE WHEN ${jobs.presetId} IS NOT NULL THEN '{}'::jsonb ELSE ${jobs.parameters} END`,
        updatedAt: new Date()
      })
      .where(eq(jobs.status, 'active'))

    await updateJobCounts()

    logger.info(`✅ [RESTART RECOVERY] Requeued ${activeJobs.length} job(s) after ComfyUI restart`)

    broadcastToClients({
      type: 'state_correction' as any,
      data: {
        reason: 'ComfyUI container restart detected - orphaned jobs requeued',
        count: activeJobs.length
      } as any,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    logger.error('❌ [RESTART RECOVERY] Failed to requeue orphaned jobs:', error)
  }
}

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
  wanWorker: {
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

const RUNPOD_CHECK_INTERVAL = 30000 // 30 seconds
const COMFYUI_CHECK_INTERVAL = 15000 // 15 seconds
const WAN_CHECK_INTERVAL = 12000 // 12 seconds — snappier busy/idle for the Wan chip (it's the primary worker)

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

  // Handle client errors to prevent unhandled rejections
  ws.on('error', (error: any) => {
    logger.error('❌ WebSocket client error:', error.message)
    wsClients.delete(ws) // Remove client on error
  })
}

// Broadcast message to all connected clients
export function broadcastToClients(message: WebSocketMessage) {
  const messageStr = JSON.stringify(message)

  wsClients.forEach(ws => {
    try {
      if (ws.readyState === 1) {
        // WebSocket.OPEN
        ws.send(messageStr)
      } else {
        wsClients.delete(ws) // Clean up dead connections
      }
    } catch (error: any) {
      // Silently handle common disconnection errors to prevent unhandled rejections
      if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') {
        logger.error('❌ Failed to send WebSocket message:', error.message)
      }
      wsClients.delete(ws) // Remove failed connection
    }
  })
}

// Send message to specific client
function sendToClient(ws: any, message: WebSocketMessage) {
  try {
    if (ws.readyState === 1) {
      // WebSocket.OPEN
      ws.send(JSON.stringify(message))
    }
  } catch (error: any) {
    // Silently handle common disconnection errors to prevent unhandled rejections
    if (error.code !== 'ECONNRESET' && error.code !== 'EPIPE') {
      logger.error('❌ Failed to send WebSocket message to client:', error.message)
    }
    wsClients.delete(ws)
  }
}

// Calculate overall system health based on component statuses
function calculateSystemHealth(): SystemHealth {
  const { runpodWorker, wanWorker, autoProcessing } = currentStatus

  // Workers are OPTIONAL and run independently — a t2v-only setup runs just the
  // Wan container, so the faceswap worker (runpodWorker) and its ComfyUI being
  // offline is normal, NOT a system outage. So: if ANY worker is up, the system
  // is usable → healthy (degraded only if auto-processing itself is paused).
  // We DON'T let the faceswap ComfyUI's status drag the whole system red.
  const anyWorkerHealthy = runpodWorker.status === 'healthy' || wanWorker.status === 'healthy'
  const allWorkersUnhealthy = runpodWorker.status === 'unhealthy' && wanWorker.status === 'unhealthy'
  const allWorkersUnknown = runpodWorker.status === 'unknown' && wanWorker.status === 'unknown'

  if (anyWorkerHealthy) {
    return autoProcessing.status === 'paused' ? 'degraded' : 'healthy'
  }
  if (allWorkersUnhealthy) {
    return 'unhealthy'
  }
  if (allWorkersUnknown) {
    return 'unknown'
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
      updateStatus(
        {
          runpodWorker: {
            status: 'unhealthy',
            message: `Worker responded with ${response.status}`,
            lastChecked: timestamp,
            responseTime
          }
        },
        'runpod_status_change'
      )
      return
    }

    const healthData = await response.json()
    const isHealthy = healthData.status === 'healthy'

    updateStatus(
      {
        runpodWorker: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          message: healthData.message || 'Worker is responding',
          lastChecked: timestamp,
          responseTime
        }
      },
      'runpod_status_change'
    )
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    updateStatus(
      {
        runpodWorker: {
          status: 'unhealthy',
          message: `Health check failed: ${error.message}`,
          lastChecked: new Date().toISOString(),
          responseTime
        }
      },
      'runpod_status_change'
    )
  }
}

// Check Wan worker health
async function checkWanWorkerHealth() {
  const startTime = Date.now()

  try {
    const workerUrl = process.env.I2V_WORKER_URL || 'http://comfyui-wan-worker:8000'
    const response = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })

    const responseTime = Date.now() - startTime
    const timestamp = new Date().toISOString()

    if (!response.ok) {
      updateStatus(
        {
          wanWorker: {
            status: 'unhealthy',
            message: `Wan worker responded with ${response.status}`,
            lastChecked: timestamp,
            responseTime
          }
        },
        'status_update'
      )
      return
    }

    const healthData = await response.json()
    const isHealthy = healthData.status === 'healthy'

    updateStatus(
      {
        wanWorker: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          message: healthData.message || 'Wan worker is responding',
          lastChecked: timestamp,
          responseTime
        }
      },
      'status_update'
    )
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    updateStatus(
      {
        wanWorker: {
          status: 'unhealthy',
          message: `Health check failed: ${error.message}`,
          lastChecked: new Date().toISOString(),
          responseTime
        }
      },
      'status_update'
    )
  }
}

// Check ComfyUI health and processing status
async function checkComfyUIHealth() {
  const startTime = Date.now()
  const prevComfyUIStatus = currentStatus.comfyui.status

  try {
    const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
    const response = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })

    const responseTime = Date.now() - startTime
    const timestamp = new Date().toISOString()

    if (!response.ok) {
      updateStatus(
        {
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
        },
        'comfyui_status_change'
      )
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

    updateStatus(
      {
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
      },
      'comfyui_status_change'
    )

    // Detect container restart or fresh startup with orphaned jobs.
    // Covers two scenarios:
    //   unhealthy → healthy: container restarted and malris caught the downtime
    //   unknown → healthy:   malris itself was restarted alongside ComfyUI
    // runningCount=0 guards against transient blips where the job is still alive in ComfyUI
    if ((prevComfyUIStatus === 'unhealthy' || prevComfyUIStatus === 'unknown') && isHealthy && runningCount === 0) {
      logger.warn(`⚠️ [RESTART RECOVERY] ComfyUI transitioned ${prevComfyUIStatus} → healthy with empty queue - checking for orphaned active jobs`)
      await requeueOrphanedActiveJobs()
    }

    // Clear any existing timeout since we're disabling this functionality
    if (resetActiveJobsTimeout) {
      clearTimeout(resetActiveJobsTimeout)
      resetActiveJobsTimeout = null
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    updateStatus(
      {
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
      },
      'comfyui_status_change'
    )
  }
}

// Update job counts from database - call this when jobs are modified
export async function updateJobCounts() {
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

    // train_lora jobs parked in need_input are "paused" (a queue mechanic so the
    // picker skips them), not faceswap jobs awaiting a source image. Subtract
    // them so the Need Input badge reflects only actionable jobs.
    const pausedTrainingRows = await db
      .select({ c: count() })
      .from(jobs)
      .where(and(eq(jobs.status, 'need_input'), eq(jobs.jobType, 'train_lora')))
    counts.needInput = Math.max(0, counts.needInput - Number(pausedTrainingRows[0]?.c || 0))

    updateStatus(
      {
        jobCounts: counts
      },
      'job_counts_update'
    )
  } catch (error: any) {
    logger.error(`❌ [JOB COUNTS] Failed to update job counts`, error)
  }
}

// Update auto processing status
export function updateAutoProcessingStatus(status: AutoProcessingStatus, message: string, intervalActive: boolean = false) {
  updateStatus(
    {
      autoProcessing: {
        status,
        message,
        lastToggled: new Date().toISOString(),
        intervalActive
      }
    },
    'auto_processing_toggle'
  )
}

// Broadcast state correction to all clients
export function broadcastStateCorrection(correction: { oldState: string; newState: string; reason: string; actions: string[] }) {
  broadcastToClients({
    type: 'state_correction' as any,
    data: {
      oldState: correction.oldState,
      newState: correction.newState,
      reason: correction.reason,
      actions: correction.actions,
      timestamp: new Date().toISOString()
    } as any,
    timestamp: new Date().toISOString()
  })
}

// Start all monitoring intervals
export function startSystemMonitoring() {
  logger.info('🚀 Starting system status monitoring...')

  // Stop any existing intervals
  stopSystemMonitoring()

  // Start health checks immediately
  checkRunPodWorkerHealth()
  checkComfyUIHealth()
  checkWanWorkerHealth()
  updateJobCounts()

  // Set up intervals (no job counts polling - updated reactively)
  runpodHealthInterval = setInterval(checkRunPodWorkerHealth, RUNPOD_CHECK_INTERVAL)
  comfyuiHealthInterval = setInterval(checkComfyUIHealth, COMFYUI_CHECK_INTERVAL)
  setInterval(checkWanWorkerHealth, WAN_CHECK_INTERVAL)

  // Start reconciliation service
  import('./stateReconciliation')
    .then(module => {
      module.startReconciliationService()
    })
    .catch(error => {
      logger.error('❌ Failed to start reconciliation service:', error)
    })

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
// Checks both faceswap and wan workers — healthy if either is up
export async function checkWorkerHealth() {
  try {
    const results = await Promise.allSettled([
      checkSingleWorkerHealth(process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'),
      checkSingleWorkerHealth(process.env.I2V_WORKER_URL || 'http://comfyui-wan-worker:8000'),
    ])

    const faceswap = results[0].status === 'fulfilled' ? results[0].value : { healthy: false, available: false, runningJobIds: [] }
    const wan = results[1].status === 'fulfilled' ? results[1].value : { healthy: false, available: false, runningJobIds: [] }

    return {
      healthy: faceswap.healthy || wan.healthy,
      available: faceswap.available || wan.available,
      runningJobIds: [...faceswap.runningJobIds, ...wan.runningJobIds],
    }
  } catch (error: any) {
    return { healthy: false, available: false, runningJobIds: [] }
  }
}

async function checkSingleWorkerHealth(workerUrl: string) {
  try {
    const response = await fetch(`${workerUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      return { healthy: false, available: false, runningJobIds: [] }
    }

    const healthData = await response.json()
    const isHealthy = healthData.status === 'healthy'

    const actualRunningCount = healthData.active_jobs?.running_count || 0
    const actualPendingCount = healthData.active_jobs?.pending_count || 0
    const isAvailable = actualRunningCount === 0 && actualPendingCount === 0

    const runningJobIds = healthData.running_jobs || []

    return {
      healthy: isHealthy,
      available: isAvailable,
      runningJobIds,
    }
  } catch (_error: any) {
    return { healthy: false, available: false, runningJobIds: [] }
  }
}

// Initialize monitoring on module load
startSystemMonitoring()

// Graceful shutdown
process.on('SIGTERM', stopSystemMonitoring)
process.on('SIGINT', stopSystemMonitoring)
