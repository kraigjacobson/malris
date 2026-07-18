/**
 * Unified Job Processing Service
 * Handles single job processing, continuous processing, and queue management
 * Prevents duplicate job submissions and manages processing state
 */

import { getDb } from '~/server/utils/database'
import { jobs, jobPresets, subjects, mediaRecords } from '~/server/utils/schema'
import { eq, desc, sql, and } from 'drizzle-orm'
import { updateAutoProcessingStatus, getCurrentStatus, checkWorkerHealth, broadcastToClients } from './systemStatusManager'
import { logger } from '~/server/utils/logger'
import { buildPresetSnapshot } from '~/server/utils/presetSnapshot'
import { expandWildcards } from '~/server/utils/expandWildcards'

// Continuous processing flag
// When true, server will automatically process next job after current job finishes
// When false, server will stop after current job finishes
let continuousMode = false
let processingInterval: NodeJS.Timeout | null = null
let isCurrentlyProcessing = false // Global lock to prevent concurrent processing
const PROCESSING_INTERVAL = 5000 // 5 seconds between checks in continuous mode

// Optional cap on number of jobs continuous mode will process before auto-stopping.
// null = unlimited (classic Process All behavior).
let jobLimit: number | null = null
let jobsProcessedCount = 0

// Preferred source type for job processing
// What the continuous picker considers eligible.
// 'all':          any job (test → vid → fs → i2v → t2v priority chain)
// 'source':       vid_faceswap sub-mode where sourceMediaUuid IS NULL
// 'vid':          vid_faceswap sub-mode where sourceMediaUuid IS NOT NULL
// 'vid_faceswap': any vid_faceswap job (source or vid sub-mode)
// 'fs':           single-image face-swap jobs only
// 'i2v':          wan i2v jobs only
// 't2v':          wan t2v (text-to-video, no input image) jobs only
// 'train_lora':   LoRA training runs only (dispatched to the ktrain trainer)
type PreferredSourceType = 'all' | 'source' | 'vid' | 'vid_faceswap' | 'fs' | 'i2v' | 't2v' | 'train_lora'
let preferredSourceType: PreferredSourceType = 'all'

// Pick order for i2v jobs.
// 'chronological': most recently-updated queued i2v job (legacy behavior)
// 'random': random queued i2v job, preferring the preset last run so LoRAs don't
//           have to be reloaded between jobs. Falls back to any queued i2v if no
//           queued jobs share the last-run preset.
let pickOrder: 'chronological' | 'random' = 'random'

// Optional preset filter for i2v continuous processing.
// null: pick from any queued i2v job (current behavior).
// uuid: only pick queued i2v jobs whose preset_id matches. No fallback when
//       the queue empties — continuous mode just stops, same as if there
//       were no jobs of any type.
let presetFilter: string | null = null

// Optional subject filter for continuous processing. Unlike presetFilter
// (i2v-only), this scopes EVERY job type — only queued jobs whose subject_uuid
// matches are eligible. null: any subject (current behavior). No fallback when
// the scoped queue empties — continuous mode just stops.
let subjectFilter: string | null = null

// Extra WHERE conditions for the subject scope, spread into each picker's
// and(...). Returns [] when no subject is pinned so the queries are unchanged.
const subjectConds = () => (subjectFilter ? [eq(jobs.subjectUuid, subjectFilter)] : [])

// In-memory priority queue. Jobs in this list (in order) are checked first by
// the picker — they jump the normal source-type ordering. Stale IDs (completed,
// failed, deleted) are pruned lazily as the picker iterates. Resets to empty
// on server restart (priorities are intentionally ephemeral; if persistence is
// needed later, move this to a DB column).
let priorityQueue: string[] = []

export function getPriorityQueue(): string[] {
  return [...priorityQueue]
}

// Push jobs to the FRONT of the priority queue (preserving the given order).
// If an id is already in the queue it's moved to the front. De-duplicates.
export function prioritizeJobs(jobIds: string[]): string[] {
  const incoming = jobIds.filter(id => typeof id === 'string' && id.length > 0)
  if (incoming.length === 0) return [...priorityQueue]
  const incomingSet = new Set(incoming)
  // Drop any prior occurrences, then prepend the new ones (incoming order)
  priorityQueue = [...incoming, ...priorityQueue.filter(id => !incomingSet.has(id))]
  return [...priorityQueue]
}

export function dePrioritizeJobs(jobIds: string[]): string[] {
  const drop = new Set(jobIds)
  priorityQueue = priorityQueue.filter(id => !drop.has(id))
  return [...priorityQueue]
}

export function getPickOrder() {
  return pickOrder
}

export function setPickOrder(order: 'chronological' | 'random') {
  if (order !== 'chronological' && order !== 'random') {
    throw new Error(`Invalid pickOrder: ${order}`)
  }
  if (pickOrder === order) return
  pickOrder = order
  logger.info(`🎲 [PROCESSING] pickOrder set to ${pickOrder}`)
  broadcastProcessingStateChange()
}

export function getPresetFilter() {
  return presetFilter
}

export function setPresetFilter(filter: string | null) {
  // Accept null/empty/'all' as "no filter".
  const next = filter && filter !== 'all' ? filter : null
  if (presetFilter === next) return
  presetFilter = next
  logger.info(`🎯 [PROCESSING] presetFilter set to ${presetFilter ?? 'all'}`)
  broadcastProcessingStateChange()
}

export function getSubjectFilter() {
  return subjectFilter
}

export function setSubjectFilter(filter: string | null) {
  // Accept null/empty/'all' as "no filter".
  const next = filter && filter !== 'all' ? filter : null
  if (subjectFilter === next) return
  subjectFilter = next
  logger.info(`👤 [PROCESSING] subjectFilter set to ${subjectFilter ?? 'all'}`)
  broadcastProcessingStateChange()
}

// Helper to broadcast processing state changes to WebSocket clients
function broadcastProcessingStateChange() {
  const isActive = continuousMode || isCurrentlyProcessing
  broadcastToClients({
    type: 'processing_state_change',
    data: {
      mode: continuousMode ? 'continuous' : 'single',
      isActive,
      isContinuous: continuousMode,
      sourceType: preferredSourceType,
      pickOrder,
      presetFilter,
      subjectFilter,
      jobLimit,
      jobsProcessedCount
    },
    timestamp: new Date().toISOString()
  })
  logger.info(`📢 [PROCESSING] Broadcasted state change: continuousMode=${continuousMode}, isActive=${isActive}, sourceType=${preferredSourceType}, pickOrder=${pickOrder}, presetFilter=${presetFilter ?? 'all'}, subjectFilter=${subjectFilter ?? 'all'}, jobLimit=${jobLimit}, processed=${jobsProcessedCount}`)
}

export interface ProcessNextJobResult {
  success: boolean
  message: string
  job_id?: string
  status?: string
  worker_response?: any
  active_job_id?: string
  skip?: boolean
  noJobsRemaining?: boolean // Signals continuous mode should stop (no jobs of any type)
  workerUnreachable?: boolean // Signals continuous mode should stop (worker for this job type is down)
  usedFallback?: boolean // Indicates we processed a different type than preferred
  actualType?: 'source' | 'vid' // What type was actually processed
}

// Distinguish "the worker container is down/unreachable" (a connection-level
// failure — every job of this type will fail the same way, so continuous mode
// should stop) from a genuine per-job error (bad input, missing media — skip
// that one job and keep going). Covers the undici "fetch failed" we see when a
// worker container is not running, plus common connection error codes/timeouts.
function isWorkerUnreachableError(err: any): boolean {
  if (!err) return false
  const msg = (err.message || '').toLowerCase()
  const causeCode = err.cause ? (err.cause.code || err.cause.errno || '') : ''
  const code = (err.code || causeCode || '').toString().toUpperCase()
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    err.name === 'AbortError' ||
    err.name === 'TimeoutError' ||
    ['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)
  )
}

// Function to get current processing status
export function getProcessingStatus() {
  return {
    mode: continuousMode ? 'continuous' : 'single',
    isActive: continuousMode || isCurrentlyProcessing,
    isContinuous: continuousMode,
    sourceType: preferredSourceType,
    pickOrder,
    presetFilter,
    subjectFilter,
    jobLimit,
    jobsProcessedCount
  }
}

// Function to get cached worker health (for backward compatibility)
export function getCachedWorkerHealth() {
  const systemStatus = getCurrentStatus()
  return {
    healthy: systemStatus.runpodWorker.status === 'healthy' && systemStatus.comfyui.status === 'healthy',
    available: systemStatus.comfyuiProcessing.status === 'idle',
    status: systemStatus.systemHealth === 'healthy' ? 'healthy' : 'unhealthy',
    message: systemStatus.systemHealth === 'healthy' ? 'All systems operational' : 'System issues detected',
    timestamp: systemStatus.timestamp,
    queue_remaining: systemStatus.comfyuiProcessing.queuedJobs,
    running_jobs_count: systemStatus.comfyuiProcessing.runningJobs
  }
}

// We're now importing checkWorkerHealth from systemStatusManager.ts
// The zombie cleanup is handled by marking all other active jobs as failed

// Pick the next wan job (i2v or t2v) to run.
// chronological: most recently-updated queued job (legacy behavior).
// random: prefer a queued job that shares a preset with the most recently
// run job of the same type (active/completed) so LoRAs don't have to reload;
// otherwise fall back to any random queued job of that type.
// presetFilter pins the pool to a single preset and short-circuits the
// carryover/fallback logic — when that preset's queue is empty, return empty.
async function pickWanJob(db: ReturnType<typeof getDb>, order: 'chronological' | 'random', wanJobType: 'i2v' | 't2v' = 'i2v') {
  const selectCols = {
    id: jobs.id,
    jobType: jobs.jobType,
    subjectUuid: jobs.subjectUuid,
    destMediaUuid: jobs.destMediaUuid,
    sourceMediaUuid: jobs.sourceMediaUuid,
    presetId: jobs.presetId,
    parameters: jobs.parameters,
    createdAt: jobs.createdAt,
    updatedAt: jobs.updatedAt,
  }

  // Preset filter pinned: only consider jobs in that preset, no fallback.
  if (presetFilter) {
    const orderBy = order === 'chronological' ? desc(jobs.updatedAt) : sql`RANDOM()`
    logger.info(`🎬 Processing ${wanJobType} job (${order}, preset-filtered=${presetFilter})`)
    return db
      .select(selectCols)
      .from(jobs)
      .where(and(
        eq(jobs.status, 'queued'),
        eq(jobs.jobType, wanJobType),
        eq(jobs.presetId, presetFilter),
        ...subjectConds(),
      ))
      .orderBy(orderBy)
      .limit(1)
  }

  if (order === 'chronological') {
    logger.info(`🎬 Processing ${wanJobType} job (chronological)`)
    return db
      .select(selectCols)
      .from(jobs)
      .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, wanJobType), ...subjectConds()))
      .orderBy(desc(jobs.updatedAt))
      .limit(1)
  }

  // Random mode: find the preset_id of the most recent non-queued job of this
  // type (the one currently loaded on the worker, or the last thing it ran) so
  // we can prefer jobs that reuse the same LoRAs.
  const recentRun = await db
    .select({ presetId: jobs.presetId })
    .from(jobs)
    .where(and(
      eq(jobs.jobType, wanJobType),
      sql`${jobs.status} IN ('active', 'completed')`,
      sql`${jobs.presetId} IS NOT NULL`,
    ))
    .orderBy(desc(jobs.updatedAt))
    .limit(1)

  const lastPresetId = recentRun[0]?.presetId || null

  if (lastPresetId) {
    const matchingJobs = await db
      .select(selectCols)
      .from(jobs)
      .where(and(
        eq(jobs.status, 'queued'),
        eq(jobs.jobType, wanJobType),
        eq(jobs.presetId, lastPresetId),
        ...subjectConds(),
      ))
      .orderBy(sql`RANDOM()`)
      .limit(1)

    if (matchingJobs.length > 0) {
      logger.info(`🎬 Processing ${wanJobType} job (random, reusing preset ${lastPresetId})`)
      return matchingJobs
    }
  }

  logger.info(`🎬 Processing ${wanJobType} job (random, no preset carryover)`)
  return db
    .select(selectCols)
    .from(jobs)
    .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, wanJobType), ...subjectConds()))
    .orderBy(sql`RANDOM()`)
    .limit(1)
}

// Pick the next fs (single-image face-swap) job to run. fs jobs have no
// preset/LoRA carryover concerns, so ordering is just chronological by
// created_at or random, per the pickOrder toggle.
async function pickFsJob(db: ReturnType<typeof getDb>, order: 'chronological' | 'random') {
  const orderBy = order === 'chronological' ? jobs.createdAt : sql`RANDOM()`
  logger.info(`🎭 Processing fs job (${order})`)
  return db
    .select({
      id: jobs.id,
      jobType: jobs.jobType,
      subjectUuid: jobs.subjectUuid,
      destMediaUuid: jobs.destMediaUuid,
      sourceMediaUuid: jobs.sourceMediaUuid,
      presetId: jobs.presetId,
      parameters: jobs.parameters,
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'fs'), ...subjectConds()))
    .orderBy(orderBy)
    .limit(1)
}

export async function processNextJob(): Promise<ProcessNextJobResult> {
  // CRITICAL FIX: Global processing lock prevents concurrent job processing from ANY source
  // (auto-processing, manual endpoint, etc.)
  if (isCurrentlyProcessing) {
    return {
      success: false,
      message: 'Another job is already being processed - preventing duplicate submission',
      skip: true
    }
  }

  isCurrentlyProcessing = true

  try {
    const db = getDb()

    // Real-time health check. Training jobs go to the ktrain trainer, not the
    // ComfyUI workers, so the train_lora scope skips this gate (the trainer's
    // own reachability is enforced at dispatch — unreachable leaves the job
    // queued, same as the other workers).
    if (preferredSourceType !== 'train_lora') {
      const realTimeHealth = await checkWorkerHealth()
      if (!realTimeHealth.healthy) {
        return {
          success: false,
          message: 'ComfyUI worker is not healthy',
          skip: true
        }
      }

      if (!realTimeHealth.available) {
        return {
          success: false,
          message: 'ComfyUI worker queue is busy',
          skip: true
        }
      }

      logger.info(`✅ ComfyUI worker is healthy and idle - proceeding with job processing (preferredSourceType: ${preferredSourceType})`)
    }

    // SINGLE-ACTIVE GUARD: never start a new job while one is already active.
    // We hold the isCurrentlyProcessing lock for the whole function and this is
    // the only code path that sets a job to 'active', so once this reads 0 it
    // stays 0 until we set our own job active below. Checked BEFORE dispatching
    // to the worker so a busy slot leaves the candidate queued instead of
    // failing the running job.
    const [{ count: activeNow } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(eq(jobs.status, 'active'))
    if (Number(activeNow) > 0) {
      logger.info(`🕐 ${activeNow} job(s) already active - leaving next job queued until the slot frees up`)
      return {
        success: false,
        message: `Skipping - ${activeNow} job(s) already active`,
        skip: true
      }
    }

    // Check counts of queued jobs by type. The i2v count narrows to the
    // pinned preset when presetFilter is set so we don't incorrectly claim
    // "i2v jobs available" when none belong to the chosen preset.
    const i2vConditions = [eq(jobs.status, 'queued'), eq(jobs.jobType, 'i2v')]
    if (presetFilter) {
      i2vConditions.push(eq(jobs.presetId, presetFilter))
    }
    i2vConditions.push(...subjectConds())
    const [testJobCount, videoJobCount, i2vJobCount, fsJobCount, t2vJobCount, trainLoraJobCount] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NULL`, ...subjectConds())),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NOT NULL`, ...subjectConds())),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(...i2vConditions)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'fs'), ...subjectConds())),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 't2v'), ...subjectConds())),
      db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'train_lora'), ...subjectConds()))
    ])

    const testCount = testJobCount[0]?.count || 0
    const videoCount = videoJobCount[0]?.count || 0
    const i2vCount = i2vJobCount[0]?.count || 0
    const fsCount = fsJobCount[0]?.count || 0
    const t2vCount = t2vJobCount[0]?.count || 0
    const trainLoraCount = trainLoraJobCount[0]?.count || 0

    // Compute the scope-aware "remaining" count so continuous mode stops when
    // the *scoped* queue empties — not when ALL queues happen to be empty.
    // e.g. user picked fs scope: stop once fsCount === 0 even if i2v has work.
    let scopedRemaining: number
    switch (preferredSourceType) {
      case 'source':       scopedRemaining = testCount; break
      case 'vid':          scopedRemaining = videoCount; break
      case 'vid_faceswap': scopedRemaining = testCount + videoCount; break
      case 'fs':           scopedRemaining = fsCount; break
      case 'i2v':          scopedRemaining = i2vCount; break
      case 't2v':          scopedRemaining = t2vCount; break
      case 'train_lora':   scopedRemaining = trainLoraCount; break
      default:             scopedRemaining = testCount + videoCount + i2vCount + fsCount + t2vCount + trainLoraCount
    }

    if (scopedRemaining === 0) {
      if (continuousMode) {
        logger.info(`⏹️ No queued jobs in scope '${preferredSourceType}' - signaling continuous mode to stop`)
        return {
          success: false,
          message: `No queued jobs found for scope '${preferredSourceType}' - stopping continuous processing`,
          skip: true,
          noJobsRemaining: true
        }
      }
      return {
        success: false,
        message: `No queued jobs found for scope '${preferredSourceType}'`,
        skip: true
      }
    }

    let queuedJobs

    // Priority queue gets first dibs. Walk the in-memory list in order; pick
    // the first job that's still queued AND matches the current scope filter.
    // Stale or out-of-scope entries get pruned from the queue lazily.
    if (priorityQueue.length > 0) {
      const scopeMatches = (jobType: string, sourceMediaUuid: string | null) => {
        switch (preferredSourceType) {
          case 'all':          return true
          case 'source':       return jobType === 'vid_faceswap' && sourceMediaUuid === null
          case 'vid':          return jobType === 'vid_faceswap' && sourceMediaUuid !== null
          case 'vid_faceswap': return jobType === 'vid_faceswap'
          case 'fs':           return jobType === 'fs'
          case 'i2v':          return jobType === 'i2v'
          case 't2v':          return jobType === 't2v'
          case 'train_lora':   return jobType === 'train_lora'
          default:             return true
        }
      }

      // Snapshot then iterate — we drop pruned ids back into the canonical list.
      const snapshot = [...priorityQueue]
      const keep: string[] = []
      let picked: any = null

      for (const id of snapshot) {
        if (picked) {
          // Already picked one — preserve remaining order for the next call.
          keep.push(id)
          continue
        }
        const candidate = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt,
            status: jobs.status
          })
          .from(jobs)
          .where(eq(jobs.id, id))
          .limit(1)

        if (candidate.length === 0 || candidate[0].status !== 'queued') {
          // Stale — drop from priority list
          logger.info(`🧹 Pruning stale priority entry ${id} (not queued)`)
          continue
        }
        const c = candidate[0]
        if (!scopeMatches(c.jobType as string, c.sourceMediaUuid)) {
          // Out of current scope — keep it for later (scope might change)
          keep.push(id)
          continue
        }
        if (subjectFilter && c.subjectUuid !== subjectFilter) {
          // Out of the pinned subject scope — keep for later (filter might change)
          keep.push(id)
          continue
        }

        logger.info(`⭐ PRIORITY pick ${id} (jobType=${c.jobType})`)
        // Strip the status column before handing off — downstream code expects
        // the same shape the normal pickers produce.
        const { status: _status, ...rest } = c
        void _status
        picked = rest
      }

      // Commit the trimmed queue
      priorityQueue = keep

      if (picked) {
        queuedJobs = [picked]
      }
    }

    let usedFallback = false
    let actualType: 'source' | 'vid' | undefined

    // If the priority queue handed us a job, skip the entire scope-based picker.
    if (!queuedJobs) {
    if (preferredSourceType === 'source') {
      // Prefer source jobs (test), fallback to video jobs
      if (testCount > 0) {
        logger.info(`📋 Processing source job (${testCount} available)`)
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NULL`, ...subjectConds()))
          .orderBy(desc(jobs.updatedAt))
          .limit(1)
        actualType = 'source'
      } else if (videoCount > 0) {
        logger.info(`🔄 No source jobs available, falling back to video job (${videoCount} available)`)
        usedFallback = true
        const orderBy = sql`RANDOM()`
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NOT NULL`, ...subjectConds()))
          .orderBy(orderBy)
          .limit(1)
        actualType = 'vid'
      }
    } else if (preferredSourceType === 'vid') {
      // Prefer video jobs, fallback to source jobs
      if (videoCount > 0) {
        logger.info(`🎥 Processing video job (${videoCount} available)`)
        const orderBy = sql`RANDOM()`
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NOT NULL`, ...subjectConds()))
          .orderBy(orderBy)
          .limit(1)
        actualType = 'vid'
      } else if (testCount > 0) {
        logger.info(`🔄 No video jobs available, falling back to source job (${testCount} available)`)
        usedFallback = true
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NULL`, ...subjectConds()))
          .orderBy(desc(jobs.updatedAt))
          .limit(1)
        actualType = 'source'
      }
    } else if (preferredSourceType === 'vid_faceswap') {
      // Scoped to vid_faceswap only — prefer test (source-only) jobs then vid jobs.
      // Stops when both queues are empty (no fallback to fs or i2v).
      if (testCount > 0) {
        logger.info(`📋 vid_faceswap scope: processing source job (${testCount} available)`)
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NULL`, ...subjectConds()))
          .orderBy(desc(jobs.updatedAt))
          .limit(1)
        actualType = 'source'
      } else if (videoCount > 0) {
        logger.info(`🎥 vid_faceswap scope: processing video job (${videoCount} available)`)
        const orderBy = sql`RANDOM()`
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NOT NULL`, ...subjectConds()))
          .orderBy(orderBy)
          .limit(1)
        actualType = 'vid'
      }
    } else if (preferredSourceType === 'fs') {
      // Scoped to single-image face-swap (i2i) jobs only.
      if (fsCount > 0) {
        logger.info(`🎭 fs scope: processing fs job (${fsCount} available)`)
        queuedJobs = await pickFsJob(db, pickOrder)
      }
    } else if (preferredSourceType === 'i2v') {
      // Scoped to wan i2v jobs only (honors the existing presetFilter inside pickWanJob).
      if (i2vCount > 0) {
        logger.info(`🎬 i2v scope: processing i2v job (${i2vCount} available)`)
        queuedJobs = await pickWanJob(db, pickOrder, 'i2v')
      }
    } else if (preferredSourceType === 't2v') {
      // Scoped to wan t2v (text-to-video) jobs only.
      if (t2vCount > 0) {
        logger.info(`🎬 t2v scope: processing t2v job (${t2vCount} available)`)
        queuedJobs = await pickWanJob(db, pickOrder, 't2v')
      }
    } else if (preferredSourceType === 'train_lora') {
      // Scoped to LoRA training runs only — oldest first (FIFO; trainings are
      // multi-hour, so "most recently touched first" would invert intent).
      if (trainLoraCount > 0) {
        logger.info(`🎓 train_lora scope: processing training job (${trainLoraCount} available)`)
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'train_lora'), ...subjectConds()))
          .orderBy(jobs.createdAt)
          .limit(1)
      }
    } else {
      // 'all' mode — no job type selected.
      if (pickOrder === 'chronological') {
        // Chronological + no type selected: one true global newest-first pick
        // across every generation type. Without this, 'all' runs a fixed
        // type-priority chain (vid_faceswap → fs → i2v → t2v) with the vid path
        // forced random, so the Chrono toggle was silently ignored unless a
        // concrete type was chosen. train_lora is handled last (as below) so
        // multi-hour trainings still drain after all generation work.
        logger.info(`🕒 all scope: chronological global pick across generation types`)
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), sql`${jobs.jobType} IN ('vid_faceswap', 'fs', 'i2v', 't2v')`, ...subjectConds()))
          .orderBy(desc(jobs.updatedAt))
          .limit(1)
        // If no generation jobs remain, let a queued training drain last.
        if ((!queuedJobs || queuedJobs.length === 0) && trainLoraCount > 0) {
          logger.info(`🎓 Processing LoRA training job (${trainLoraCount} available)`)
          queuedJobs = await db
            .select({
              id: jobs.id,
              jobType: jobs.jobType,
              subjectUuid: jobs.subjectUuid,
              destMediaUuid: jobs.destMediaUuid,
              sourceMediaUuid: jobs.sourceMediaUuid,
              presetId: jobs.presetId,
              parameters: jobs.parameters,
              createdAt: jobs.createdAt,
              updatedAt: jobs.updatedAt
            })
            .from(jobs)
            .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'train_lora'), ...subjectConds()))
            .orderBy(jobs.createdAt)
            .limit(1)
        }
      } else if (testCount > 0) {
        logger.info(`📋 Processing source job (${testCount} available, ${videoCount} video, ${i2vCount} i2v also available)`)
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NULL`, ...subjectConds()))
          .orderBy(desc(jobs.updatedAt))
          .limit(1)
        actualType = 'source'
      } else if (videoCount > 0) {
        logger.info(`🎥 Processing video job (${videoCount} available, ${i2vCount} i2v also available)`)
        const orderBy = sql`RANDOM()`
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'vid_faceswap'), sql`${jobs.sourceMediaUuid} IS NOT NULL`, ...subjectConds()))
          .orderBy(orderBy)
          .limit(1)
        actualType = 'vid'
      } else if (fsCount > 0) {
        logger.info(`🎭 Processing fs job (${fsCount} available, ${i2vCount} i2v, ${t2vCount} t2v also available)`)
        queuedJobs = await pickFsJob(db, pickOrder)
      } else if (i2vCount > 0) {
        queuedJobs = await pickWanJob(db, pickOrder, 'i2v')
      } else if (t2vCount > 0) {
        queuedJobs = await pickWanJob(db, pickOrder, 't2v')
      } else if (trainLoraCount > 0) {
        // Trainings last in 'all' mode: they hold the single GPU slot for
        // hours, so all queued generation work drains first.
        logger.info(`🎓 Processing LoRA training job (${trainLoraCount} available)`)
        queuedJobs = await db
          .select({
            id: jobs.id,
            jobType: jobs.jobType,
            subjectUuid: jobs.subjectUuid,
            destMediaUuid: jobs.destMediaUuid,
            sourceMediaUuid: jobs.sourceMediaUuid,
            presetId: jobs.presetId,
            parameters: jobs.parameters,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'queued'), eq(jobs.jobType, 'train_lora'), ...subjectConds()))
          .orderBy(jobs.createdAt)
          .limit(1)
      }
    }
    } // close: if (!queuedJobs)

    if (!queuedJobs || queuedJobs.length === 0) {
      return {
        success: false,
        message: 'No suitable jobs found',
        skip: true
      }
    }

    const job = queuedJobs[0]
    logger.info(`🚀 Processing ${job.jobType} job ${job.id} in ${continuousMode ? 'continuous' : 'single'} mode`)

    // Get subject and media data for the job
    const [subjectData, destMediaData, sourceMediaData] = await Promise.all([
      job.subjectUuid ? db.select().from(subjects).where(eq(subjects.id, job.subjectUuid)).limit(1) : Promise.resolve([]),
      job.destMediaUuid ? db.select().from(mediaRecords).where(eq(mediaRecords.uuid, job.destMediaUuid)).limit(1) : Promise.resolve([]),
      job.sourceMediaUuid ? db.select().from(mediaRecords).where(eq(mediaRecords.uuid, job.sourceMediaUuid)).limit(1) : Promise.resolve([])
    ])

    if (job.jobType === 'vid_faceswap' && subjectData.length === 0) {
      throw new Error(`Subject not found for job ${job.id}`)
    }

    if (job.destMediaUuid && destMediaData.length === 0) {
      throw new Error(`Destination media not found for job ${job.id}`)
    }

    const formData = new FormData()
    let params = (job.parameters as any) || {}

    // Queued → active snapshot: lock in the preset's current values so the job
    // runs deterministically and the historical record survives later preset
    // edits. Only jobs that reference a preset are snapshotted; others (like
    // vid_faceswap) keep their non-preset parameters as-is.
    let snapshotParams: Record<string, any> | null = null
    if (job.presetId) {
      const presetRow = await db.select().from(jobPresets).where(eq(jobPresets.id, job.presetId)).limit(1)
      if (presetRow.length === 0) {
        throw new Error(`Preset ${job.presetId} no longer exists for job ${job.id}`)
      }
      snapshotParams = buildPresetSnapshot(presetRow[0], params)
      params = snapshotParams
    }

    // Resolve any dynamic {a|b|c} wildcard prompt to its concrete selection NOW,
    // so the worker payload AND the persisted history record the chosen prompt
    // rather than the template. The worker won't re-expand (no braces remain).
    // Each job resolves independently, so bulk/preset jobs each get their own roll.
    {
      let expandedSomething = false
      if (typeof params.prompt === 'string' && params.prompt.includes('{')) {
        params.prompt = expandWildcards(params.prompt)
        expandedSomething = true
      }
      if (typeof params.negative_prompt === 'string' && params.negative_prompt.includes('{')) {
        params.negative_prompt = expandWildcards(params.negative_prompt)
        expandedSomething = true
      }
      // Preset jobs already persist via snapshotParams (=== params). For a
      // preset-LESS job we must force the expanded params to be written back so
      // history shows the selection too.
      if (expandedSomething && !snapshotParams) {
        snapshotParams = params
      }
    }

    let workerUrl: string

    try {
      const { getMediaFileData } = await import('./mediaService')

      if (job.jobType === 'train_lora') {
        // ---- LORA TRAINING (ktrain trainer, not a ComfyUI worker) ----
        workerUrl = process.env.TRAINER_URL || 'http://ktrain:8000'

        const { loraTrainings } = await import('~/server/utils/schema')
        const trainingRows = await db
          .select()
          .from(loraTrainings)
          .where(eq(loraTrainings.jobId, job.id))
          .limit(1)
        if (trainingRows.length === 0) {
          throw new Error(`No lora_trainings row for train_lora job ${job.id}`)
        }
        const training = trainingRows[0]

        // Training needs (nearly) the whole 24 GB. Force-restart the wan
        // worker so its cached models are evicted from VRAM before the
        // deepspeed run starts. Best-effort: if it's already down, fine.
        const wanWorkerUrl = process.env.I2V_WORKER_URL || 'http://comfyui-wan-worker:8000'
        try {
          await fetch(`${wanWorkerUrl}/interrupt`, { method: 'POST' })
          logger.info('🎓 Asked wan worker to restart (VRAM eviction before training)')
        } catch {
          logger.info('🎓 Wan worker unreachable for VRAM eviction (probably already down) - continuing')
        }

        formData.append('job_id', job.id)
        formData.append('run_id', training.id)
        formData.append('lora_name', training.loraName)

        await db
          .update(loraTrainings)
          .set({ status: 'training', startedAt: training.startedAt || new Date(), updatedAt: new Date() })
          .where(eq(loraTrainings.id, training.id))

        logger.info(`🎓 TRAIN_LORA job ${job.id}: run ${training.id} (${training.loraName}) → ${workerUrl}`)

      } else if (job.jobType === 'i2v') {
        // ---- I2V WORKFLOW ----
        workerUrl = process.env.I2V_WORKER_URL || 'http://comfyui-wan-worker:8000'

        formData.append('job_id', job.id)
        formData.append('job_type', 'i2v')
        formData.append('workflow_type', 'i2v')

        // Prompt params
        formData.append('prompt', params.prompt || '')
        formData.append('negative_prompt', params.negative_prompt || 'blurry, distorted, low quality, watermark, text, deformed')
        formData.append('length', (params.length || 81).toString())

        // LoRA params (5 slots)
        for (const slot of [1, 2, 3, 4, 5]) {
          for (const key of ['high', 'low', 'high_strength', 'low_strength']) {
            const paramKey = `lora_${slot}_${key}`
            if (params[paramKey] != null) {
              formData.append(paramKey, params[paramKey].toString())
            }
          }
        }

        // Attach input image
        if (!job.sourceMediaUuid) {
          throw new Error(`No source image specified for i2v job ${job.id}`)
        }
        const inputImageData = await getMediaFileData(job.sourceMediaUuid)
        if (!inputImageData) {
          throw new Error(`Failed to get input image data for ${job.sourceMediaUuid}`)
        }
        const inputImageBlob = new Blob([inputImageData.buffer])
        formData.append('input_image', inputImageBlob, `input_${job.sourceMediaUuid}.jpg`)

        logger.info(`🎬 I2V job ${job.id}: prompt hidden (${(params.prompt || '').length} chars), ${params.length || 81} frames`)

      } else if (job.jobType === 't2v') {
        // ---- T2V WORKFLOW (pure text-to-video, no input image) ----
        workerUrl = process.env.I2V_WORKER_URL || 'http://comfyui-wan-worker:8000'

        formData.append('job_id', job.id)
        formData.append('job_type', 't2v')
        formData.append('workflow_type', 't2v')

        // Prompt params
        formData.append('prompt', params.prompt || '')
        formData.append('negative_prompt', params.negative_prompt || 'blurry, distorted, low quality, watermark, text, deformed')
        formData.append('length', (params.length || 81).toString())
        if (params.width != null) formData.append('width', params.width.toString())
        if (params.height != null) formData.append('height', params.height.toString())
        if (params.steps != null) formData.append('steps', params.steps.toString())
        if (params.cfg != null) formData.append('cfg', params.cfg.toString())
        if (params.seed != null) formData.append('seed', params.seed.toString())

        // LoRA params (5 slots)
        for (const slot of [1, 2, 3, 4, 5]) {
          for (const key of ['high', 'low', 'high_strength', 'low_strength']) {
            const paramKey = `lora_${slot}_${key}`
            if (params[paramKey] != null) {
              formData.append(paramKey, params[paramKey].toString())
            }
          }
        }

        logger.info(`🎬 T2V job ${job.id}: prompt hidden (${(params.prompt || '').length} chars), ${params.length || 81} frames`)

      } else if (job.jobType === 'fs') {
        // ---- FS (single-image ReActor face swap) WORKFLOW ----
        // Runs on the same face-swap worker as vid_faceswap. Swaps the
        // subject's chosen identity face (sourceMediaUuid) onto the dest
        // image (destMediaUuid). Output is written back as a favorited
        // i2v source image by outputs.post.ts.
        workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'

        if (!job.sourceMediaUuid) {
          throw new Error(`No identity face (source_media_uuid) specified for fs job ${job.id}`)
        }
        if (!job.destMediaUuid) {
          throw new Error(`No dest image (dest_media_uuid) specified for fs job ${job.id}`)
        }

        formData.append('job_id', job.id)
        formData.append('job_type', 'fs')
        formData.append('workflow_type', 'fs')
        // Carried through so the worker can echo it back for output linking
        formData.append('source_media_uuid', job.sourceMediaUuid)

        // Identity face -> ReActor node 2
        const fsSourceData = await getMediaFileData(job.sourceMediaUuid)
        if (!fsSourceData) {
          throw new Error(`Failed to get identity face data for ${job.sourceMediaUuid}`)
        }
        formData.append('source_image', new Blob([fsSourceData.buffer]), `source_${job.sourceMediaUuid}.jpg`)

        // Target / dest image -> ReActor node 1
        const fsDestData = await getMediaFileData(job.destMediaUuid)
        if (!fsDestData) {
          throw new Error(`Failed to get dest image data for ${job.destMediaUuid}`)
        }
        formData.append('dest_image', new Blob([fsDestData.buffer]), `dest_${job.destMediaUuid}.jpg`)

        logger.info(`🎭 FS job ${job.id}: face ${job.sourceMediaUuid} → dest image ${job.destMediaUuid}`)

      } else {
        // ---- VID_FACESWAP WORKFLOW ----
        workerUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'

        formData.append('job_id', job.id)
        formData.append('job_type', 'vid_faceswap')
        formData.append('workflow_type', job.sourceMediaUuid ? 'vid' : 'test')
        formData.append('workflow_file', 'vid_faceswap_api.json')

        formData.append('frames_per_batch', (params.frames_per_batch || 15).toString())
        formData.append('skip_seconds', (params.skip_seconds || 0).toString())
        formData.append('video_filename', params.video_filename || 'output')

        formData.append('subject_uuid', job.subjectUuid!)
        if (job.destMediaUuid) {
          formData.append('dest_media_uuid', job.destMediaUuid)
        }
        if (job.sourceMediaUuid) {
          formData.append('source_media_uuid', job.sourceMediaUuid)
        }

        // Download and attach destination video
        if (job.destMediaUuid) {
          const destVideoData = await getMediaFileData(job.destMediaUuid)
          if (!destVideoData) {
            throw new Error(`Failed to get destination video data for ${job.destMediaUuid}`)
          }
          const destVideoBlob = new Blob([destVideoData.buffer])
          formData.append('dest_video', destVideoBlob, `dest_${job.destMediaUuid}.mp4`)

          if (destMediaData.length > 0 && destMediaData[0].duration) {
            formData.append('video_duration', destMediaData[0].duration.toString())
          }
        }

        // Download and attach source image if available
        if (job.sourceMediaUuid && sourceMediaData.length > 0) {
          const sourceImageData = await getMediaFileData(job.sourceMediaUuid)
          if (!sourceImageData) {
            throw new Error(`Failed to get source image data for ${job.sourceMediaUuid}`)
          }
          const sourceImageBlob = new Blob([sourceImageData.buffer])
          formData.append('source_image', sourceImageBlob, `source_${job.sourceMediaUuid}.jpg`)
        } else {
          // For test workflow, we need all subject source images
          const subjectSourceImages = await db
            .select()
            .from(mediaRecords)
            .where(and(eq(mediaRecords.subjectUuid, job.subjectUuid!), eq(mediaRecords.purpose, 'source'), eq(mediaRecords.type, 'image')))
            .orderBy(mediaRecords.createdAt)

          if (subjectSourceImages.length === 0) {
            throw new Error(`No source images found for subject ${job.subjectUuid}`)
          }

          for (let i = 0; i < subjectSourceImages.length; i++) {
            const sourceImage = subjectSourceImages[i]
            const sourceImageData = await getMediaFileData(sourceImage.uuid)
            if (!sourceImageData) {
              throw new Error(`Failed to get subject source image data for ${sourceImage.uuid}`)
            }
            const sourceImageBlob = new Blob([sourceImageData.buffer])
            formData.append(`subject_image_${i}`, sourceImageBlob, `subject_${sourceImage.uuid}.jpg`)
            formData.append(`subject_image_uuid_${i}`, sourceImage.uuid)
            formData.append(`subject_image_created_at_${i}`, sourceImage.createdAt.toISOString())
          }
          formData.append('subject_image_count', subjectSourceImages.length.toString())
        }
      }

      // Send job to worker
      logger.info(`🚀 Sending ${job.jobType} job ${job.id} to ${workerUrl}/process`)

      const workerResponse = await fetch(`${workerUrl}/process`, {
        method: 'POST',
        body: formData
      })

      if (!workerResponse.ok) {
        const errorText = await workerResponse.text()
        throw new Error(`Worker responded with ${workerResponse.status}: ${errorText}`)
      }

      const workerResult = await workerResponse.json()
      logger.info('✅ Worker response:', workerResult)

      // The single-active guard at the top of processNextJob already ensured no
      // other job is active before we dispatched, so we simply promote this job.

      // Now update the current job to active status. Persist the preset
      // snapshot (if any) atomically with the status change so display and
      // worker-restart paths see the same frozen values.
      const activeUpdate: Record<string, any> = {
        status: 'active',
        startedAt: new Date(),
        updatedAt: new Date()
      }
      if (snapshotParams) {
        activeUpdate.parameters = snapshotParams
      }
      await db
        .update(jobs)
        .set(activeUpdate)
        .where(eq(jobs.id, job.id))

      // Broadcast job counts update to WebSocket clients
      try {
        const { updateJobCounts } = await import('./systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        logger.error('Failed to update job counts after job status changes:', error)
      }

      // Job status is already set to active in our cleanup code above

      // We no longer need the immediate health check since we've proactively handled potential zombies

      return {
        success: true,
        job_id: job.id,
        status: 'active',
        worker_response: workerResult,
        message: `Job ${job.id} sent to comfyui-runpod-worker for processing`,
        usedFallback,
        actualType
      }
    } catch (workerError: any) {
      logger.error('❌ Failed to send job to worker:', workerError)

      // Worker container is down / unreachable: every job of this type would
      // fail identically, so DON'T burn this job. Leave it queued (we haven't
      // flipped it to active yet) and signal continuous mode to stop. This is
      // the brake that prevents an OOM'd worker from failing the whole queue.
      if (isWorkerUnreachableError(workerError)) {
        logger.error(`🛑 Worker for ${job.jobType} jobs is unreachable — leaving job ${job.id} queued and signaling stop`)
        return {
          success: false,
          job_id: job.id,
          status: 'queued',
          message: `Worker for '${job.jobType}' jobs is unreachable (${workerError.message}). Stopped to avoid failing the queue — job left queued.`,
          workerUnreachable: true,
          skip: true
        }
      }

      // Set job status to failed on worker error (don't retry automatically)
      await db
        .update(jobs)
        .set({
          status: 'failed',
          startedAt: null,
          updatedAt: new Date(),
          errorMessage: `Failed to send to worker: ${workerError.message}`
        })
        .where(eq(jobs.id, job.id))

      // Update job counts for WebSocket clients after status change
      try {
        const { updateJobCounts } = await import('./systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        logger.error('Failed to update job counts after job failure:', error)
      }

      // CRITICAL FIX: Return failure result instead of throwing error
      // This allows continuous processing to continue without crashing
      return {
        success: false,
        job_id: job.id,
        status: 'failed',
        message: `Job ${job.id} failed to send to worker: ${workerError.message}`
      }
    }
  } catch (error: any) {
    logger.error('❌ Failed to process next job:', error)
    throw new Error(`Failed to process next job: ${error.message || 'Unknown error'}`)
  } finally {
    // Always reset the processing flag
    isCurrentlyProcessing = false
  }
}

// Function to start single job processing with 10-second wait
export async function startSingleJob(sourceType: PreferredSourceType = 'all') {
  // Set to single mode (turn off continuous)
  continuousMode = false
  preferredSourceType = sourceType
  broadcastProcessingStateChange() // Broadcast to WebSocket clients

  logger.info(`▶️ Starting single job processing (sourceType: ${sourceType}) - waiting 10 seconds before checking if idle...`)

  // Update status manager
  updateAutoProcessingStatus('enabled', `Single job processing started (${sourceType}) - waiting 10 seconds`, false)

  try {
    // Wait 10 seconds first
    await new Promise(resolve => setTimeout(resolve, 10000))
    logger.info('⏰ 10 seconds elapsed, now checking if ComfyUI is idle...')

    // Now check if we can process
    const result = await processNextJob()

    updateAutoProcessingStatus('disabled', 'Single job processing completed', false)

    return result
  } catch (error: any) {
    updateAutoProcessingStatus('disabled', 'Single job processing failed', false)
    throw error
  }
}

// Auto-start processing for a freshly-queued LoRA training so creating or
// resuming a run actually kicks it off, without a separate "process one" click.
// No-op when something is already processing: a running continuous loop will
// pick the queued train_lora job up on its own, and we must not flip it out of
// continuous mode. Fire-and-forget from the trainings endpoints — startSingleJob
// waits 10s before dispatching, so callers should NOT await it.
export async function autoStartTraining(): Promise<void> {
  if (continuousMode || isCurrentlyProcessing) {
    logger.info('🎓 auto-start skipped — processing already active; the running loop will pick up the queued train_lora job')
    return
  }
  logger.info('🎓 auto-starting single-job processing for the queued training')
  try {
    await startSingleJob('train_lora')
  } catch (error: any) {
    logger.error('🎓 auto-start training processing failed:', error)
  }
}

// Function to start continuous processing
export function startContinuousProcessing(sourceType: PreferredSourceType = 'all', limit: number | null = null) {
  if (continuousMode) {
    logger.warn(`⚠️ [DEBUG] Cannot start continuous processing - continuousMode is already enabled`)
    return { success: false, message: 'Continuous processing is already active' }
  }

  if (processingInterval) {
    logger.warn('⚠️ [DEBUG] Processing interval already exists, clearing it')
    clearInterval(processingInterval)
  }

  continuousMode = true
  preferredSourceType = sourceType
  jobLimit = limit && limit > 0 ? Math.floor(limit) : null
  jobsProcessedCount = 0
  broadcastProcessingStateChange() // Broadcast to WebSocket clients
  const limitSuffix = jobLimit ? ` (limit: ${jobLimit})` : ''
  logger.info(`🔄 Starting continuous job processing (sourceType: ${sourceType})${limitSuffix}...`)

  // Update status manager
  updateAutoProcessingStatus('enabled', `Continuous processing is running (${sourceType})${limitSuffix}`, true)

  // Set up interval for continuous processing with better logging
  processingInterval = setInterval(async () => {
    if (continuousMode) {
      try {
        // CRITICAL FIX: Check for active jobs BEFORE calling processNextJob
        // This prevents the race condition where we mark active jobs as failed
        const db = getDb()
        const activeJobCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(jobs)
          .where(eq(jobs.status, 'active'))

        const activeCount = activeJobCount[0]?.count || 0

        logger.info(`🔍 [DEBUG] Active job count: ${activeCount}`)

        if (activeCount > 0) {
          // Skip this cycle - there are still active jobs running
          logger.info(`🕐 [DEBUG] Continuous processing: Waiting for ${activeCount} active job(s) to complete`)
          return
        }

        const result = await processNextJob()
        logger.info(`🔍 [DEBUG] processNextJob() returned:`, { success: result.success, message: result.message })

        // Check if we should stop continuous processing due to no jobs remaining
        if (result.noJobsRemaining) {
          logger.info('⏹️ Continuous processing: No jobs remaining - auto-stopping')
          continuousMode = false
          if (processingInterval) {
            clearInterval(processingInterval)
            processingInterval = null
          }
          updateAutoProcessingStatus('disabled', 'Continuous processing stopped - no jobs remaining', false)
          broadcastProcessingStateChange()
          return
        }

        // Worker for the picked job type is down: stop immediately instead of
        // churning the whole queue into failures. The job that hit this was left
        // queued, so nothing is lost — restart the worker and resume.
        if (result.workerUnreachable) {
          logger.error(`🛑 Continuous processing: ${result.message} - auto-stopping`)
          continuousMode = false
          if (processingInterval) {
            clearInterval(processingInterval)
            processingInterval = null
          }
          updateAutoProcessingStatus('disabled', result.message || 'Continuous processing stopped - worker unreachable', false)
          broadcastProcessingStateChange()
          return
        }

        // Log fallback usage
        if (result.usedFallback) {
          logger.info(`🔄 Continuous processing: Used fallback - processed ${result.actualType} job instead of preferred type`)
        }

        // Only log when something interesting happens (not when skipping for idle wait)
        if (result.success) {
          logger.info('🔄 Continuous processing: Job started successfully -', result.message)

          // Increment processed count and check against optional job limit.
          // Counts jobs successfully handed to a worker, which matches the badge's progress semantics.
          jobsProcessedCount += 1
          broadcastProcessingStateChange()

          if (jobLimit !== null && jobsProcessedCount >= jobLimit) {
            logger.info(`⏹️ Continuous processing: Job limit reached (${jobsProcessedCount}/${jobLimit}) - auto-stopping`)
            continuousMode = false
            if (processingInterval) {
              clearInterval(processingInterval)
              processingInterval = null
            }
            updateAutoProcessingStatus('disabled', `Continuous processing stopped - job limit (${jobLimit}) reached`, false)
            broadcastProcessingStateChange()
            return
          }
        } else if (!('skip' in result && result.skip)) {
          logger.info('🔄 Continuous processing: Failed -', result.message)
        } else if (result.message.includes('waiting') || result.message.includes('busy')) {
          // Log idle waiting less frequently to avoid spam
          if (Math.random() < 0.1) {
            // 10% chance to log waiting messages
            logger.info('🕐 Continuous processing:', result.message)
          }
        }
      } catch (error: any) {
        logger.error('❌ Continuous processing error:', error.message)
      }
    }
  }, PROCESSING_INTERVAL)

  return { success: true, message: 'Continuous processing started' }
}

// Function to stop all processing and interrupt running jobs.
// By default uses the worker's /stop route which keeps the container (and loaded models) alive.
// Pass { forceRestart: true } to use /interrupt instead, which restarts the worker container
// for a guaranteed clean slate at the cost of evicting models from VRAM.
export async function stopAllProcessing(opts: { forceRestart?: boolean } = {}) {
  const forceRestart = opts.forceRestart ?? false
  const wasActive = continuousMode

  // Stop any processing - set to single mode (turn off continuous)
  continuousMode = false
  preferredSourceType = 'all' // Reset to default
  isCurrentlyProcessing = false
  jobLimit = null
  jobsProcessedCount = 0
  broadcastProcessingStateChange() // Broadcast to WebSocket clients (after flags cleared so isActive=false)

  if (processingInterval) {
    clearInterval(processingInterval)
    processingInterval = null
  }

  logger.info(
    forceRestart
      ? '⚡ Stopping all processing and force-restarting workers...'
      : '⏹️ Stopping all job processing and interrupting running jobs...'
  )

  // Update status manager
  updateAutoProcessingStatus('disabled', 'All processing stopped by user', false)

  // Requeue any jobs currently marked active so the UI clears and they can be retried.
  // Safe here (unlike reconciliation's disabled Rule 3) because the user explicitly clicked Stop.
  // Clearing parameters drops the snapshot so the preset reference re-takes over
  // — matches the rule "moving back to queued erases hardcoded values".
  const db = getDb()
  const requeued = await db
    .update(jobs)
    .set({ status: 'queued', parameters: {}, updatedAt: new Date() })
    .where(eq(jobs.status, 'active'))
    .returning({ id: jobs.id })

  if (requeued.length > 0) {
    logger.info(`🔁 Requeued ${requeued.length} active job(s) after stop: ${requeued.map(j => j.id).join(', ')}`)
    const { updateJobCounts } = await import('./systemStatusManager')
    await updateJobCounts()
  }

  // /stop = soft cancel + clear queue, models stay loaded
  // /interrupt = same as /stop but follows up with a container restart (clean slate, model reload)
  const endpoint = forceRestart ? 'interrupt' : 'stop'
  const workers = [
    { name: 'faceswap', url: process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000' },
    { name: 'wan', url: process.env.I2V_WORKER_URL || 'http://comfyui-wan-worker:8000' },
    // ktrain trainer: /stop and /interrupt are equivalent (SIGTERM the deepspeed
    // run; it checkpoints every 30 min and resumes on re-dispatch)
    { name: 'trainer', url: process.env.TRAINER_URL || 'http://ktrain:8000' },
  ]

  const results = await Promise.allSettled(
    workers.map(async w => {
      logger.info(`🛑 Sending /${endpoint} request to ${w.name} worker...`)
      const resp = await fetch(`${w.url}/${endpoint}`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000)
      })
      if (!resp.ok) throw new Error(`${w.name} /${endpoint} failed: ${resp.status}`)
      logger.info(`✅ Sent /${endpoint} to ${w.name} worker`)
      return w.name
    })
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected')

  if (failed.length > 0) {
    failed.forEach((f: any) => logger.warn(`⚠️ /${endpoint} failure: ${f.reason?.message}`))
  }

  return {
    success: true,
    message: forceRestart
      ? `Processing stopped and workers restarting. Sent /interrupt to ${succeeded}/${workers.length} workers`
      : `Processing stopped. Sent /stop to ${succeeded}/${workers.length} workers (models preserved)`,
    wasActive,
    forceRestart
  }
}
