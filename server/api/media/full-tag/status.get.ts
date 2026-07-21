import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { sql, eq } from 'drizzle-orm'
import { wd14State } from '~/server/utils/wd14State'

/**
 * Live full-tag status: background-job progress + DB coverage counts.
 * `fullTagged` counts rows carrying the full WD14 tag set (tags_full_at set).
 */
export default defineEventHandler(async () => {
  const db = getDb()

  const coverage = await db
    .select({
      purpose: mediaRecords.purpose,
      total: sql<number>`count(*)::int`,
      fullTagged: sql<number>`count(${mediaRecords.tagsFullAt})::int`,
    })
    .from(mediaRecords)
    .where(eq(mediaRecords.type, 'image'))
    .groupBy(mediaRecords.purpose)

  return {
    tagging: wd14State.tagging,
    coverage: coverage.map(c => ({
      purpose: c.purpose,
      total: c.total,
      fullTagged: c.fullTagged,
    })),
  }
})
