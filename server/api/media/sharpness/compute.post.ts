import { getDb } from '~/server/utils/database'
import { mediaRecords, subjects } from '~/server/utils/schema'
import { eq, and, isNull, inArray, count, ilike } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'
import { retrieveMedia } from '~/server/services/hybridMediaStorage'
import { computeSharpness } from '~/server/utils/imageSharpness'
import { extractSampleFrames } from '~/server/utils/videoFrames'
import { sharpnessState } from '~/server/utils/sharpnessState'

// Video sharpness = MEDIAN over evenly-sampled frames (outlier-proof vs one bad
// frame). Falls back to 0 if no frame decodes.
function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
async function videoSharpness(videoBuffer: Buffer): Promise<number> {
  const frames = await extractSampleFrames(videoBuffer, 3)
  if (frames.length === 0) return 0
  const scores = (await Promise.all(frames.map((f) => computeSharpness(f)))).filter((s) => s > 0)
  return median(scores)
}

/**
 * Compute + store the sharpness metric for images (see imageSharpness.ts).
 * Fire-and-forget background job; poll GET /api/media/sharpness/status.
 *
 * Body params (all optional):
 *   subject_uuid  string    scope to one subject by id.
 *   subject_name  string    scope to one subject by (case-insensitive) name.
 *   purposes      string[]  which image purposes to score. Default ['source'].
 *   force         boolean   re-score rows that already have sharpness_at.
 *   limit         number    cap rows processed this run.
 *   batchSize     number    images scored concurrently. Default 4.
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event).catch(() => ({}))

  const purposes: string[] =
    Array.isArray(body.purposes) && body.purposes.length > 0 ? body.purposes.map(String) : ['source']
  const force = body.force === true
  const limit: number | null = Number.isInteger(body.limit) && body.limit > 0 ? body.limit : null
  const concurrency = Math.min(Math.max(Number(body.batchSize) || 4, 1), 16)

  if (sharpnessState.scoring.running) {
    return { success: false, message: 'Sharpness scoring already running', progress: sharpnessState.scoring }
  }

  // Optional subject scope: explicit uuid, or resolve a (case-insensitive) name.
  let subjectUuid: string | null = typeof body.subject_uuid === 'string' ? body.subject_uuid : null
  if (!subjectUuid && typeof body.subject_name === 'string' && body.subject_name.trim()) {
    const match = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(ilike(subjects.name, body.subject_name.trim()))
      .limit(1)
    if (match.length === 0) {
      return { success: false, message: `No subject named "${body.subject_name}"` }
    }
    subjectUuid = match[0].id
  }

  const filters = [inArray(mediaRecords.type, ['image', 'video']), inArray(mediaRecords.purpose, purposes)]
  if (subjectUuid) filters.push(eq(mediaRecords.subjectUuid, subjectUuid))
  // Only genuine subject uploads — a 'source' row with a job_id is a generated
  // image (e.g. a face-swap output stored back as an i2v source), not a real
  // reference photo; the training picker never uses those, so don't score them.
  filters.push(isNull(mediaRecords.jobId))
  if (!force) filters.push(isNull(mediaRecords.sharpnessAt))
  const predicate = and(...filters)

  const totalRow = await db.select({ count: count() }).from(mediaRecords).where(predicate)
  const totalToScore = totalRow[0]?.count ?? 0
  if (totalToScore === 0) {
    return { success: true, count: 0, message: `Nothing to score for [${purposes.join(', ')}]${subjectUuid ? ' (scoped)' : ''}.` }
  }

  let rows = await db.select({ uuid: mediaRecords.uuid, type: mediaRecords.type }).from(mediaRecords).where(predicate)
  if (limit) rows = rows.slice(0, limit)
  const items = rows

  sharpnessState.scoring = {
    running: true,
    processed: 0,
    total: items.length,
    errors: 0,
    startedAt: Date.now(),
    finishedAt: null,
    message: `Scoring ${items.length} item(s)${subjectUuid ? ' for subject' : ''}${force ? ' (force)' : ''}`,
    errorSamples: [],
  }
  logger.info(`✨ sharpness: ${sharpnessState.scoring.message}`)

  // Per-image hard timeout so one stuck decrypt/decode can't wedge a worker.
  const PER_IMAGE_TIMEOUT_MS = 30_000
  const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ])

  // Fire-and-forget; bounded-concurrency worker pool.
  void (async () => {
    let idx = 0
    const worker = async () => {
      while (idx < items.length) {
        const { uuid, type } = items[idx++]
        // Yield each iteration so the HTTP server stays responsive.
        await new Promise((r) => setImmediate(r))
        try {
          const bytes = await withTimeout(retrieveMedia(uuid), PER_IMAGE_TIMEOUT_MS, 'retrieveMedia')
          if (!bytes) throw new Error('no decrypted bytes')
          const sharpness = await withTimeout(
            type === 'video' ? videoSharpness(bytes) : computeSharpness(bytes),
            PER_IMAGE_TIMEOUT_MS,
            'computeSharpness'
          )
          await db
            .update(mediaRecords)
            .set({ sharpness, sharpnessAt: new Date() })
            .where(eq(mediaRecords.uuid, uuid))
        } catch (err) {
          sharpnessState.scoring.errors++
          const msg = err instanceof Error ? err.message : String(err)
          if (sharpnessState.scoring.errorSamples.length < 25) {
            sharpnessState.scoring.errorSamples.push({ uuid, error: msg })
          }
          logger.warn(`⚠️ sharpness failed for ${uuid}: ${msg}`)
        } finally {
          sharpnessState.scoring.processed++
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    sharpnessState.scoring.running = false
    sharpnessState.scoring.finishedAt = Date.now()
    sharpnessState.scoring.message = `Scored ${sharpnessState.scoring.processed - sharpnessState.scoring.errors}/${items.length} (${sharpnessState.scoring.errors} errors)`
    logger.info(`🏁 sharpness: ${sharpnessState.scoring.message}`)
  })().catch((err) => {
    sharpnessState.scoring.running = false
    logger.error('❌ sharpness scoring loop crashed:', err)
  })

  return {
    success: true,
    count: uuids.length,
    totalToScore,
    purposes,
    subjectScoped: !!subjectUuid,
    message: `Started scoring ${uuids.length} image(s). Poll /api/media/sharpness/status for progress.`,
  }
})
