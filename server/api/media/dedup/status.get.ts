import { getDb } from '~/server/utils/database'
import { mediaRecords, mediaDuplicatePairs } from '~/server/utils/schema'
import { sql, eq } from 'drizzle-orm'
import { dedupState } from '~/server/utils/dedupState'

/**
 * Live dedup status: background-job progress + DB counts for the utilities UI.
 */
export default defineEventHandler(async () => {
  const db = getDb()

  // Image hashing coverage, grouped by purpose.
  const coverage = await db
    .select({
      purpose: mediaRecords.purpose,
      total: sql<number>`count(*)::int`,
      hashed: sql<number>`count(${mediaRecords.perceptualHashedAt})::int`,
    })
    .from(mediaRecords)
    .where(eq(mediaRecords.type, 'image'))
    .groupBy(mediaRecords.purpose)

  // Pair counts by status.
  const pairCounts = await db
    .select({ status: mediaDuplicatePairs.status, n: sql<number>`count(*)::int` })
    .from(mediaDuplicatePairs)
    .groupBy(mediaDuplicatePairs.status)

  const pairs = { pending: 0, dismissed: 0, resolved: 0 }
  for (const row of pairCounts) {
    if (row.status in pairs) (pairs as any)[row.status] = row.n
  }

  return {
    hashing: dedupState.hashing,
    finding: dedupState.finding,
    refining: dedupState.refining,
    coverage: coverage.map((c) => ({ purpose: c.purpose, total: c.total, hashed: c.hashed })),
    pairs,
  }
})
