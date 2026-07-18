import { readdirSync, existsSync } from 'fs'
import { join, posix } from 'path'

// Recursively collect *.safetensors under `dir`, returning paths RELATIVE to the
// loras root using POSIX separators (e.g. "subject/foo.safetensors"). ComfyUI's
// LoraLoaderModelOnly resolves lora_name relative to the loras dir and indexes
// subfolders, so these relative paths load on the worker unchanged.
function collectLoras(root: string, dir: string, out: string[]): void {
  let entries: import('fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectLoras(root, abs, out)
    } else if (entry.isFile() && entry.name.endsWith('.safetensors')) {
      const rel = abs.slice(root.length).replace(/^[/\\]+/, '').split(/[/\\]/).join(posix.sep)
      out.push(rel)
    }
  }
}

export default defineEventHandler(async () => {
  const lorasDir = process.env.LORAS_DIR || '/data/loras'

  if (!existsSync(lorasDir)) {
    return { loras: [], message: `LoRA directory not found: ${lorasDir}` }
  }

  const files: string[] = []
  collectLoras(lorasDir, lorasDir, files)
  files.sort()

  const { getDb } = await import('~/server/utils/database')
  const { loraMetadata } = await import('~/server/utils/schema')

  const db = getDb()
  const rows = await db.select().from(loraMetadata)
  const triggerMap = new Map<string, string>()
  const promptMap = new Map<string, string>()
  const negativeMap = new Map<string, string>()
  const categoryMap = new Map<string, string>()
  const fragmentMap = new Map<string, string>()
  const strengthMap = new Map<string, number>()
  const pairMap = new Map<string, string>()
  const civitaiNameMap = new Map<string, string>()
  const civitaiUrlMap = new Map<string, string>()
  for (const row of rows) {
    if (row.triggerWords) triggerMap.set(row.name, row.triggerWords)
    if (row.promptTemplate) promptMap.set(row.name, row.promptTemplate)
    if (row.negativePrompt) negativeMap.set(row.name, row.negativePrompt)
    if (row.category) categoryMap.set(row.name, row.category)
    if (row.promptFragment) fragmentMap.set(row.name, row.promptFragment)
    if (row.defaultStrength != null) strengthMap.set(row.name, row.defaultStrength)
    if (row.pairKey) pairMap.set(row.name, row.pairKey)
    if (row.civitaiName) civitaiNameMap.set(row.name, row.civitaiName)
    if (row.civitaiUrl) civitaiUrlMap.set(row.name, row.civitaiUrl)
  }

  // Metadata is keyed by the registered name (usually the bare filename). Look
  // up by the full relative path first, then fall back to the basename so
  // nested LoRAs still surface their metadata.
  const pick = <T>(m: Map<string, T>, name: string, base: string): T | null =>
    (m.has(name) ? m.get(name) : m.has(base) ? m.get(base) : null) as T | null

  const loras = files.map(name => {
    const base = name.split('/').pop() as string
    return {
      name,
      trigger_words: pick(triggerMap, name, base),
      prompt_template: pick(promptMap, name, base),
      negative_prompt: pick(negativeMap, name, base),
      category: pick(categoryMap, name, base),
      prompt_fragment: pick(fragmentMap, name, base),
      default_strength: pick(strengthMap, name, base),
      pair_key: pick(pairMap, name, base),
      civitai_name: pick(civitaiNameMap, name, base),
      civitai_url: pick(civitaiUrlMap, name, base),
    }
  })

  return { loras }
})
