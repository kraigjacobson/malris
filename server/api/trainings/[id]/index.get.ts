import { readFile } from 'fs/promises'
import path from 'path'
import { eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { loraTrainings, jobs, subjects } from '~/server/utils/schema'

const TRAIN_ROOT = process.env.TRAIN_DIR || '/train'
const LOG_TAIL_BYTES = 16 * 1024

// Training run detail: the row, its job's live status/progress, and the tail
// of the per-run trainer.log (written by ktrain into /train/runs/<id>/).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Training ID is required' })
  }

  const db = getDb()
  const rows = await db
    .select({
      id: loraTrainings.id,
      jobId: loraTrainings.jobId,
      subjectUuid: loraTrainings.subjectUuid,
      subjectName: subjects.name,
      loraName: loraTrainings.loraName,
      triggerWord: loraTrainings.triggerWord,
      status: loraTrainings.status,
      imageUuids: loraTrainings.imageUuids,
      config: loraTrainings.config,
      outputLoras: loraTrainings.outputLoras,
      errorMessage: loraTrainings.errorMessage,
      createdAt: loraTrainings.createdAt,
      startedAt: loraTrainings.startedAt,
      completedAt: loraTrainings.completedAt,
      jobStatus: jobs.status,
      progress: jobs.progress
    })
    .from(loraTrainings)
    .leftJoin(jobs, eq(loraTrainings.jobId, jobs.id))
    .leftJoin(subjects, eq(loraTrainings.subjectUuid, subjects.id))
    .where(eq(loraTrainings.id, id))
    .limit(1)

  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Training not found' })
  }

  let logTail: string | null = null
  try {
    const raw = await readFile(path.join(TRAIN_ROOT, 'runs', id, 'trainer.log'))
    logTail = raw.subarray(Math.max(0, raw.length - LOG_TAIL_BYTES)).toString('utf8')
  } catch {
    // No log yet (not started, or /train not mounted) — the UI shows a placeholder
  }

  return { training: rows[0], log_tail: logTail }
})
