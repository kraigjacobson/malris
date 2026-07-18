export default defineEventHandler(async (event) => {
  const name = decodeURIComponent(getRouterParam(event, 'name') || '')
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'LoRA name is required' })
  }

  const body = await readBody(event)

  // Partial update: only touch the fields actually present in the body so
  // saving trigger words never wipes a prompt template (and vice-versa).
  const has = (k: string) => body != null && Object.prototype.hasOwnProperty.call(body, k)
  const norm = (v: unknown) => (typeof v === 'string' ? v.trim() || null : null)

  if (!has('trigger_words') && !has('prompt_template') && !has('negative_prompt')) {
    throw createError({ statusCode: 400, statusMessage: 'No updatable fields provided' })
  }

  const { getDb } = await import('~/server/utils/database')
  const { loraMetadata } = await import('~/server/utils/schema')
  const { sql } = await import('drizzle-orm')

  const insertValues: Record<string, unknown> = { name }
  const updateSet: Record<string, unknown> = { updatedAt: sql`NOW()` }
  if (has('trigger_words')) {
    insertValues.triggerWords = norm(body.trigger_words)
    updateSet.triggerWords = norm(body.trigger_words)
  }
  if (has('prompt_template')) {
    insertValues.promptTemplate = norm(body.prompt_template)
    updateSet.promptTemplate = norm(body.prompt_template)
  }
  if (has('negative_prompt')) {
    insertValues.negativePrompt = norm(body.negative_prompt)
    updateSet.negativePrompt = norm(body.negative_prompt)
  }

  const db = getDb()

  const [row] = await db
    .insert(loraMetadata)
    .values(insertValues as any)
    .onConflictDoUpdate({
      target: loraMetadata.name,
      set: updateSet as any,
    })
    .returning()

  return { success: true, lora: row }
})
