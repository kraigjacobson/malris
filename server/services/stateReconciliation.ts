/**
 * State Reconciliation Service
 * Detects and corrects state desynchronization between:
 * - Server processing state (currentMode in jobProcessingService)
 * - ComfyUI worker actual queue status
 * - Database job records
 *
 * Runs periodically and broadcasts corrections via WebSocket
 */

import { logger } from '~/server/utils/logger'
import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { eq, sql } from 'drizzle-orm'
import { getProcessingStatus, stopAllProcessing } from './jobProcessingService'
import { checkWorkerHealth, broadcastStateCorrection } from './systemStatusManager'

// Reconciliation interval (15 seconds) for quick checks
const RECONCILIATION_INTERVAL = 15000

// Zombie job check interval (10 minutes) - less frequent since continuous mode has legitimate running jobs
const ZOMBIE_CHECK_INTERVAL = 600000

// Grace period after startup before checking for ComfyUI zombies (5 minutes)
const STARTUP_GRACE_PERIOD = 5 * 60 * 1000

let reconciliationInterval: NodeJS.Timeout | null = null
let lastZombieCheckTime: number = 0
let reconciliationStartTime: number = 0

interface ReconciliationResult {
  correctionMade: boolean
  oldState?: string
  newState?: string
  reason?: string
  actions?: string[]
}

/**
 * Main reconciliation function
 * Checks for state desync and corrects it
 */
async function reconcileProcessingState(): Promise<ReconciliationResult> {
  try {
    const db = getDb()

    // Get current states from different sources
    const serverProcessingState = getProcessingStatus()
    const workerHealth = await checkWorkerHealth()

    // Get job counts from database
    const [activeJobsResult, queuedJobsResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(eq(jobs.status, 'active')),
      db.select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(eq(jobs.status, 'queued'))
    ])

    const dbActiveCount = Number(activeJobsResult[0]?.count || 0)
    const dbQueuedCount = Number(queuedJobsResult[0]?.count || 0)
    const workerRunningCount = workerHealth.actualRunningCount || 0

    const actions: string[] = []

    // Rule 1: Server is in continuous mode, but worker is idle and no jobs queued
    if (serverProcessingState.isContinuous &&
        workerHealth.available &&
        dbActiveCount === 0 &&
        dbQueuedCount === 0) {

      logger.warn(`⚠️ [RECONCILIATION] State desync detected: Server in continuous mode but worker idle + 0 active + 0 queued jobs`)

      // Force stop processing (turns off continuous mode)
      await stopAllProcessing()
      actions.push('Stopped processing (no jobs to process)')

      // Broadcast correction
      broadcastStateCorrection({
        oldState: 'continuous',
        newState: 'single',
        reason: 'No jobs queued and worker idle',
        actions
      })

      return {
        correctionMade: true,
        oldState: 'continuous',
        newState: 'single',
        reason: 'No jobs queued and worker idle',
        actions
      }
    }

    // Rule 2: Database has active jobs but ComfyUI reports 0 running (zombie jobs)
    // CRITICAL FIX: Don't fire this rule during continuous processing - there's a delay between
    // marking job as active and ComfyUI reporting it. Only check for zombies when NOT in continuous mode.
    // ALSO: Only mark as zombie if the job has been stuck for 8+ hours (stale timestamp)
    if (dbActiveCount > 0 && workerRunningCount === 0 && !serverProcessingState.isContinuous) {
      // Get the active jobs with their timestamps
      const activeJobs = await db
        .select({ id: jobs.id, updatedAt: jobs.updatedAt })
        .from(jobs)
        .where(eq(jobs.status, 'active'))

      // Filter to only jobs that have been stuck for 8+ hours
      const ZOMBIE_THRESHOLD_MS = 8 * 60 * 60 * 1000 // 8 hours in milliseconds
      const now = new Date()
      const zombieJobs = activeJobs.filter(job => {
        const timeSinceUpdate = now.getTime() - new Date(job.updatedAt).getTime()
        return timeSinceUpdate >= ZOMBIE_THRESHOLD_MS
      })

      if (zombieJobs.length > 0) {
        const zombieJobIds = zombieJobs.map(j => j.id)
        logger.warn(`⚠️ [RECONCILIATION] Zombie active jobs detected: ${zombieJobs.length} jobs stuck for 8+ hours`)
        logger.warn(`⚠️ [RECONCILIATION] Zombie job IDs: ${zombieJobIds.join(', ')}`)

        // Mark only the stale zombie jobs as failed
        for (const zombieJob of zombieJobs) {
          await db
            .update(jobs)
            .set({
              status: 'failed',
              sourceMediaUuid: null, // Clear sourceMediaUuid so they become test workflows when retried
              updatedAt: new Date(),
              errorMessage: 'Job marked as failed by reconciliation - stuck in active state for 8+ hours'
            })
            .where(eq(jobs.id, zombieJob.id))
        }

        actions.push(`Marked ${zombieJobs.length} stale zombie jobs as failed (stuck 8+ hours)`)

        // Update job counts
        const { updateJobCounts } = await import('./systemStatusManager')
        await updateJobCounts()

        // Broadcast correction
        broadcastStateCorrection({
          oldState: 'active_jobs_present',
          newState: 'zombie_jobs_cleaned',
          reason: `${zombieJobs.length} active jobs stuck for 8+ hours - marked as failed`,
          actions
        })

        return {
          correctionMade: true,
          oldState: 'active_jobs_present',
          newState: 'zombie_jobs_cleaned',
          reason: `${zombieJobs.length} active jobs stuck for 8+ hours - marked as failed`,
          actions
        }
      } else {
        // Active jobs exist but they're all recent (< 8 hours old)
        logger.info(`ℹ️ [RECONCILIATION] ${dbActiveCount} active jobs found but all are recent (< 8 hours old) - not marking as zombies`)
      }
    }

    // Rule 3: DISABLED - This rule was too aggressive and caused false positives
    // Original intent: Return active jobs to queue when server stopped processing
    // Problem: Can't reliably detect "abandoned" vs "finishing" jobs based on timestamp alone
    // Solution: Let Rule 2 (zombie check with 8hr threshold) handle truly stuck jobs instead
    // If user manually stops processing, they can manually requeue jobs if needed

    // Rule 4: ComfyUI has running jobs but DB has 0 active (zombie jobs in ComfyUI)
    // Check less frequently (every 10 minutes) since continuous mode legitimately has running jobs
    // ALSO: Don't fire during startup grace period (5 minutes) - ComfyUI might have legitimate jobs from previous run
    const now = Date.now()
    const timeSinceLastZombieCheck = now - lastZombieCheckTime
    const timeSinceStartup = now - reconciliationStartTime

    if (dbActiveCount === 0 && workerRunningCount > 0) {
      // Check if we should run Rule 4 based on cooldown and grace period
      if (timeSinceLastZombieCheck < ZOMBIE_CHECK_INTERVAL) {
        // Cooldown period - don't log spam
      } else if (timeSinceStartup < STARTUP_GRACE_PERIOD) {
        const remainingGrace = Math.ceil((STARTUP_GRACE_PERIOD - timeSinceStartup) / 60000)
        logger.info(`ℹ️ [RECONCILIATION] ComfyUI has ${workerRunningCount} running jobs but DB has 0 active - within startup grace period (${remainingGrace} min remaining)`)
      } else {
        lastZombieCheckTime = now // Update timestamp

        logger.warn(`⚠️ [RECONCILIATION] Zombie jobs in ComfyUI detected: DB has 0 active jobs but ComfyUI reports ${workerRunningCount} running`)
        logger.warn(`⚠️ [RECONCILIATION] ComfyUI zombie job IDs: ${workerHealth.runningJobIds?.join(', ')}`)

        // Use the worker's interrupt endpoint which properly clears both execution and queue
        try {
          const workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'
          logger.info('🛑 Calling /interrupt to clear ALL zombie jobs and queue...')

          const interruptResponse = await fetch(`${workerUrl}/interrupt`, {
            method: 'POST',
            signal: AbortSignal.timeout(10000)
          })

          if (interruptResponse.ok) {
            const result = await interruptResponse.json()
            const interruptedCount = result.interrupted_jobs?.length || 0
            actions.push(`Interrupted ${interruptedCount} zombie jobs and cleared queue`)
            logger.info(`✅ Successfully cleared ComfyUI: interrupted ${interruptedCount} jobs, queue_cleared: ${result.queue_cleared}`)

            // Give ComfyUI time to fully restart and clear its state
            await new Promise(resolve => setTimeout(resolve, 2000))
          } else {
            actions.push(`Failed to interrupt ComfyUI (status ${interruptResponse.status})`)
            logger.error(`❌ Failed to interrupt ComfyUI: ${interruptResponse.status}`)
          }
        } catch (error: any) {
          actions.push(`Failed to interrupt ComfyUI: ${error.message}`)
          logger.error(`❌ Failed to interrupt ComfyUI:`, error)
        }

        // Broadcast correction
        broadcastStateCorrection({
          oldState: 'comfyui_zombie_jobs',
          newState: 'zombies_cleared',
          reason: `ComfyUI had ${workerRunningCount} zombie jobs with no DB records - queue cleared`,
          actions
        })

        return {
          correctionMade: true,
          oldState: 'comfyui_zombie_jobs',
          newState: 'zombies_cleared',
          reason: `ComfyUI had ${workerRunningCount} zombie jobs with no DB records - queue cleared`,
          actions
        }
      }
    }

    // No correction needed - but refresh job counts to ensure they're accurate
    // This handles cases where jobs changed status but updateJobCounts() wasn't called
    const { updateJobCounts } = await import('./systemStatusManager')
    await updateJobCounts()

    return { correctionMade: false }

  } catch (error: any) {
    logger.error('❌ [RECONCILIATION] Failed to reconcile state:', error)
    return { correctionMade: false }
  }
}

/**
 * Start the reconciliation service
 */
export function startReconciliationService() {
  if (reconciliationInterval) {
    logger.warn('⚠️ [RECONCILIATION] Service already running, stopping old instance')
    stopReconciliationService()
  }

  logger.info('🔄 [RECONCILIATION] Starting state reconciliation service...')

  // Mark the startup time for grace period
  reconciliationStartTime = Date.now()
  logger.info(`🕐 [RECONCILIATION] Grace period active: Rule 4 won't fire for ${STARTUP_GRACE_PERIOD / 60000} minutes`)

  // Run immediately on start
  reconcileProcessingState().then(result => {
    if (result.correctionMade) {
      logger.info(`✅ [RECONCILIATION] Initial check made correction: ${result.reason}`)
    } else {
      logger.info('✅ [RECONCILIATION] Initial check - no corrections needed')
    }
  })

  // Then run on interval
  reconciliationInterval = setInterval(async () => {
    const result = await reconcileProcessingState()

    if (result.correctionMade) {
      logger.info(`✅ [RECONCILIATION] Correction applied: ${result.oldState} → ${result.newState}`)
      logger.info(`   Reason: ${result.reason}`)
      logger.info(`   Actions: ${result.actions?.join(', ')}`)
    }
    // Don't log when no correction needed to avoid spam
  }, RECONCILIATION_INTERVAL)

  logger.info('✅ [RECONCILIATION] State reconciliation service started')
}

/**
 * Stop the reconciliation service
 */
export function stopReconciliationService() {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval)
    reconciliationInterval = null
    logger.info('⏹️ [RECONCILIATION] State reconciliation service stopped')
  }
}

// Graceful shutdown
process.on('SIGTERM', stopReconciliationService)
process.on('SIGINT', stopReconciliationService)
