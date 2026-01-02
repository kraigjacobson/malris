import { logger } from '~/server/utils/logger'
import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, sql } from 'drizzle-orm'
import { isRunning } from './start.post'

export default defineEventHandler(async _event => {
  const db = getDb()

  try {
    // Count orphaned output images
    const result = await db
      .select({
        count: sql<number>`count(*)`
      })
      .from(mediaRecords)
      .where(
        and(
          eq(mediaRecords.purpose, 'output'),
          eq(mediaRecords.type, 'image'),
          sql`${mediaRecords.uuid} NOT IN (
            SELECT thumbnail_uuid 
            FROM media_records 
            WHERE thumbnail_uuid IS NOT NULL
          )`,
          sql`${mediaRecords.jobId} IN (
            SELECT id FROM jobs 
            WHERE status IN ('completed', 'failed')
            OR (status = 'queued' AND source_media_uuid IS NOT NULL)
          )`
        )
      )

    const count = Number(result[0]?.count || 0)
    const running = isRunning()

    logger.info(`Found ${count} orphaned output images - Status: ${running ? 'Processing' : 'Idle'}`)

    return {
      success: true,
      count,
      isRunning: running
    }
  } catch (error) {
    logger.error('Error counting orphaned images:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to count orphaned images'
    })
  }
})
