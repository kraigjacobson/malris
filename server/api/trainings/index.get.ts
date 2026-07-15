import { desc, eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { loraTrainings, jobs, subjects } from '~/server/utils/schema'

// List LoRA training runs, newest first, joined with their job's live
// status/progress and the subject name for display.
export default defineEventHandler(async () => {
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
    .orderBy(desc(loraTrainings.createdAt))

  return { trainings: rows }
})
