import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, isNull, inArray, count } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'
import { retrieveMedia } from '~/server/services/hybridMediaStorage'
import { computeHashes } from '~/server/utils/perceptualHash'
import { dedupState } from '~/server/utils/dedupState'

/**
 * Compute perceptual hashes (dHash / pHash / tile hashes) for images and store
 * them on media_records. Fire-and-forget background job; poll
 * GET /api/media/dedup/status for progress.
 *
 * Body params (all optional):
 *   purposes   string[]  which image purposes to hash. Default ['source'].
 *   force      boolean   re-hash rows that already have perceptual_hashed_at.
 *   limit      number    cap rows processed this run (testing).
 *   batchSize  number    how many images to hash concurrently. Default 4.
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event).catch(() => ({}))

  const purposes: string[] =
    Array.isArray(body.purposes) && body.purposes.length > 0 ? body.purposes.map(String) : ['source']
  const force = body.force === true
  const limit: number | null = Number.isInteger(body.limit) && body.limit > 0 ? body.limit : null
  const concurrency = Math.min(Math.max(Number(body.batchSize) || 4, 1), 16)

  if (dedupState.hashing.running) {
    return { success: false, message: 'Hashing already running', progress: dedupState.hashing }
  }

  // type='image', selected purposes, and (unless force) not yet hashed.
  const predicate = force
    ? and(eq(mediaRecords.type, 'image'), inArray(mediaRecords.purpose, purposes))
    : and(
        eq(mediaRecords.type, 'image'),
        inArray(mediaRecords.purpose, purposes),
        isNull(mediaRecords.perceptualHashedAt)
      )

  const totalRow = await db.select({ count: count() }).from(mediaRecords).where(predicate)
  const totalToHash = totalRow[0]?.count ?? 0

  if (totalToHash === 0) {
    return { success: true, count: 0, message: `Nothing to hash for purposes [${purposes.join(', ')}].` }
  }

  let rows = await db
    .select({ uuid: mediaRecords.uuid })
    .from(mediaRecords)
    .where(predicate)
  if (limit) rows = rows.slice(0, limit)
  const uuids = rows.map((r) => r.uuid)

  // Reset + start progress.
  dedupState.hashing = {
    running: true,
    processed: 0,
    total: uuids.length,
    errors: 0,
    startedAt: Date.now(),
    finishedAt: null,
    message: `Hashing ${uuids.length} image(s) for [${purposes.join(', ')}]${force ? ' (force)' : ''}`,
    errorSamples: [],
  }
  logger.info(`🔍 dedup: ${dedupState.hashing.message}`)

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
      while (idx < uuids.length) {
        const uuid = uuids[idx++]
        // Yield to the event loop each iteration so the HTTP server (status
        // polling, the rest of the app) stays responsive during the batch.
        await new Promise((r) => setImmediate(r))
        try {
          const bytes = await withTimeout(retrieveMedia(uuid), PER_IMAGE_TIMEOUT_MS, 'retrieveMedia')
          if (!bytes) throw new Error('no decrypted bytes')
          const { dhash, phash, tileHashes } = await withTimeout(
            computeHashes(bytes),
            PER_IMAGE_TIMEOUT_MS,
            'computeHashes'
          )
          await db
            .update(mediaRecords)
            .set({ dhash, phash, tileHashes, perceptualHashedAt: new Date() })
            .where(eq(mediaRecords.uuid, uuid))
        } catch (err) {
          dedupState.hashing.errors++
          const msg = err instanceof Error ? err.message : String(err)
          if (dedupState.hashing.errorSamples.length < 25) {
            dedupState.hashing.errorSamples.push({ uuid, error: msg })
          }
          logger.warn(`⚠️ dedup hash failed for ${uuid}: ${msg}`)
        } finally {
          dedupState.hashing.processed++
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    dedupState.hashing.running = false
    dedupState.hashing.finishedAt = Date.now()
    dedupState.hashing.message = `Hashed ${dedupState.hashing.processed - dedupState.hashing.errors}/${uuids.length} (${dedupState.hashing.errors} errors)`
    logger.info(`🏁 dedup: ${dedupState.hashing.message}`)
  })().catch((err) => {
    dedupState.hashing.running = false
    logger.error('❌ dedup hashing loop crashed:', err)
  })

  return {
    success: true,
    count: uuids.length,
    totalToHash,
    purposes,
    message: `Started hashing ${uuids.length} image(s). Poll /api/media/dedup/status for progress.`,
  }
})
