import { getDb } from '~/server/utils/database'
import { mediaDuplicatePairs } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

/**
 * Resolve a flagged duplicate pair.
 *
 * Body:
 *   action     'dismiss' — mark "not duplicates" (remembered, never re-flagged)
 *              'delete'   — delete one member via the normal media delete route
 *   deleteUuid required for action='delete'; must be one of the pair's members
 *   cascade    optional passthrough to the delete route (default false)
 *
 * On delete, the media_duplicate_pairs FK is ON DELETE CASCADE, so this pair
 * (and any other pending pair referencing the deleted image) is removed
 * automatically.
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const id = parseInt(getRouterParam(event, 'id') ?? '', 10)
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pair id' })
  }

  const body = await readBody(event).catch(() => ({}))
  const action = body.action

  const rows = await db.select().from(mediaDuplicatePairs).where(eq(mediaDuplicatePairs.id, id)).limit(1)
  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Pair not found' })
  }
  const pair = rows[0]

  if (action === 'dismiss') {
    await db
      .update(mediaDuplicatePairs)
      .set({ status: 'dismissed', resolvedAt: new Date() })
      .where(eq(mediaDuplicatePairs.id, id))
    logger.info(`👌 dedup: dismissed pair ${id} (${pair.mediaA} ~ ${pair.mediaB})`)
    return { success: true, action: 'dismiss', id }
  }

  if (action === 'merge') {
    // Fold one image into the other: reassign every job (and media cross-ref)
    // that points at mergeFromUuid over to mergeToUuid, then delete the
    // now-unreferenced mergeFromUuid. The keeper ends up with the union of
    // both images' jobs.
    const from = body.mergeFromUuid
    const to = body.mergeToUuid
    const members = [pair.mediaA, pair.mediaB]
    if (!members.includes(from) || !members.includes(to) || from === to) {
      throw createError({ statusCode: 400, statusMessage: 'mergeFromUuid/mergeToUuid must be the two distinct pair members' })
    }

    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    let reassignedJobs = 0
    try {
      for (const col of ['source_media_uuid', 'dest_media_uuid', 'output_uuid']) {
        const res = await client.query(`UPDATE jobs SET ${col} = $2 WHERE ${col} = $1`, [from, to])
        reassignedJobs += res.rowCount || 0
      }
      // Keep media self-references consistent so outputs don't dangle.
      for (const col of ['source_media_uuid_ref', 'dest_media_uuid_ref']) {
        await client.query(`UPDATE media_records SET ${col} = $2 WHERE ${col} = $1`, [from, to])
      }
    } finally {
      client.release()
    }

    // Delete the merged-away image (non-cascade — its jobs are now reassigned).
    // The pair row is removed via ON DELETE CASCADE.
    await $fetch(`/api/media/${from}/delete`, { method: 'DELETE' })
    logger.info(`🔀 dedup: merged ${from} → ${to} (reassigned ${reassignedJobs} job refs), pair ${id}`)
    return { success: true, action: 'merge', id, mergedFrom: from, mergedInto: to, reassignedJobs }
  }

  if (action === 'delete') {
    const deleteUuid = body.deleteUuid
    if (deleteUuid !== pair.mediaA && deleteUuid !== pair.mediaB) {
      throw createError({ statusCode: 400, statusMessage: 'deleteUuid must be one of the pair members' })
    }
    const cascade = body.cascade === true
    // Reuse the canonical delete route (handles jobs / output cleanup).
    await $fetch(`/api/media/${deleteUuid}/delete`, {
      method: 'DELETE',
      query: cascade ? { cascade: 'true' } : {},
    })
    logger.info(`🗑️ dedup: deleted ${deleteUuid} resolving pair ${id}`)
    // The pair row is gone via ON DELETE CASCADE; nothing more to update.
    return { success: true, action: 'delete', id, deletedUuid: deleteUuid }
  }

  throw createError({ statusCode: 400, statusMessage: `Unknown action: ${action}` })
})
