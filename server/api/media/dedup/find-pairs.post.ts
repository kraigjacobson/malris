import { getDb } from '~/server/utils/database'
import { mediaRecords, mediaDuplicatePairs } from '~/server/utils/schema'
import { eq, and, isNotNull, inArray } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'
import { hammingDistanceBuf, tileMatchCountBuf, parseTileHashes } from '~/server/utils/perceptualHash'
import { dedupState } from '~/server/utils/dedupState'

// Tile/crop matching is only TRUSTWORTHY on small, constrained groups (e.g.
// within-subject). On a large unconstrained group of visually-similar images
// (e.g. the whole dest library — all portraits) the 4-of-16-tile threshold
// matches unrelated photos that merely share composition, producing tens of
// thousands of false positives. So we cap tile to groups below this size;
// larger groups get whole-image dHash/pHash only. Realistic within-subject
// groups are well under this; whole-library sweeps (1000s) are excluded.
// (Pre-parsed tile buffers + event-loop yielding below keep the allowed range
// fast and non-blocking.)
const TILE_GROUP_LIMIT = 1500

interface Row {
  uuid: string
  subjectUuid: string | null
  purpose: string
  dhash: Buffer
  phash: Buffer | null
  tileBufs: Buffer[] | null
}

interface FoundPair {
  a: string
  b: string
  method: string
  distance: number
}

/**
 * Compare perceptual hashes and write flagged near-duplicate pairs to
 * media_duplicate_pairs for human review. Fire-and-forget; poll
 * GET /api/media/dedup/status for progress.
 *
 * Body params (all optional):
 *   purposes          string[]  image purposes to compare. Default ['source'].
 *   withinSubject     boolean   only compare images sharing a subject. Default true.
 *   crossPurpose      boolean   compare across purposes too. Default false.
 *   methods           string[]  subset of ['dhash','phash','tile']. Default all.
 *   dhashMaxDistance  number    max Hamming distance to flag (dhash). Default 8.
 *   phashMaxDistance  number    max Hamming distance to flag (phash). Default 8.
 *   tileMinMatches    number    min matching tiles to flag a crop. Default 4.
 *   tileTolerance     number    per-tile Hamming tolerance. Default 10.
 *   minWidth          number    skip images narrower than this.
 *   minHeight         number    skip images shorter than this.
 *   replaceExisting   boolean   delete existing 'pending' pairs first. Default false.
 *   maxPairs          number    safety cap on pairs created this run.
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event).catch(() => ({}))

  const purposes: string[] =
    Array.isArray(body.purposes) && body.purposes.length > 0 ? body.purposes.map(String) : ['source']
  const withinSubject = body.withinSubject !== false // default true
  const crossPurpose = body.crossPurpose === true // default false
  const allMethods = ['dhash', 'phash', 'tile']
  const methods: string[] =
    Array.isArray(body.methods) && body.methods.length > 0
      ? body.methods.map(String).filter((m: string) => allMethods.includes(m))
      : allMethods
  const dhashMax = Number.isFinite(body.dhashMaxDistance) ? Number(body.dhashMaxDistance) : 8
  const phashMax = Number.isFinite(body.phashMaxDistance) ? Number(body.phashMaxDistance) : 8
  const tileMinMatches = Number.isFinite(body.tileMinMatches) ? Number(body.tileMinMatches) : 4
  const tileTolerance = Number.isFinite(body.tileTolerance) ? Number(body.tileTolerance) : 10
  const minWidth = Number.isFinite(body.minWidth) ? Number(body.minWidth) : 0
  const minHeight = Number.isFinite(body.minHeight) ? Number(body.minHeight) : 0
  const replaceExisting = body.replaceExisting === true
  const maxPairs: number | null = Number.isInteger(body.maxPairs) && body.maxPairs > 0 ? body.maxPairs : null

  if (dedupState.finding.running) {
    return { success: false, message: 'Pair-finding already running', progress: dedupState.finding }
  }

  // Load all hashed candidate rows.
  const raw = await db
    .select({
      uuid: mediaRecords.uuid,
      subjectUuid: mediaRecords.subjectUuid,
      purpose: mediaRecords.purpose,
      width: mediaRecords.width,
      height: mediaRecords.height,
      dhash: mediaRecords.dhash,
      phash: mediaRecords.phash,
      tileHashes: mediaRecords.tileHashes,
    })
    .from(mediaRecords)
    .where(
      and(
        eq(mediaRecords.type, 'image'),
        inArray(mediaRecords.purpose, purposes),
        isNotNull(mediaRecords.dhash)
      )
    )

  const rows: Row[] = raw
    .filter((r) => (minWidth ? (r.width ?? 0) >= minWidth : true) && (minHeight ? (r.height ?? 0) >= minHeight : true))
    .map((r) => ({
      uuid: r.uuid,
      subjectUuid: r.subjectUuid,
      purpose: r.purpose,
      dhash: r.dhash as Buffer,
      phash: (r.phash as Buffer) ?? null,
      tileBufs: parseTileHashes(r.tileHashes as string[] | null),
    }))

  if (rows.length < 2) {
    return { success: true, found: 0, message: 'Need at least 2 hashed images to compare.' }
  }

  // Group rows so we only compare within the same scope.
  let skippedNoSubject = 0
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    if (withinSubject && !r.subjectUuid) {
      skippedNoSubject++
      continue
    }
    const keyParts: string[] = []
    if (withinSubject) keyParts.push(`s:${r.subjectUuid}`)
    if (!crossPurpose) keyParts.push(`p:${r.purpose}`)
    const key = keyParts.length ? keyParts.join('|') : 'all'
    const g = groups.get(key)
    if (g) g.push(r)
    else groups.set(key, [r])
  }

  dedupState.finding = {
    running: true,
    processed: 0,
    total: groups.size,
    errors: 0,
    startedAt: Date.now(),
    finishedAt: null,
    message: `Comparing ${rows.length} image(s) across ${groups.size} group(s)`,
  }
  logger.info(
    `🔎 dedup find-pairs: rows=${rows.length} groups=${groups.size} withinSubject=${withinSubject} ` +
      `crossPurpose=${crossPurpose} methods=[${methods.join(',')}] skippedNoSubject=${skippedNoSubject}`
  )

  void (async () => {
    try {
      if (replaceExisting) {
        await db.delete(mediaDuplicatePairs).where(eq(mediaDuplicatePairs.status, 'pending'))
      }

      const useDhash = methods.includes('dhash')
      const usePhash = methods.includes('phash')
      const useTile = methods.includes('tile')
      const seen = new Set<string>() // ordered "a|b" to dedupe across nothing (groups disjoint) but safe
      const found: FoundPair[] = []
      let tileSkippedGroups = 0

      outer: for (const [, group] of groups) {
        const tileForGroup = useTile && group.length <= TILE_GROUP_LIMIT
        if (useTile && group.length > TILE_GROUP_LIMIT) tileSkippedGroups++

        for (let i = 0; i < group.length; i++) {
          // Yield periodically so a big whole-library group can't block the
          // event loop (status polling, the rest of the app) while comparing.
          if ((i & 15) === 0) await new Promise((r) => setImmediate(r))
          for (let j = i + 1; j < group.length; j++) {
            const ra = group[i]
            const rb = group[j]

            const dhashDist = useDhash ? hammingDistanceBuf(ra.dhash, rb.dhash) : Infinity
            const phashDist = usePhash && ra.phash && rb.phash ? hammingDistanceBuf(ra.phash, rb.phash) : Infinity
            const tiles =
              tileForGroup && ra.tileBufs && rb.tileBufs
                ? tileMatchCountBuf(ra.tileBufs, rb.tileBufs, tileTolerance)
                : 0

            // Pick the highest-confidence method that fired: phash > dhash > tile.
            let method: string | null = null
            let distance = 0
            if (usePhash && phashDist <= phashMax) {
              method = 'phash'
              distance = phashDist
            } else if (useDhash && dhashDist <= dhashMax) {
              method = 'dhash'
              distance = dhashDist
            } else if (tileForGroup && tiles >= tileMinMatches) {
              method = 'tile'
              distance = tiles
            }
            if (!method) continue

            const [a, b] = ra.uuid < rb.uuid ? [ra.uuid, rb.uuid] : [rb.uuid, ra.uuid]
            const k = `${a}|${b}`
            if (seen.has(k)) continue
            seen.add(k)
            found.push({ a, b, method, distance })

            if (maxPairs && found.length >= maxPairs) {
              logger.warn(`⚠️ dedup find-pairs: hit maxPairs=${maxPairs}, stopping early`)
              break outer
            }
          }
        }
        dedupState.finding.processed++
      }

      // Insert flagged pairs, never clobbering dismissed/resolved ones.
      let inserted = 0
      const CHUNK = 500
      for (let i = 0; i < found.length; i += CHUNK) {
        const chunk = found.slice(i, i + CHUNK).map((p) => ({
          mediaA: p.a,
          mediaB: p.b,
          method: p.method,
          distance: p.distance,
          status: 'pending',
        }))
        const res = await db.insert(mediaDuplicatePairs).values(chunk).onConflictDoNothing()
        inserted += (res as any)?.rowCount ?? chunk.length
      }

      dedupState.finding.processed = groups.size
      dedupState.finding.running = false
      dedupState.finding.finishedAt = Date.now()
      dedupState.finding.message =
        `Flagged ${found.length} pair(s)` +
        (tileSkippedGroups ? `; tile skipped on ${tileSkippedGroups} oversized group(s)` : '') +
        (skippedNoSubject ? `; skipped ${skippedNoSubject} image(s) with no subject` : '')
      logger.info(`🏁 dedup find-pairs: ${dedupState.finding.message} (inserted=${inserted})`)
    } catch (err) {
      dedupState.finding.running = false
      logger.error('❌ dedup find-pairs loop crashed:', err)
    }
  })().catch((err) => {
    dedupState.finding.running = false
    logger.error('❌ dedup find-pairs outer crash:', err)
  })

  return {
    success: true,
    comparing: rows.length,
    groups: groups.size,
    skippedNoSubject,
    message: `Started comparison of ${rows.length} image(s). Poll /api/media/dedup/status for progress.`,
  }
})
