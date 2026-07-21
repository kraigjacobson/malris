import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { sql, eq } from 'drizzle-orm'
import { captionState } from '~/server/utils/captionState'

/**
 * Live captioning status: background-job progress + DB coverage counts.
 * `captioned` counts rows carrying a caption; `processed` counts rows attempted.
 */
export default defineEventHandler(async () => {
  const db = getDb()

  const coverage = await db
    .select({
      purpose: mediaRecords.purpose,
      total: sql<number>`count(*)::int`,
      processed: sql<number>`count(${mediaRecords.captionAt})::int`,
      captioned: sql<number>`count(${mediaRecords.caption})::int`,
    })
    .from(mediaRecords)
    .where(eq(mediaRecords.type, 'image'))
    .groupBy(mediaRecords.purpose)

  return {
    captioning: captionState.captioning,
    coverage: coverage.map((c) => ({
      purpose: c.purpose,
      total: c.total,
      processed: c.processed,
      captioned: c.captioned,
    })),
  }
})
