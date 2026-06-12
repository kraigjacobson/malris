import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Preset ID is required' })
  }

  const { getDb } = await import('~/server/utils/database')
  const { jobs, jobPresets } = await import('~/server/utils/schema')
  const { eq, and } = await import('drizzle-orm')

  const db = getDb()

  // Queued jobs reference the preset live for their parameters — without it
  // they're unrunnable. Delete them before dropping the preset row. Terminal
  // jobs (active/completed/failed/canceled/need_input) keep their snapshot in
  // jobs.parameters and survive via the FK's ON DELETE SET NULL.
  const deletedQueued = await db
    .delete(jobs)
    .where(and(eq(jobs.presetId, id), eq(jobs.status, 'queued')))
    .returning({ id: jobs.id })

  await db.delete(jobPresets).where(eq(jobPresets.id, id))

  if (deletedQueued.length > 0) {
    logger.info(`🗑️ Preset ${id} deleted; cascaded ${deletedQueued.length} queued job(s)`)
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('Failed to update job counts after preset deletion cascade:', error)
    }
  }

  return { success: true, deleted_queued_jobs: deletedQueued.length }
})
