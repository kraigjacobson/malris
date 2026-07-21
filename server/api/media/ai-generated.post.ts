/**
 * Bulk-set the AI-provenance flag on a list of media (POST
 * { media_uuids: string[], value: boolean | null }).
 *
 * `ai_generated` is a manual flag (auto-detection was scrapped — see
 * CONCEPT-TRAINING-PLAN.md §5): true = AI, false = real, null = undecided. The
 * media gallery uses this to multiselect and bulk-tag (e.g. mark a Civit batch
 * AI, a Boost2 batch real) or to clear rows back to the undecided to-do bucket.
 */
import { inArray } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event).catch(() => ({}))
    const mediaUuids: string[] = Array.isArray(body?.media_uuids) ? body.media_uuids : []
    const value = body?.value

    if (mediaUuids.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'media_uuids must be a non-empty array of media UUIDs'
      })
    }
    // true = AI, false = real, null = undecided. Anything else is a bad request.
    if (value !== true && value !== false && value !== null) {
      throw createError({
        statusCode: 400,
        statusMessage: 'value must be true (AI), false (real), or null (undecided)'
      })
    }

    const db = getDb()
    const updated = await db
      .update(mediaRecords)
      .set({ aiGenerated: value, updatedAt: new Date() })
      .where(inArray(mediaRecords.uuid, mediaUuids))
      .returning({ uuid: mediaRecords.uuid })

    const label = value === true ? 'AI' : value === false ? 'real' : 'undecided'
    logger.info(`🏷️ ai-generated: set ${updated.length}/${mediaUuids.length} media to ${label}`)

    return {
      success: true,
      count: updated.length,
      requested: mediaUuids.length,
      value,
      message: `Marked ${updated.length} item${updated.length !== 1 ? 's' : ''} as ${label}.`
    }
  } catch (error: any) {
    logger.error('❌ Error in ai-generated bulk update:', error)
    if (error?.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to update AI flag'
    })
  }
})
