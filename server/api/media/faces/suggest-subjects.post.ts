import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, inArray, isNotNull, ne } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'
import { bufToVec, meanNormalized, dot } from '~/server/utils/faceEmbedding'

/**
 * Suggest which existing subjects a set of selected images most likely belong
 * to, by face similarity. Used by the "Move to Subject" picker so the user can
 * click a likely match instead of hunting through the whole subject list.
 *
 * Builds one query vector from the selected images' face embeddings (mean,
 * normalized), then scores every OTHER subject by the best (max) cosine
 * similarity between the query and any of that subject's embedded source images
 * — i.e. nearest-neighbour voting, which beats a single-thumbnail comparison
 * when subjects have varied photos.
 *
 * Body:
 *   mediaUuids          string[]  the selected images to match. Required.
 *   excludeSubjectUuid  string    subject to omit (the one being moved from).
 *   limit               number    how many suggestions to return. Default 6.
 *   minScore            number    drop suggestions below this cosine sim. Default 0.2.
 *
 * Returns { suggestions: [{ subject_uuid, score, matchCount }], queried, matched }.
 * `queried` = how many selected images actually had embeddings (0 → caller
 * should prompt the user to run face embedding first).
 */
export default defineEventHandler(async (event) => {
  const db = getDb()
  const body = await readBody(event).catch(() => ({}))

  const mediaUuids: string[] = Array.isArray(body.mediaUuids) ? body.mediaUuids.map(String) : []
  const excludeSubjectUuid: string | null =
    typeof body.excludeSubjectUuid === 'string' && body.excludeSubjectUuid ? body.excludeSubjectUuid : null
  const limit = Math.min(Math.max(Number(body.limit) || 6, 1), 24)
  const minScore = typeof body.minScore === 'number' ? body.minScore : 0.2

  if (mediaUuids.length === 0) {
    return { suggestions: [], queried: 0, matched: 0 }
  }

  // Embeddings for the selected images → one normalized query vector.
  const selectedRows = await db
    .select({ uuid: mediaRecords.uuid, faceEmbedding: mediaRecords.faceEmbedding })
    .from(mediaRecords)
    .where(and(inArray(mediaRecords.uuid, mediaUuids), isNotNull(mediaRecords.faceEmbedding)))

  const queryVecs: Float32Array[] = []
  for (const r of selectedRows) {
    const v = bufToVec(r.faceEmbedding as unknown as Buffer)
    if (v) queryVecs.push(v)
  }
  const query = meanNormalized(queryVecs)
  if (!query) {
    // None of the selected images have a face embedding yet.
    return { suggestions: [], queried: 0, matched: 0 }
  }

  // Candidate pool: all embedded source images that belong to some other subject.
  const filters = [
    eq(mediaRecords.type, 'image'),
    eq(mediaRecords.purpose, 'source'),
    isNotNull(mediaRecords.faceEmbedding),
    isNotNull(mediaRecords.subjectUuid),
  ]
  if (excludeSubjectUuid) filters.push(ne(mediaRecords.subjectUuid, excludeSubjectUuid))

  const candidates = await db
    .select({ subjectUuid: mediaRecords.subjectUuid, faceEmbedding: mediaRecords.faceEmbedding })
    .from(mediaRecords)
    .where(and(...filters))

  // Best similarity per subject (nearest-neighbour vote).
  const bestBySubject = new Map<string, { score: number; matchCount: number }>()
  for (const c of candidates) {
    if (!c.subjectUuid) continue
    const v = bufToVec(c.faceEmbedding as unknown as Buffer)
    if (!v) continue
    const sim = dot(query, v)
    const cur = bestBySubject.get(c.subjectUuid)
    if (!cur) {
      bestBySubject.set(c.subjectUuid, { score: sim, matchCount: sim >= minScore ? 1 : 0 })
    } else {
      if (sim > cur.score) cur.score = sim
      if (sim >= minScore) cur.matchCount++
    }
  }

  const suggestions = Array.from(bestBySubject.entries())
    .map(([subject_uuid, v]) => ({ subject_uuid, score: Number(v.score.toFixed(4)), matchCount: v.matchCount }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  logger.info(
    `🧑‍🤝‍🧑 suggest-subjects: queried ${queryVecs.length}/${mediaUuids.length} images, ${candidates.length} candidate embeddings, ${suggestions.length} suggestions`
  )

  return { suggestions, queried: queryVecs.length, matched: candidates.length }
})
