import { getDb } from '~/server/utils/database'
import { mediaRecords, mediaDuplicatePairs } from '~/server/utils/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

/**
 * Group flagged pairs into clusters (connected components) so a whole group of
 * near-identical images can be reviewed and resolved at once instead of pair by
 * pair. Each cluster names a suggested keeper = the member tied to the most
 * jobs (tie-break: rating, then favorite). One cluster per page by default.
 *
 * Query params:
 *   purpose  'dest' (default) | 'source' | ...  (filters by member purpose)
 *   status   'pending' (default) | 'dismissed' | 'resolved'
 *   limit    clusters per page (default 1, max 50)
 *   offset   cluster offset (default 0)
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const q = getQuery(event)
  const purpose = typeof q.purpose === 'string' && q.purpose ? q.purpose : 'dest'
  const status = typeof q.status === 'string' ? q.status : 'pending'
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? '1'), 10) || 1, 1), 50)
  const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0)

  // All pairs of the requested purpose/status (pairs are within-purpose, so
  // filtering on the A-member's purpose is sufficient).
  const a = alias(mediaRecords, 'a')
  const pairRows = await db
    .select({ ma: mediaDuplicatePairs.mediaA, mb: mediaDuplicatePairs.mediaB })
    .from(mediaDuplicatePairs)
    .innerJoin(a, eq(mediaDuplicatePairs.mediaA, a.uuid))
    .where(and(eq(mediaDuplicatePairs.status, status), eq(a.purpose, purpose)))

  // Union-find to build connected components.
  const parent = new Map<string, string>()
  const ensure = (x: string) => {
    if (!parent.has(x)) parent.set(x, x)
  }
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    while (parent.get(x) !== r) {
      const next = parent.get(x)!
      parent.set(x, r)
      x = next
    }
    return r
  }
  const union = (x: string, y: string) => {
    ensure(x)
    ensure(y)
    const rx = find(x)
    const ry = find(y)
    if (rx !== ry) parent.set(rx, ry)
  }
  for (const p of pairRows) union(p.ma, p.mb)

  const comps = new Map<string, string[]>()
  for (const node of parent.keys()) {
    const root = find(node)
    const arr = comps.get(root)
    if (arr) arr.push(node)
    else comps.set(root, [node])
  }

  const allClusters = [...comps.values()].sort((x, y) => y.length - x.length)
  const totalClusters = allClusters.length
  const page = allClusters.slice(offset, offset + limit)

  const memberUuids = [...new Set(page.flat())]
  if (memberUuids.length === 0) {
    return { clusters: [], totalClusters, limit, offset }
  }

  // Member media info.
  const infoRows = await db
    .select({
      uuid: mediaRecords.uuid,
      filename: mediaRecords.filename,
      width: mediaRecords.width,
      height: mediaRecords.height,
      purpose: mediaRecords.purpose,
      rating: mediaRecords.rating,
      favorite: mediaRecords.favorite,
    })
    .from(mediaRecords)
    .where(inArray(mediaRecords.uuid, memberUuids))
  const infoMap = new Map(infoRows.map((r) => [r.uuid, r]))

  // Job counts (jobs referencing each image as source/dest/output).
  const jobCounts = new Map<string, number>()
  const { getDbClient } = await import('~/server/utils/database')
  const client = await getDbClient()
  try {
    const counted = await client.query(
      `SELECT u::text AS uuid,
         (SELECT count(*)::int FROM jobs j
            WHERE j.source_media_uuid = u OR j.dest_media_uuid = u OR j.output_uuid = u) AS cnt
       FROM unnest($1::uuid[]) AS u`,
      [memberUuids]
    )
    for (const row of counted.rows) jobCounts.set(row.uuid, Number(row.cnt))
  } finally {
    client.release()
  }

  const clusters = page.map((members) => {
    const memberInfos = members
      .map((u) => ({ ...infoMap.get(u)!, jobCount: jobCounts.get(u) ?? 0 }))
      .filter((m) => m.uuid)
    // Keeper: most jobs, then highest rating, then favorite, then stable by uuid.
    const keeper = memberInfos.reduce((best, m) => {
      if (m.jobCount !== best.jobCount) return m.jobCount > best.jobCount ? m : best
      const br = best.rating ?? 0
      const mr = m.rating ?? 0
      if (mr !== br) return mr > br ? m : best
      if (m.favorite !== best.favorite) return m.favorite ? m : best
      return m.uuid < best.uuid ? m : best
    }, memberInfos[0])
    return {
      size: memberInfos.length,
      keeperUuid: keeper.uuid,
      members: memberInfos.sort((x, y) => y.jobCount - x.jobCount),
    }
  })

  return { clusters, totalClusters, limit, offset }
})
