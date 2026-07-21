import { getDb } from '~/server/utils/database'
import { mediaRecords, subjects } from '~/server/utils/schema'
import { eq, and, isNull, inArray, count, ilike } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'
import { retrieveMedia } from '~/server/services/hybridMediaStorage'
import { tagBatch, wd14Healthy, WD14_WORKER_URL } from '~/server/utils/imageWd14'
import { extractMiddleFrame } from '~/server/utils/videoFrames'
import { wd14State } from '~/server/utils/wd14State'

/**
 * Re-tag images with the FULL WD14 tag set via the standalone wd14-tagger
 * sidecar (see imageWd14.ts) and overwrite media_records.tags. The in-app
 * tagger allowlists tags down to a small vocabulary; the concept tag-search
 * needs the complete set. Fire-and-forget; poll GET /api/media/full-tag/status.
 *
 * Body params (all optional):
 *   subject_uuid  string    scope to one subject by id.
 *   subject_name  string    scope to one subject by (case-insensitive) name.
 *   purposes      string[]  which image purposes to full-tag. Default ['dest'].
 *   force         boolean   re-tag rows that already have tags_full_at.
 *   limit         number    cap rows processed this run.
 *   chunkSize     number    images per tagger request. Default 8.
 *   general_threshold / character_threshold  number  override tag cutoffs.
 */
export default defineEventHandler(async event => {
  const db = getDb()
  const body = await readBody(event).catch(() => ({}))

  const purposes: string[] =
    Array.isArray(body.purposes) && body.purposes.length > 0 ? body.purposes.map(String) : ['dest']
  const force = body.force === true
  const limit: number | null = Number.isInteger(body.limit) && body.limit > 0 ? body.limit : null
  const chunkSize = Math.min(Math.max(Number(body.chunkSize) || 8, 1), 32)
  const generalThreshold = typeof body.general_threshold === 'number' ? body.general_threshold : undefined
  const characterThreshold = typeof body.character_threshold === 'number' ? body.character_threshold : undefined

  if (wd14State.tagging.running) {
    return { success: false, message: 'Full-tagging already running', progress: wd14State.tagging }
  }

  if (!(await wd14Healthy())) {
    return {
      success: false,
      message: `WD14 tagger not reachable at ${WD14_WORKER_URL}. Start it: podman compose --profile analyze up -d wd14-tagger`,
    }
  }

  // Optional subject scope: explicit uuid, or resolve a (case-insensitive) name.
  let subjectUuid: string | null = typeof body.subject_uuid === 'string' ? body.subject_uuid : null
  if (!subjectUuid && typeof body.subject_name === 'string' && body.subject_name.trim()) {
    const match = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(ilike(subjects.name, body.subject_name.trim()))
      .limit(1)
    if (match.length === 0) {
      return { success: false, message: `No subject named "${body.subject_name}"` }
    }
    subjectUuid = match[0].id
  }

  const filters = [inArray(mediaRecords.type, ['image', 'video']), inArray(mediaRecords.purpose, purposes)]
  if (subjectUuid) filters.push(eq(mediaRecords.subjectUuid, subjectUuid))
  if (!force) filters.push(isNull(mediaRecords.tagsFullAt))
  const predicate = and(...filters)

  const totalRow = await db.select({ count: count() }).from(mediaRecords).where(predicate)
  const totalToTag = totalRow[0]?.count ?? 0
  if (totalToTag === 0) {
    return { success: true, count: 0, message: `Nothing to full-tag for [${purposes.join(', ')}]${subjectUuid ? ' (scoped)' : ''}.` }
  }

  let rows = await db.select({ uuid: mediaRecords.uuid, type: mediaRecords.type }).from(mediaRecords).where(predicate)
  if (limit) rows = rows.slice(0, limit)
  const uuids = rows.map(r => r.uuid)
  const typeByUuid = new Map(rows.map(r => [r.uuid, r.type]))

  wd14State.tagging = {
    running: true,
    processed: 0,
    total: uuids.length,
    errors: 0,
    startedAt: Date.now(),
    finishedAt: null,
    message: `Full-tagging ${uuids.length} image(s)${subjectUuid ? ' for subject' : ''}${force ? ' (force)' : ''} [${purposes.join(', ')}]`,
    errorSamples: [],
  }
  logger.info(`🏷️ full-tag: ${wd14State.tagging.message}`)

  // Fire-and-forget. The tagger runs on one GPU, so feed it sequential chunks.
  void (async () => {
    const recordError = (uuid: string, msg: string) => {
      wd14State.tagging.errors++
      if (wd14State.tagging.errorSamples.length < 25) {
        wd14State.tagging.errorSamples.push({ uuid, error: msg })
      }
    }

    for (let i = 0; i < uuids.length; i += chunkSize) {
      const chunk = uuids.slice(i, i + chunkSize)
      const images: Record<string, string> = {}
      const readFailed: string[] = []
      await Promise.all(
        chunk.map(async uuid => {
          try {
            const bytes = await retrieveMedia(uuid)
            if (!bytes) throw new Error('no decrypted bytes')
            // Videos: tag a middle frame (the tagger is image-only).
            let frame: Buffer = bytes
            if (typeByUuid.get(uuid) === 'video') {
              const f = await extractMiddleFrame(bytes)
              if (!f) throw new Error('no frame extracted')
              frame = f
            }
            images[uuid] = frame.toString('base64')
          } catch (err) {
            readFailed.push(uuid)
            recordError(uuid, err instanceof Error ? err.message : String(err))
          }
        })
      )
      for (const _uuid of readFailed) wd14State.tagging.processed++

      const readable = Object.keys(images)
      if (readable.length === 0) continue

      try {
        const { results, errors } = await tagBatch(images, { generalThreshold, characterThreshold })
        for (const uuid of readable) {
          const item = results[uuid]
          if (item && Array.isArray(item.tags)) {
            // Overwrite with the full tag set. Store the WD14 rating alongside so
            // the concept picker / gallery can surface NSFW level without a
            // separate lookup; existing consumers read tags.tags unchanged.
            await db
              .update(mediaRecords)
              .set({
                tags: { tags: item.tags, rating: item.top_rating || undefined, wd14: true },
                tagsFullAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(mediaRecords.uuid, uuid))
          } else {
            recordError(uuid, errors[uuid] || 'empty tags')
          }
          wd14State.tagging.processed++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        for (const uuid of readable) {
          recordError(uuid, msg)
          wd14State.tagging.processed++
        }
        logger.warn(`⚠️ full-tag chunk failed: ${msg}`)
      }
    }

    wd14State.tagging.running = false
    wd14State.tagging.finishedAt = Date.now()
    wd14State.tagging.message = `Full-tagged ${wd14State.tagging.processed - wd14State.tagging.errors}/${uuids.length} (${wd14State.tagging.errors} errors)`
    logger.info(`🏁 full-tag: ${wd14State.tagging.message}`)
  })().catch(err => {
    wd14State.tagging.running = false
    logger.error('❌ full-tag loop crashed:', err)
  })

  return {
    success: true,
    count: uuids.length,
    totalToTag,
    purposes,
    subjectScoped: !!subjectUuid,
    message: `Started full-tagging ${uuids.length} image(s). Poll /api/media/full-tag/status for progress.`,
  }
})
