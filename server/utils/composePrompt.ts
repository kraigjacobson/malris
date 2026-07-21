import { getDb } from '~/server/utils/database'
import { loraMetadata } from '~/server/utils/schema'

/**
 * Server mirror of `composePrompt` in components/I2vJobForm.vue. Rebuilds a
 * t2v/i2v prompt from a job's LoRA stack using the CURRENT lora_metadata, so a
 * RETRY re-rolls the dynamic prompt AND picks up any template edits made since
 * the job was created. Wildcards ({a|b|c}) stay intact — they re-expand at
 * activation. Returns null when the stack has no position/closeup base to build
 * on (so the caller keeps the existing prompt rather than clobbering it).
 *
 * KEEP IN SYNC with the frontend composePrompt — the two must produce the same
 * shape (base template + [subject]/[body]/[accessory]/[effect] slots, character
 * lead-in). DEFAULT_BODY/DEFAULT_EXPRESSION mirror the component's constants.
 */

const BASE_CATS = new Set(['position', 'closeup'])
const DEFAULT_BODY = ' with a big round ass and small, natural breasts'
const DEFAULT_EXPRESSION = '{to be moaning in pleasure|to be gasping|to be crying out|to be gritting her teeth|with her eyes rolling back}'

interface LoraMeta {
  name: string
  trigger_words: string | null
  prompt_template: string | null
  negative_prompt: string | null
  category: string | null
  prompt_fragment: string | null
  orientation: string | null
  default_strength: number | null
}

// char/ folder overrides seeded category (drop-in character convention).
function effectiveCategory(m: LoraMeta): string | null {
  if (/(^|\/)char\//.test(m.name)) return 'character'
  return m.category || null
}

function fillSlot(t: string, slot: string, value: string): string {
  return t.split(`[${slot}]`).join(value)
}

// Unique LoRA names across all slots (high + low), in slot order.
function selectedLoraNames(params: Record<string, any>): string[] {
  const out: string[] = []
  for (const slot of [1, 2, 3, 4, 5]) {
    for (const noise of ['high', 'low']) {
      const v = params[`lora_${slot}_${noise}`]
      if (v && v !== 'none' && !out.includes(v)) out.push(v)
    }
  }
  return out
}

export async function recomposePromptFromLoras(
  params: Record<string, any>,
): Promise<{ prompt: string; negative: string | null; orientation: string | null; strengths: Record<string, number> } | null> {
  const names = selectedLoraNames(params)
  if (names.length === 0) return null

  const db = getDb()
  const rows = (await db.select({
    name: loraMetadata.name,
    trigger_words: loraMetadata.triggerWords,
    prompt_template: loraMetadata.promptTemplate,
    negative_prompt: loraMetadata.negativePrompt,
    category: loraMetadata.category,
    prompt_fragment: loraMetadata.promptFragment,
    orientation: loraMetadata.orientation,
    default_strength: loraMetadata.defaultStrength,
  }).from(loraMetadata)) as LoraMeta[]

  // Resolve by full relative path first, then basename (mirrors /api/loras pick()).
  const byName = new Map<string, LoraMeta>()
  const byBase = new Map<string, LoraMeta>()
  for (const r of rows) {
    byName.set(r.name, r)
    const base = r.name.split('/').pop() as string
    if (!byBase.has(base)) byBase.set(base, r)
  }
  const metaFor = (name: string): LoraMeta | null => {
    if (byName.has(name)) return byName.get(name)!
    return byBase.get(name.split('/').pop() as string) || null
  }

  const metas = names.map(metaFor).filter(Boolean) as LoraMeta[]
  const base = metas.find(m => BASE_CATS.has(effectiveCategory(m) || 'position') && m.prompt_template)
  if (!base?.prompt_template) return null

  // Current recommended strength per selected LoRA (keyed by the STORED name so
  // the caller can re-apply it to the job's slots — retry picks up strength
  // tweaks like a lowered doggy/giantess strength).
  const strengths: Record<string, number> = {}
  for (const nm of names) {
    const s = metaFor(nm)?.default_strength
    if (s != null) strengths[nm] = s
  }

  const fragOf = (m: LoraMeta): string => {
    if (effectiveCategory(m) === 'character') {
      if (m.prompt_fragment) return m.prompt_fragment
      const t = (m.trigger_words || '').split(',')[0].trim()
      return t ? t + ' ' : ''
    }
    return m.prompt_fragment || ''
  }
  const frags = (cat: string): string[] =>
    [...new Set(metas.filter(m => effectiveCategory(m) === cat).map(fragOf).filter(Boolean))]

  const charMeta = metas.find(m => effectiveCategory(m) === 'character')
  const body = frags('body').join('') || DEFAULT_BODY
  const expression = frags('expression')[0] || DEFAULT_EXPRESSION
  const accessory = frags('accessory').join('')
  const effect = frags('effect').join('')

  let out = base.prompt_template
  if (charMeta) {
    // Lead with the character's full identity (trigger token + trained/edited
    // appearance), then refer to her as "her" so Wan keeps it ONE subject.
    const identity = (charMeta.trigger_words || charMeta.prompt_fragment || '')
      .trim().replace(/\s+/g, ' ').replace(/[,.\s]+$/, '')
    out = fillSlot(out, 'subject', '')
    out = fillSlot(out, 'body', '')
    const m = out.match(/a beautiful (giant )?naked woman('s)?/)
    if (m) {
      const giant = m[1] ? 'giant ' : ''
      out = out.replace(m[0], m[2] ? `her ${giant}nude` : `her, ${giant}nude${body},`)
    }
    out = `${identity}. ${out}`
  } else {
    out = fillSlot(out, 'subject', '')
    out = fillSlot(out, 'body', body)
  }
  out = fillSlot(out, 'expression', expression)
  out = fillSlot(out, 'accessory', accessory)
  out = fillSlot(out, 'effect', effect)
  return { prompt: out, negative: base.negative_prompt || null, orientation: base.orientation || null, strengths }
}
