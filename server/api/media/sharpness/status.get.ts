import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { sql, eq } from 'drizzle-orm'
import { sharpnessState } from '~/server/utils/sharpnessState'

/**
 * Live sharpness-scoring status: background-job progress + DB coverage counts.
 * `scored` counts rows that carry a sharpness value; `processed` counts rows
 * attempted (processed - scored = images that failed to decode).
 */
export default defineEventHandler(async () => {
  const db = getDb()

  const coverage = await db
    .select({
      purpose: mediaRecords.purpose,
      total: sql<number>`count(*)::int`,
      processed: sql<number>`count(${mediaRecords.sharpnessAt})::int`,
      scored: sql<number>`count(${mediaRecords.sharpness})::int`,
    })
    .from(mediaRecords)
    .where(eq(mediaRecords.type, 'image'))
    .groupBy(mediaRecords.purpose)

  return {
    scoring: sharpnessState.scoring,
    coverage: coverage.map((c) => ({
      purpose: c.purpose,
      total: c.total,
      processed: c.processed,
      scored: c.scored,
    })),
  }
})
