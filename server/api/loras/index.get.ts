import { readdirSync, existsSync } from 'fs'

export default defineEventHandler(async () => {
  const lorasDir = process.env.LORAS_DIR || '/data/loras'

  if (!existsSync(lorasDir)) {
    return { loras: [], message: `LoRA directory not found: ${lorasDir}` }
  }

  const files = readdirSync(lorasDir)
    .filter(f => f.endsWith('.safetensors'))
    .sort()

  const { getDb } = await import('~/server/utils/database')
  const { loraMetadata } = await import('~/server/utils/schema')

  const db = getDb()
  const rows = await db.select().from(loraMetadata)
  const triggerMap = new Map<string, string>()
  for (const row of rows) {
    if (row.triggerWords) triggerMap.set(row.name, row.triggerWords)
  }

  const loras = files.map(name => ({
    name,
    trigger_words: triggerMap.get(name) || null,
  }))

  return { loras }
})
