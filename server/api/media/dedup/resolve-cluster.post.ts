import { logger } from '~/server/utils/logger'

/**
 * Resolve a whole duplicate cluster in one action.
 *
 * Body:
 *   action 'merge'   — fold every uuid in mergeUuids into keeperUuid: reassign
 *                      their job refs (source/dest/output) and media cross-refs
 *                      to the keeper, then delete them. One transaction.
 *          'dismiss' — mark every pending pair fully within `uuids` as
 *                      "not duplicates" (remembered, never re-flagged).
 *   keeperUuid  (merge) the image to keep
 *   mergeUuids  (merge) the images to merge away (keeper excluded by caller)
 *   uuids       (dismiss) all cluster member uuids
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const action = body.action

  const { getDbClient } = await import('~/server/utils/database')

  if (action === 'merge') {
    const keeper: string = body.keeperUuid
    const mergeUuids: string[] = Array.isArray(body.mergeUuids)
      ? body.mergeUuids.filter((u: string) => u && u !== keeper)
      : []
    if (!keeper || mergeUuids.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'keeperUuid and a non-empty mergeUuids are required' })
    }

    const client = await getDbClient()
    let reassigned = 0
    try {
      await client.query('BEGIN')
      for (const col of ['source_media_uuid', 'dest_media_uuid', 'output_uuid']) {
        const r = await client.query(`UPDATE jobs SET ${col} = $1 WHERE ${col} = ANY($2::uuid[])`, [keeper, mergeUuids])
        reassigned += r.rowCount || 0
      }
      for (const col of ['source_media_uuid_ref', 'dest_media_uuid_ref']) {
        await client.query(`UPDATE media_records SET ${col} = $1 WHERE ${col} = ANY($2::uuid[])`, [keeper, mergeUuids])
      }
      // Deletes cascade to media_duplicate_pairs, so all of this cluster's
      // pairs that touch a merged image disappear automatically.
      await client.query(`DELETE FROM media_records WHERE uuid = ANY($1::uuid[])`, [mergeUuids])
      await client.query('COMMIT')
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {})
      throw createError({ statusCode: 500, statusMessage: `Cluster merge failed: ${e?.message || e}` })
    } finally {
      client.release()
    }
    logger.info(`🔀 dedup: cluster-merged ${mergeUuids.length} image(s) → ${keeper} (reassigned ${reassigned} job refs)`)
    return { success: true, action: 'merge', keeper, mergedCount: mergeUuids.length, reassignedJobRefs: reassigned }
  }

  if (action === 'dismiss') {
    const uuids: string[] = Array.isArray(body.uuids) ? body.uuids.filter(Boolean) : []
    if (uuids.length < 2) {
      throw createError({ statusCode: 400, statusMessage: 'uuids (>=2 members) required' })
    }
    const client = await getDbClient()
    let dismissed = 0
    try {
      const r = await client.query(
        `UPDATE media_duplicate_pairs SET status='dismissed', resolved_at=now()
         WHERE status='pending' AND media_a = ANY($1::uuid[]) AND media_b = ANY($1::uuid[])`,
        [uuids]
      )
      dismissed = r.rowCount || 0
    } finally {
      client.release()
    }
    logger.info(`👌 dedup: dismissed cluster of ${uuids.length} image(s) (${dismissed} pairs)`)
    return { success: true, action: 'dismiss', dismissedPairs: dismissed }
  }

  throw createError({ statusCode: 400, statusMessage: `Unknown action: ${action}` })
})
