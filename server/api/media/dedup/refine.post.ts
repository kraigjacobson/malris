import { getDb } from '~/server/utils/database'
import { mediaRecords, mediaDuplicatePairs } from '~/server/utils/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { logger } from '~/server/utils/logger'
import { retrieveMedia } from '~/server/services/hybridMediaStorage'
import { pixelSignature, pixelDiffPercent } from '~/server/utils/perceptualHash'
import { dedupState } from '~/server/utils/dedupState'

/**
 * Pixel-level refinement of flagged pairs.
 *
 *   action 'compute'  — for each pending pair of `purpose`, decode both images
 *                       and store refined_diff (% pixels that actually differ).
 *                       Background job; poll /api/media/dedup/status.
 *   action 'apply'    — dismiss pending pairs of `purpose` whose refined_diff
 *                       exceeds `threshold` (i.e. they're visibly different,
 *                       not true duplicates).
 *
 * Body: { purpose='dest', action='compute'|'apply', threshold?, recompute? }
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event).catch(() => ({}))
  const purpose: string = typeof body.purpose === 'string' && body.purpose ? body.purpose : 'dest'
  const action: string = body.action === 'apply' ? 'apply' : 'compute'

  const a = alias(mediaRecords, 'a')

  if (action === 'apply') {
    const threshold = Number.isFinite(body.threshold) ? Number(body.threshold) : 5
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    let dismissed = 0
    try {
      const r = await client.query(
        `UPDATE media_duplicate_pairs p
            SET status='dismissed', resolved_at=now()
          FROM media_records a
          WHERE p.media_a = a.uuid AND a.purpose = $1
            AND p.status='pending' AND p.refined_diff IS NOT NULL AND p.refined_diff > $2`,
        [purpose, threshold]
      )
      dismissed = r.rowCount || 0
    } finally {
      client.release()
    }
    logger.info(`✂️ dedup refine apply: dismissed ${dismissed} pair(s) with refined_diff > ${threshold} (${purpose})`)
    return { success: true, action: 'apply', purpose, threshold, dismissed }
  }

  // --- compute ---
  if (dedupState.refining.running) {
    return { success: false, message: 'Refine already running', progress: dedupState.refining }
  }

  const recompute = body.recompute === true
  // When set, dismiss pairs above this % once scoring finishes (one-click flow).
  const autoApply: number | null = Number.isFinite(body.autoApplyThreshold) ? Number(body.autoApplyThreshold) : null
  const pairCond = recompute
    ? and(eq(mediaDuplicatePairs.status, 'pending'), eq(a.purpose, purpose))
    : and(eq(mediaDuplicatePairs.status, 'pending'), eq(a.purpose, purpose), isNull(mediaDuplicatePairs.refinedDiff))

  const pairs = await db
    .select({ id: mediaDuplicatePairs.id, ma: mediaDuplicatePairs.mediaA, mb: mediaDuplicatePairs.mediaB })
    .from(mediaDuplicatePairs)
    .innerJoin(a, eq(mediaDuplicatePairs.mediaA, a.uuid))
    .where(pairCond)

  if (pairs.length === 0) {
    return { success: true, count: 0, message: `Nothing to refine for ${purpose}.` }
  }

  const uniqueUuids = [...new Set(pairs.flatMap((p) => [p.ma, p.mb]))]

  dedupState.refining = {
    running: true,
    processed: 0,
    total: uniqueUuids.length,
    errors: 0,
    startedAt: Date.now(),
    finishedAt: null,
    message: `Refining ${pairs.length} pair(s) over ${uniqueUuids.length} image(s) for ${purpose}`,
    errorSamples: [],
  }
  logger.info(`🔬 dedup: ${dedupState.refining.message}`)

  const PER_IMAGE_TIMEOUT_MS = 30_000
  const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ])

  void (async () => {
    // Decode each unique image to a signature once (images recur across pairs).
    const sigs = new Map<string, Buffer | null>()
    let idx = 0
    const concurrency = 4
    const worker = async () => {
      while (idx < uniqueUuids.length) {
        const uuid = uniqueUuids[idx++]
        await new Promise((r) => setImmediate(r))
        try {
          const bytes = await withTimeout(retrieveMedia(uuid), PER_IMAGE_TIMEOUT_MS, 'retrieveMedia')
          if (!bytes) throw new Error('no decrypted bytes')
          sigs.set(uuid, await withTimeout(pixelSignature(bytes), PER_IMAGE_TIMEOUT_MS, 'pixelSignature'))
        } catch (err) {
          sigs.set(uuid, null)
          dedupState.refining.errors++
          if (dedupState.refining.errorSamples.length < 25) {
            dedupState.refining.errorSamples.push({ uuid, error: err instanceof Error ? err.message : String(err) })
          }
        } finally {
          dedupState.refining.processed++
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()))

    // Score every pair from the cached signatures and persist.
    let scored = 0
    for (const p of pairs) {
      const sa = sigs.get(p.ma)
      const sb = sigs.get(p.mb)
      if (!sa || !sb) continue // a side failed to decode; leave NULL
      const diff = pixelDiffPercent(sa, sb)
      await db.update(mediaDuplicatePairs).set({ refinedDiff: diff }).where(eq(mediaDuplicatePairs.id, p.id))
      scored++
    }

    let autoDismissed = 0
    if (autoApply !== null) {
      const { getDbClient } = await import('~/server/utils/database')
      const client = await getDbClient()
      try {
        const r = await client.query(
          `UPDATE media_duplicate_pairs p
              SET status='dismissed', resolved_at=now()
            FROM media_records a
            WHERE p.media_a = a.uuid AND a.purpose = $1
              AND p.status='pending' AND p.refined_diff IS NOT NULL AND p.refined_diff > $2`,
          [purpose, autoApply]
        )
        autoDismissed = r.rowCount || 0
      } finally {
        client.release()
      }
    }

    dedupState.refining.running = false
    dedupState.refining.finishedAt = Date.now()
    dedupState.refining.message =
      `Refined ${scored}/${pairs.length} pair(s)` +
      (autoApply !== null ? `; dismissed ${autoDismissed} above ${autoApply}%` : '') +
      ` (${dedupState.refining.errors} image errors)`
    logger.info(`🏁 dedup: ${dedupState.refining.message}`)
  })().catch((err) => {
    dedupState.refining.running = false
    logger.error('❌ dedup refine loop crashed:', err)
  })

  return {
    success: true,
    count: pairs.length,
    images: uniqueUuids.length,
    purpose,
    message: `Started refining ${pairs.length} pair(s). Poll /api/media/dedup/status for progress.`,
  }
})
