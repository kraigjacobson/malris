import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, isNull, inArray, count } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'
import { retrieveMedia } from '~/server/services/hybridMediaStorage'
import { faceEmbedState } from '~/server/utils/faceEmbedState'
import { vecToBuf } from '~/server/utils/faceEmbedding'

/**
 * Compute face embeddings for images and store them on media_records via the
 * CPU InsightFace `face-embed` service. Fire-and-forget background job; poll
 * GET /api/media/faces/status for progress.
 *
 * Body params (all optional):
 *   purposes     string[]  which image purposes to embed. Default ['source'].
 *   subjectUuid  string    only embed images for this subject.
 *   force        boolean   re-embed rows that already have face_embedded_at.
 *   limit        number    cap rows processed this run (testing).
 *   batchSize    number    images per HTTP request to the embed service. Default 16.
 *   concurrency  number    concurrent batches in flight. Default 2.
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event).catch(() => ({}))

  const purposes: string[] =
    Array.isArray(body.purposes) && body.purposes.length > 0 ? body.purposes.map(String) : ['source']
  const subjectUuid: string | null = typeof body.subjectUuid === 'string' && body.subjectUuid ? body.subjectUuid : null
  const force = body.force === true
  const limit: number | null = Number.isInteger(body.limit) && body.limit > 0 ? body.limit : null
  const batchSize = Math.min(Math.max(Number(body.batchSize) || 16, 1), 64)
  const concurrency = Math.min(Math.max(Number(body.concurrency) || 2, 1), 6)

  const embedUrl = process.env.FACE_EMBED_URL || 'http://localhost:8005'

  if (faceEmbedState.embedding.running) {
    return { success: false, message: 'Embedding already running', progress: faceEmbedState.embedding }
  }

  // type='image', selected purposes, optional subject, and (unless force) not yet processed.
  const filters = [eq(mediaRecords.type, 'image'), inArray(mediaRecords.purpose, purposes)]
  if (subjectUuid) filters.push(eq(mediaRecords.subjectUuid, subjectUuid))
  if (!force) filters.push(isNull(mediaRecords.faceEmbeddedAt))
  const predicate = and(...filters)

  const totalRow = await db.select({ count: count() }).from(mediaRecords).where(predicate)
  const totalToEmbed = totalRow[0]?.count ?? 0

  if (totalToEmbed === 0) {
    return { success: true, count: 0, message: `Nothing to embed for purposes [${purposes.join(', ')}].` }
  }

  let rows = await db.select({ uuid: mediaRecords.uuid }).from(mediaRecords).where(predicate)
  if (limit) rows = rows.slice(0, limit)
  const uuids = rows.map((r) => r.uuid)

  // Split into HTTP batches.
  const batches: string[][] = []
  for (let i = 0; i < uuids.length; i += batchSize) batches.push(uuids.slice(i, i + batchSize))

  // Reset + start progress.
  faceEmbedState.embedding = {
    running: true,
    processed: 0,
    total: uuids.length,
    errors: 0,
    noFace: 0,
    startedAt: Date.now(),
    finishedAt: null,
    message: `Embedding ${uuids.length} image(s) for [${purposes.join(', ')}]${subjectUuid ? ' (subject-scoped)' : ''}${force ? ' (force)' : ''}`,
    errorSamples: [],
  }
  logger.info(`🧠 face-embed: ${faceEmbedState.embedding.message}`)

  const PER_BATCH_TIMEOUT_MS = 120_000
  const noteError = (uuid: string, msg: string) => {
    faceEmbedState.embedding.errors++
    if (faceEmbedState.embedding.errorSamples.length < 25) {
      faceEmbedState.embedding.errorSamples.push({ uuid, error: msg })
    }
  }

  // Fire-and-forget; bounded-concurrency over batches.
  void (async () => {
    let batchIdx = 0
    const worker = async () => {
      while (batchIdx < batches.length) {
        const batch = batches[batchIdx++]
        await new Promise((r) => setImmediate(r)) // keep the event loop responsive

        // Retrieve + base64-encode each image in the batch.
        const images: Record<string, string> = {}
        const inBatch: string[] = []
        for (const uuid of batch) {
          try {
            const bytes = await retrieveMedia(uuid)
            if (!bytes) {
              noteError(uuid, 'no decrypted bytes')
              faceEmbedState.embedding.processed++
              continue
            }
            images[uuid] = bytes.toString('base64')
            inBatch.push(uuid)
          } catch (err) {
            noteError(uuid, err instanceof Error ? err.message : String(err))
            faceEmbedState.embedding.processed++
          }
        }

        if (inBatch.length === 0) continue

        // POST the batch to the embed service.
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), PER_BATCH_TIMEOUT_MS)
          let resp: Response
          try {
            resp = await fetch(`${embedUrl}/embed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ images }),
              signal: controller.signal,
            })
          } finally {
            clearTimeout(timer)
          }

          if (!resp.ok) {
            const txt = await resp.text().catch(() => '')
            for (const uuid of inBatch) noteError(uuid, `embed service ${resp.status}: ${txt.slice(0, 120)}`)
            faceEmbedState.embedding.processed += inBatch.length
            continue
          }

          const data = (await resp.json()) as {
            embeddings?: Record<string, number[]>
            skipped?: Record<string, string>
          }
          const embeddings = data.embeddings || {}

          for (const uuid of inBatch) {
            try {
              const vec = embeddings[uuid]
              if (vec && vec.length > 0) {
                await db
                  .update(mediaRecords)
                  .set({ faceEmbedding: vecToBuf(vec), faceEmbeddedAt: new Date() })
                  .where(eq(mediaRecords.uuid, uuid))
              } else {
                // No face found — mark processed so we don't retry, leave embedding NULL.
                faceEmbedState.embedding.noFace++
                await db
                  .update(mediaRecords)
                  .set({ faceEmbedding: null, faceEmbeddedAt: new Date() })
                  .where(eq(mediaRecords.uuid, uuid))
              }
            } catch (err) {
              noteError(uuid, err instanceof Error ? err.message : String(err))
            } finally {
              faceEmbedState.embedding.processed++
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          for (const uuid of inBatch) noteError(uuid, msg)
          faceEmbedState.embedding.processed += inBatch.length
          logger.warn(`⚠️ face-embed batch failed: ${msg}`)
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    faceEmbedState.embedding.running = false
    faceEmbedState.embedding.finishedAt = Date.now()
    const ok = faceEmbedState.embedding.processed - faceEmbedState.embedding.errors - faceEmbedState.embedding.noFace
    faceEmbedState.embedding.message = `Embedded ${ok}/${uuids.length} (${faceEmbedState.embedding.noFace} no-face, ${faceEmbedState.embedding.errors} errors)`
    logger.info(`🏁 face-embed: ${faceEmbedState.embedding.message}`)
  })().catch((err) => {
    faceEmbedState.embedding.running = false
    logger.error('❌ face-embed loop crashed:', err)
  })

  return {
    success: true,
    count: uuids.length,
    totalToEmbed,
    purposes,
    message: `Started embedding ${uuids.length} image(s). Poll /api/media/faces/status for progress.`,
  }
})
