import { getDb } from '~/server/utils/database'
import { mediaRecords, subjects } from '~/server/utils/schema'
import { inArray, eq } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

/**
 * Bulk-reassign a set of media records to a different subject.
 * Body: { media_uuids: string[], subject_uuid: string }
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { media_uuids, subject_uuid } = body || {}

    if (!Array.isArray(media_uuids) || media_uuids.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'media_uuids array is required' })
    }
    if (!subject_uuid || typeof subject_uuid !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'subject_uuid is required' })
    }

    const db = getDb()

    // Verify target subject exists; a missing one would silently no-op the update
    // (subject_uuid is a nullable FK) — better to 404 explicitly.
    const target = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subject_uuid)).limit(1)
    if (target.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Target subject not found' })
    }

    const updated = await db
      .update(mediaRecords)
      .set({ subjectUuid: subject_uuid })
      .where(inArray(mediaRecords.uuid, media_uuids))
      .returning({ uuid: mediaRecords.uuid })

    logger.info(`🔀 Reassigned ${updated.length} media record(s) to subject ${subject_uuid}`)

    return {
      success: true,
      updated: updated.length,
      media_uuids: updated.map(r => r.uuid)
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    logger.error('Failed to reassign media subject:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to reassign media: ${error.message || 'Unknown error'}`
    })
  }
})
