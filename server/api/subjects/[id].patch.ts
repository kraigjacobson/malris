import { getDb } from '~/server/utils/database'
import { subjects } from '~/server/utils/schema'
import { eq, and, ne } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    if (!id) {
      throw createError({ statusCode: 400, statusMessage: 'Subject ID is required' })
    }

    const body = await readBody(event)
    if (!body || typeof body !== 'object') {
      throw createError({ statusCode: 400, statusMessage: 'Body is required' })
    }

    const { name } = body
    if (name === undefined) {
      throw createError({ statusCode: 400, statusMessage: 'name is required' })
    }

    const trimmed = (name || '').trim()
    if (!trimmed) {
      throw createError({ statusCode: 400, statusMessage: 'name cannot be empty' })
    }

    const db = getDb()

    // Check uniqueness — reject if another subject already has this name
    const conflict = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.name, trimmed), ne(subjects.id, id)))
      .limit(1)

    if (conflict.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'A subject with that name already exists' })
    }

    const updated = await db
      .update(subjects)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(subjects.id, id))
      .returning({ id: subjects.id, name: subjects.name, updatedAt: subjects.updatedAt })

    if (updated.length === 0) {
      throw createError({ statusCode: 404, statusMessage: 'Subject not found' })
    }

    return { success: true, subject: updated[0] }
  } catch (error: any) {
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: `Failed to update subject: ${error.message || 'Unknown error'}` })
  }
})
