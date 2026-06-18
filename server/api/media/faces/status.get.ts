import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { sql, eq } from 'drizzle-orm'
import { faceEmbedState } from '~/server/utils/faceEmbedState'

/**
 * Live face-embedding status: background-job progress + DB coverage counts for
 * the utilities UI. `embedded` counts rows actually carrying an embedding;
 * `processed` counts rows attempted (processed - embedded = images with no face).
 */
export default defineEventHandler(async () => {
  const db = getDb()

  const coverage = await db
    .select({
      purpose: mediaRecords.purpose,
      total: sql<number>`count(*)::int`,
      processed: sql<number>`count(${mediaRecords.faceEmbeddedAt})::int`,
      embedded: sql<number>`count(${mediaRecords.faceEmbedding})::int`,
    })
    .from(mediaRecords)
    .where(eq(mediaRecords.type, 'image'))
    .groupBy(mediaRecords.purpose)

  return {
    embedding: faceEmbedState.embedding,
    coverage: coverage.map((c) => ({
      purpose: c.purpose,
      total: c.total,
      processed: c.processed,
      embedded: c.embedded,
    })),
  }
})
