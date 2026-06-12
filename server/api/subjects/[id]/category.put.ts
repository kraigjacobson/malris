import { logger } from '~/server/utils/logger'

const ALLOWED = ['celeb', 'asmr', 'real'] as const

/**
 * Set or clear the explicit subject category (celeb | asmr | real).
 * Pass category: null to clear and fall back to name-based inference.
 */
export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const body = await readBody(event)

    if (!id) {
      throw createError({ statusCode: 400, statusMessage: 'Subject ID is required' })
    }

    const raw = body?.category
    if (raw !== null && raw !== undefined && !ALLOWED.includes(raw)) {
      throw createError({
        statusCode: 400,
        statusMessage: `category must be one of ${ALLOWED.join(', ')} or null`
      })
    }

    const nextCategory = raw ?? null

    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()

    try {
      const result = await client.query(
        `UPDATE subjects
         SET category = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, name, tags, note, thumbnail, category, created_at, updated_at`,
        [nextCategory, id]
      )

      if (result.rows.length === 0) {
        throw createError({ statusCode: 404, statusMessage: 'Subject not found' })
      }

      return { success: true, subject: result.rows[0] }
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    logger.error('Failed to update subject category:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update subject category: ${error.message || 'Unknown error'}`
    })
  }
})
