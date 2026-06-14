import { getDb } from '~/server/utils/database'
import { mediaRecords, mediaDuplicatePairs, subjects } from '~/server/utils/schema'
import { eq, and, sql, asc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

/**
 * Paginated feed of flagged duplicate pairs, each joined to both members'
 * media info for side-by-side review.
 *
 * Query params:
 *   status  'pending' (default) | 'dismissed' | 'resolved'
 *   method  optional: 'dhash' | 'phash' | 'tile'
 *   purpose optional: only pairs whose A-member has this purpose
 *   limit   default 50, max 200
 *   offset  default 0
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const q = getQuery(event)

  const status = typeof q.status === 'string' ? q.status : 'pending'
  const method = typeof q.method === 'string' && q.method ? q.method : null
  const purpose = typeof q.purpose === 'string' && q.purpose ? q.purpose : null
  const limit = Math.min(Math.max(parseInt(String(q.limit ?? '50'), 10) || 50, 1), 200)
  const offset = Math.max(parseInt(String(q.offset ?? '0'), 10) || 0, 0)

  const a = alias(mediaRecords, 'a')
  const b = alias(mediaRecords, 'b')
  const sa = alias(subjects, 'sa')

  const conds = [eq(mediaDuplicatePairs.status, status)]
  if (method) conds.push(eq(mediaDuplicatePairs.method, method))
  if (purpose) conds.push(eq(a.purpose, purpose))
  const where = and(...conds)

  const totalRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mediaDuplicatePairs)
    .innerJoin(a, eq(mediaDuplicatePairs.mediaA, a.uuid))
    .where(where)
  const total = totalRow[0]?.n ?? 0

  const rows = await db
    .select({
      id: mediaDuplicatePairs.id,
      method: mediaDuplicatePairs.method,
      distance: mediaDuplicatePairs.distance,
      status: mediaDuplicatePairs.status,
      createdAt: mediaDuplicatePairs.createdAt,
      aUuid: a.uuid,
      aFilename: a.filename,
      aWidth: a.width,
      aHeight: a.height,
      aPurpose: a.purpose,
      aRating: a.rating,
      aFavorite: a.favorite,
      aSubject: sa.name,
      bUuid: b.uuid,
      bFilename: b.filename,
      bWidth: b.width,
      bHeight: b.height,
      bPurpose: b.purpose,
      bRating: b.rating,
      bFavorite: b.favorite,
    })
    .from(mediaDuplicatePairs)
    .innerJoin(a, eq(mediaDuplicatePairs.mediaA, a.uuid))
    .innerJoin(b, eq(mediaDuplicatePairs.mediaB, b.uuid))
    .leftJoin(sa, eq(a.subjectUuid, sa.id))
    .where(where)
    .orderBy(asc(mediaDuplicatePairs.distance), asc(mediaDuplicatePairs.id))
    .limit(limit)
    .offset(offset)

  // How many jobs each pictured image is tied to (as source, dest, or output)
  // — helps decide which duplicate to keep. One query over just the uuids on
  // this page, merged in below.
  const memberUuids = [...new Set(rows.flatMap((r) => [r.aUuid, r.bUuid]))]
  const jobCounts = new Map<string, number>()
  if (memberUuids.length > 0) {
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
  }

  const pairs = rows.map((r) => ({
    id: r.id,
    method: r.method,
    distance: r.distance,
    status: r.status,
    createdAt: r.createdAt,
    subject: r.aSubject ?? null,
    a: {
      uuid: r.aUuid,
      filename: r.aFilename,
      width: r.aWidth,
      height: r.aHeight,
      purpose: r.aPurpose,
      rating: r.aRating,
      favorite: r.aFavorite,
      jobCount: jobCounts.get(r.aUuid) ?? 0,
    },
    b: {
      uuid: r.bUuid,
      filename: r.bFilename,
      width: r.bWidth,
      height: r.bHeight,
      purpose: r.bPurpose,
      rating: r.bRating,
      favorite: r.bFavorite,
      jobCount: jobCounts.get(r.bUuid) ?? 0,
    },
  }))

  return { pairs, total, limit, offset }
})
