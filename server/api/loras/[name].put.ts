export default defineEventHandler(async (event) => {
  const name = decodeURIComponent(getRouterParam(event, 'name') || '')
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'LoRA name is required' })
  }

  const body = await readBody(event)
  const triggerWords = typeof body?.trigger_words === 'string' ? body.trigger_words.trim() : ''

  const { getDb } = await import('~/server/utils/database')
  const { loraMetadata } = await import('~/server/utils/schema')
  const { sql } = await import('drizzle-orm')

  const db = getDb()

  const [row] = await db
    .insert(loraMetadata)
    .values({ name, triggerWords: triggerWords || null })
    .onConflictDoUpdate({
      target: loraMetadata.name,
      set: { triggerWords: triggerWords || null, updatedAt: sql`NOW()` },
    })
    .returning()

  return { success: true, lora: row }
})
