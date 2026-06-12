export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const jobType = query.job_type as string | undefined

  const { getDb } = await import('~/server/utils/database')
  const { jobPresets } = await import('~/server/utils/schema')
  const { eq, desc } = await import('drizzle-orm')

  const db = getDb()

  let results
  if (jobType) {
    results = await db.select().from(jobPresets).where(eq(jobPresets.jobType, jobType)).orderBy(desc(jobPresets.updatedAt))
  } else {
    results = await db.select().from(jobPresets).orderBy(desc(jobPresets.updatedAt))
  }

  return { presets: results }
})
