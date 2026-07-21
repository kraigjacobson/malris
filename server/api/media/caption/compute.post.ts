import { getDb } from '~/server/utils/database'
import { mediaRecords, subjects } from '~/server/utils/schema'
import { eq, and, isNull, inArray, count, ilike } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'
import { retrieveMedia } from '~/server/services/hybridMediaStorage'
import { captionBatch, captionerHealthy, CAPTION_WORKER_URL } from '~/server/utils/imageCaption'
import { captionState } from '~/server/utils/captionState'

/**
 * Caption images with the Florence-2 sidecar and store the prose on
 * media_records (see imageCaption.ts). Fire-and-forget; poll
 * GET /api/media/caption/status.
 *
 * Body params (all optional):
 *   subject_uuid  string    scope to one subject by id.
 *   subject_name  string    scope to one subject by (case-insensitive) name.
 *   purposes      string[]  which image purposes to caption. Default ['source'].
 *   task          string    florence task: more_detailed_caption (default) |
 *                           detailed_caption | caption.
 *   force         boolean   re-caption rows that already have caption_at.
 *   limit         number    cap rows processed this run.
 *   chunkSize     number    images per captioner request. Default 4.
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event).catch(() => ({}))

  const purposes: string[] =
    Array.isArray(body.purposes) && body.purposes.length > 0 ? body.purposes.map(String) : ['source']
  const task = typeof body.task === 'string' ? body.task : 'more_detailed_caption'
  const force = body.force === true
  const limit: number | null = Number.isInteger(body.limit) && body.limit > 0 ? body.limit : null
  const chunkSize = Math.min(Math.max(Number(body.chunkSize) || 4, 1), 16)

  if (captionState.captioning.running) {
    return { success: false, message: 'Captioning already running', progress: captionState.captioning }
  }

  if (!(await captionerHealthy())) {
    return {
      success: false,
      message: `Captioner not reachable at ${CAPTION_WORKER_URL}. Start it: podman compose --profile caption up -d florence-captioner`,
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

  const filters = [eq(mediaRecords.type, 'image'), inArray(mediaRecords.purpose, purposes)]
  if (subjectUuid) filters.push(eq(mediaRecords.subjectUuid, subjectUuid))
  // Only genuine subject uploads — a 'source' row with a job_id is a generated
  // image (e.g. a face-swap output stored back as an i2v source), not a real
  // reference photo, and must not be treated as a training image.
  filters.push(isNull(mediaRecords.jobId))
  if (!force) filters.push(isNull(mediaRecords.captionAt))
  const predicate = and(...filters)

  const totalRow = await db.select({ count: count() }).from(mediaRecords).where(predicate)
  const totalToCaption = totalRow[0]?.count ?? 0
  if (totalToCaption === 0) {
    return { success: true, count: 0, message: `Nothing to caption for [${purposes.join(', ')}]${subjectUuid ? ' (scoped)' : ''}.` }
  }

  let rows = await db.select({ uuid: mediaRecords.uuid }).from(mediaRecords).where(predicate)
  if (limit) rows = rows.slice(0, limit)
  const uuids = rows.map((r) => r.uuid)

  captionState.captioning = {
    running: true,
    processed: 0,
    total: uuids.length,
    errors: 0,
    startedAt: Date.now(),
    finishedAt: null,
    message: `Captioning ${uuids.length} image(s)${subjectUuid ? ' for subject' : ''}${force ? ' (force)' : ''} [${task}]`,
    errorSamples: [],
  }
  logger.info(`📝 caption: ${captionState.captioning.message}`)

  // Fire-and-forget. The captioner processes on one GPU, so we feed it
  // sequential chunks (its own throughput is the bottleneck) rather than
  // hammering it concurrently.
  void (async () => {
    const recordError = (uuid: string, msg: string) => {
      captionState.captioning.errors++
      if (captionState.captioning.errorSamples.length < 25) {
        captionState.captioning.errorSamples.push({ uuid, error: msg })
      }
    }

    for (let i = 0; i < uuids.length; i += chunkSize) {
      const chunk = uuids.slice(i, i + chunkSize)
      // Decrypt + base64 each image in the chunk; drop ones we can't read.
      const images: Record<string, string> = {}
      const readFailed: string[] = []
      await Promise.all(
        chunk.map(async (uuid) => {
          try {
            const bytes = await retrieveMedia(uuid)
            if (!bytes) throw new Error('no decrypted bytes')
            images[uuid] = bytes.toString('base64')
          } catch (err) {
            readFailed.push(uuid)
            recordError(uuid, err instanceof Error ? err.message : String(err))
          }
        })
      )
      for (const uuid of readFailed) captionState.captioning.processed++

      const readable = Object.keys(images)
      if (readable.length === 0) continue

      try {
        const { captions, errors } = await captionBatch(images, { task })
        for (const uuid of readable) {
          const text = captions[uuid]
          if (text && text.trim()) {
            await db
              .update(mediaRecords)
              .set({ caption: text.trim(), captionAt: new Date() })
              .where(eq(mediaRecords.uuid, uuid))
          } else {
            recordError(uuid, errors[uuid] || 'empty caption')
          }
          captionState.captioning.processed++
        }
      } catch (err) {
        // Whole-chunk failure (captioner down/timeout): count them and move on.
        const msg = err instanceof Error ? err.message : String(err)
        for (const uuid of readable) {
          recordError(uuid, msg)
          captionState.captioning.processed++
        }
        logger.warn(`⚠️ caption chunk failed: ${msg}`)
      }
    }

    captionState.captioning.running = false
    captionState.captioning.finishedAt = Date.now()
    captionState.captioning.message = `Captioned ${captionState.captioning.processed - captionState.captioning.errors}/${uuids.length} (${captionState.captioning.errors} errors)`
    logger.info(`🏁 caption: ${captionState.captioning.message}`)
  })().catch((err) => {
    captionState.captioning.running = false
    logger.error('❌ caption loop crashed:', err)
  })

  return {
    success: true,
    count: uuids.length,
    totalToCaption,
    purposes,
    task,
    subjectScoped: !!subjectUuid,
    message: `Started captioning ${uuids.length} image(s). Poll /api/media/caption/status for progress.`,
  }
})
