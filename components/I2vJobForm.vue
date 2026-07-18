<template>
  <div class="space-y-4">
    <!-- Prompt -->
    <div>
      <div class="flex items-center gap-1.5 mb-1">
        <label class="block text-sm font-medium text-gray-300">Prompt</label>
        <ClientOnly>
          <UPopover :content="{ side: 'right', align: 'start', sideOffset: 8 }">
            <UButton
              variant="ghost"
              size="xs"
              color="neutral"
              icon="i-heroicons-question-mark-circle"
              class="p-0"
              aria-label="Random prompt syntax help"
            />
            <template #content>
              <div class="p-4 w-80 text-xs text-gray-200 space-y-2">
                <p class="text-sm font-semibold text-white">Random prompt syntax</p>
                <p class="text-gray-400">Pick from alternatives at generation time — resolved before the prompt reaches the model, reproducible per seed.</p>
                <ul class="space-y-1.5">
                  <li><code class="px-1 py-0.5 rounded bg-gray-800 text-primary font-mono">{a|b|c}</code> — pick one at random</li>
                  <li><code class="px-1 py-0.5 rounded bg-gray-800 text-primary font-mono">{3::a|1::b}</code> — weighted pick (a is 3× as likely)</li>
                  <li><code class="px-1 py-0.5 rounded bg-gray-800 text-primary font-mono">{2$$a|b|c}</code> — pick N, joined by "<span class="text-gray-400">, </span>"</li>
                  <li><code class="px-1 py-0.5 rounded bg-gray-800 text-primary font-mono">{1-3$$a|b|c}</code> — pick a random count in range</li>
                  <li><code class="px-1 py-0.5 rounded bg-gray-800 text-primary font-mono">{2$$ + $$a|b|c}</code> — custom join separator</li>
                  <li><code class="px-1 py-0.5 rounded bg-gray-800 text-primary font-mono">a {big {red|blue}|small}</code> — nesting works</li>
                </ul>
                <p class="pt-2 border-t border-gray-700 text-gray-400">Same seed → same picks. Plain text with no <code class="px-1 rounded bg-gray-800 font-mono">{ }</code> passes through unchanged. No <code class="px-1 rounded bg-gray-800 font-mono">__file__</code> wildcards.</p>
              </div>
            </template>
          </UPopover>
        </ClientOnly>
      </div>
      <UTextarea
        :model-value="modelValue.prompt"
        @update:model-value="update('prompt', $event)"
        placeholder="Describe the motion/scene you want..."
        :rows="3"
        autoresize
        class="w-full"
        :ui="{ base: 'w-full' }"
      />
    </div>

    <!-- Negative Prompt -->
    <div>
      <label class="block text-sm font-medium text-gray-300 mb-1">Negative Prompt</label>
      <UTextarea
        :model-value="modelValue.negative_prompt"
        @update:model-value="update('negative_prompt', $event)"
        :rows="2"
        autoresize
        class="w-full"
        :ui="{ base: 'w-full' }"
      />
    </div>

    <!-- Video Length -->
    <div>
      <label class="block text-sm font-medium text-gray-300 mb-1">Video Length</label>
      <USelect
        :model-value="modelValue.length"
        @update:model-value="update('length', Number($event))"
        :items="lengthOptions"
      />
    </div>

    <!-- LoRA Slots (drag the handle to reorder; swaps the stored values so the
         new order persists on the submitted job). -->
    <div
      v-for="slot in 5"
      :key="slot"
      class="border rounded-lg p-3 transition-colors"
      :class="[
        dragSlot === slot ? 'opacity-40' : '',
        dragOverSlot === slot && dragSlot !== slot ? 'border-primary border-dashed' : 'border-gray-700'
      ]"
      :draggable="dragArmed"
      @dragstart="onSlotDragStart($event, slot)"
      @dragover.prevent="dragOverSlot = slot"
      @drop="onSlotDrop(slot)"
      @dragend="resetSlotDrag"
    >
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon
            name="i-heroicons-bars-3"
            class="w-4 h-4 text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing shrink-0"
            title="Drag to reorder"
            @pointerdown="dragArmed = true"
            @pointerup="dragArmed = false"
          />
          <span class="text-sm font-medium text-gray-300">{{ slot === 1 ? 'Character' : `LoRA ${slot}` }}</span>
        </div>
        <span v-if="hasLoraInSlot(slot)" class="text-xs text-green-400">Active</span>
      </div>

      <div class="space-y-2 mb-2">
        <div>
          <label class="block text-xs text-gray-400 mb-1">High Noise</label>
          <USelectMenu
            :model-value="modelValue[`lora_${slot}_high`] || 'none'"
            @update:model-value="setLoraInSlot(slot, 'high', $event)"
            @update:open="onLoraMenuToggle"
            :items="loraOptionsFor(slot, 'high')"
            value-key="value"
            placeholder="None"
            :search-input="{ placeholder: 'Search LoRAs...' }"
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Low Noise</label>
          <USelectMenu
            :model-value="modelValue[`lora_${slot}_low`] || 'none'"
            @update:model-value="setLoraInSlot(slot, 'low', $event)"
            @update:open="onLoraMenuToggle"
            :items="loraOptionsFor(slot, 'low')"
            value-key="value"
            placeholder="None"
            :search-input="{ placeholder: 'Search LoRAs...' }"
            class="w-full"
          />
        </div>

        <!-- One trigger/badge per slot (high & low are the same concept). -->
        <div v-if="slotRep(slot)">
          <span
            v-if="loraBadge(slotRep(slot)!)"
            class="inline-block text-[10px] uppercase tracking-wide text-primary/80"
          >{{ loraBadge(slotRep(slot)!) }}</span>
          <TriggerWordsEditor
            :key="`trig-${slotRep(slot)}`"
            :model-value="triggerWordsFor(slotRep(slot)!)"
            :lora-name="slotRep(slot)!"
            @update:model-value="setTriggerWords(slotRep(slot)!, $event)"
            class="mt-1"
          />
        </div>
      </div>

      <div v-if="hasLoraInSlot(slot)" class="grid grid-cols-2 gap-3 mt-2">
        <div :class="{ 'opacity-40': isStrengthDisabled(slot, 'high') }">
          <label class="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <UCheckbox
              :model-value="!isStrengthDisabled(slot, 'high')"
              @update:model-value="setStrengthEnabled(slot, 'high', $event)"
              @click.stop
            />
            <span>High Strength: {{ modelValue[`lora_${slot}_high_strength`] ?? 1 }}</span>
          </label>
          <USlider
            :model-value="modelValue[`lora_${slot}_high_strength`] ?? 1"
            @update:model-value="update(`lora_${slot}_high_strength`, $event)"
            :min="0"
            :max="2"
            :step="0.05"
          />
        </div>
        <div :class="{ 'opacity-40': isStrengthDisabled(slot, 'low') }">
          <label class="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <UCheckbox
              :model-value="!isStrengthDisabled(slot, 'low')"
              @update:model-value="setStrengthEnabled(slot, 'low', $event)"
              @click.stop
            />
            <span>Low Strength: {{ modelValue[`lora_${slot}_low_strength`] ?? 1 }}</span>
          </label>
          <USlider
            :model-value="modelValue[`lora_${slot}_low_strength`] ?? 1"
            @update:model-value="update(`lora_${slot}_low_strength`, $event)"
            :min="0"
            :max="2"
            :step="0.05"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { loraOffKey } from '~/utils/loraDisable'

interface LoraInfo {
  name: string
  trigger_words: string | null
  prompt_template?: string | null
  negative_prompt?: string | null
  category?: string | null
  prompt_fragment?: string | null
  default_strength?: number | null
  pair_key?: string | null
  civitai_name?: string | null
}

const props = withDefaults(defineProps<{
  modelValue: Record<string, any>
  loras: LoraInfo[]
  // Which wan job type this form edits (t2v shows the curated t2v/ LoRA set).
  jobType?: 'i2v' | 't2v'
}>(), {
  jobType: 'i2v'
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
  // Fired when a LoRA picker is opened, so the parent can refresh the list and
  // pick up LoRAs published since the form was first loaded (no reload needed).
  'refresh-loras': []
}>()

const onLoraMenuToggle = (open: boolean) => {
  if (open) emit('refresh-loras')
}

function update(key: string, value: any) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function hasLoraInSlot(slot: number): boolean {
  return !!(props.modelValue[`lora_${slot}_high`] || props.modelValue[`lora_${slot}_low`])
}

// --- LoRA slot drag-reorder -------------------------------------------------
// dragArmed is set only when the pointer goes down on the drag handle, and the
// card's `draggable` is bound to it — so the card becomes draggable only while
// the handle is grabbed. The rest of the time it is not draggable, which keeps
// the browser from hijacking mousedown and lets you select text (e.g. trigger
// words) and click the selects/sliders inside normally.
const dragArmed = ref(false)
const dragSlot = ref<number | null>(null)
const dragOverSlot = ref<number | null>(null)

function onSlotDragStart(e: DragEvent, slot: number) {
  if (!dragArmed.value) {
    e.preventDefault()
    return
  }
  dragSlot.value = slot
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function resetSlotDrag() {
  dragArmed.value = false
  dragSlot.value = null
  dragOverSlot.value = null
}

function onSlotDrop(toSlot: number) {
  const from = dragSlot.value
  resetSlotDrag()
  if (from == null || from === toSlot) return

  const mv: Record<string, any> = { ...props.modelValue }
  const bundle = (s: number) => ({
    high: mv[`lora_${s}_high`] ?? null,
    low: mv[`lora_${s}_low`] ?? null,
    hs: mv[`lora_${s}_high_strength`],
    ls: mv[`lora_${s}_low_strength`],
    hOff: !!mv[loraOffKey(`lora_${s}_high_strength`)],
    lOff: !!mv[loraOffKey(`lora_${s}_low_strength`)],
  })
  // Move (splice-reinsert) so the visual result matches drag-and-drop intent.
  const bundles = [1, 2, 3, 4, 5].map(bundle)
  const [moved] = bundles.splice(from - 1, 1)
  bundles.splice(toSlot - 1, 0, moved)

  bundles.forEach((b, i) => {
    const s = i + 1
    mv[`lora_${s}_high`] = b.high
    mv[`lora_${s}_low`] = b.low
    mv[`lora_${s}_high_strength`] = b.hs
    mv[`lora_${s}_low_strength`] = b.ls
    const hOffK = loraOffKey(`lora_${s}_high_strength`)
    const lOffK = loraOffKey(`lora_${s}_low_strength`)
    if (b.hOff) mv[hOffK] = true
    else delete mv[hOffK]
    if (b.lOff) mv[lOffK] = true
    else delete mv[lOffK]
  })
  emit('update:modelValue', mv)
}

function isStrengthDisabled(slot: number, noise: 'high' | 'low'): boolean {
  return !!props.modelValue[loraOffKey(`lora_${slot}_${noise}_strength`)]
}

function setStrengthEnabled(slot: number, noise: 'high' | 'low', enabled: boolean) {
  const key = loraOffKey(`lora_${slot}_${noise}_strength`)
  if (enabled) {
    const next = { ...props.modelValue }
    delete next[key]
    emit('update:modelValue', next)
  } else {
    update(key, true)
  }
}

const lengthOptions = [
  { label: '17 frames (~1s)', value: 17 },
  { label: '33 frames (~2s)', value: 33 },
  { label: '49 frames (~3s)', value: 49 },
  { label: '81 frames (~5s)', value: 81 },
  { label: '121 frames (~7.5s)', value: 121 },
  { label: '161 frames (~10s)', value: 161 },
]

// Noise classification. Recognizes the "high/low noise" markers Wan2.2 LoRA
// authors use: the words high/low (incl. `highnoise`), the HN/LN abbreviations,
// and delimited -h/_h / -l/_l. `high`/`low` must be bounded by a non-letter so
// substrings like "blowjob" (low) or "thigh" (high) don't false-match. A LoRA
// that matches NEITHER is noise-agnostic (single-file) and shows in both lists.
function isHighNoise(name: string): boolean {
  const l = name.toLowerCase().replace(/\.safetensors$/, '')
  return /highnoise/.test(l)
    || /(^|[^a-z])hn([^a-z]|$)/.test(l)
    || /(^|[^a-z])h([-_.\d]|$)/.test(l)
    // 'high' bounded on EITHER side (catches glued authors like V3TWERKHIGH)
    || /(^|[^a-z])high|high([^a-z]|$)/.test(l)
}

// English words that embed "low" but aren't the low-noise marker.
const LOW_FALSE = /blow|flow|glow|slow|below|yellow|fellow|pillow|follow|hollow|swallow|mellow|shallow|wallow|willow|billow/g

function isLowNoise(name: string): boolean {
  const l = name.toLowerCase().replace(/\.safetensors$/, '')
  if (/lownoise/.test(l)) return true
  if (/(^|[^a-z])ln([^a-z]|$)/.test(l)) return true
  if (/(^|[^a-z])l([-_.\d]|$)/.test(l)) return true
  // 'low' bounded on either side, after removing the false-positive words above
  return /(^|[^a-z])low|low([^a-z]|$)/.test(l.replace(LOW_FALSE, ''))
}

// i2v vs t2v relevance. The `t2v/` subfolder is the curated t2v LoRA set; a t2v
// job shows ONLY those, and an i2v job shows everything else (the LoRA root).
function matchesJobType(name: string): boolean {
  const inT2vFolder = name.startsWith('t2v/')
  return props.jobType === 't2v' ? inT2vFolder : !inT2vFolder
}

// Friendly, searchable dropdown label: Civitai model name when known (so typing
// "Beth" finds B3th_v1mdw...), a 👤 marker for character LoRAs, then the
// filename. The stored value stays the full relative path.
function loraLabel(l: LoraInfo): string {
  const basename = (l.name.split('/').pop() || l.name).replace(/\.safetensors$/, '')
  const mark = /(^|\/)char\//.test(l.name) ? '👤 ' : ''
  // Strip "(fake character)" / "(Not a real person)" — implied by the 👤 marker.
  const civ = (l.civitai_name || '').replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  return civ ? `${mark}${civ} — ${basename}` : `${mark}${basename}`
}

function isCharLora(name) {
  return /(^|\/)char\//.test(name)
}

// Collapse trainer epoch checkpoints (<lora>_<expert>_ep<N>_<date>.safetensors)
// to the LATEST epoch per concept, so the picker isn't cluttered with every
// saved checkpoint. LoRAs without an _ep<N> marker (downloads) pass through.
function collapseEpochs(list) {
  const best = {}
  for (const l of list) {
    const m = l.name.match(/_ep(\d+)/i)
    if (!m) continue
    const g = l.name.replace(/_ep\d+.*$/i, '')
    const e = parseInt(m[1], 10)
    if (best[g] === undefined || e > best[g]) best[g] = e
  }
  return list.filter(l => {
    const m = l.name.match(/_ep(\d+)/i)
    if (!m) return true
    return parseInt(m[1], 10) === best[l.name.replace(/_ep\d+.*$/i, '')]
  })
}

// LoRA options for a given slot + noise half. Slot 1 is reserved for the
// character (shows ONLY char/ LoRAs); slots 2–5 exclude characters.
function loraOptionsFor(slot, noise) {
  const noiseOk = noise === 'high' ? (l) => !isLowNoise(l.name) : (l) => !isHighNoise(l.name)
  const list = collapseEpochs(
    props.loras.filter(l => matchesJobType(l.name) && noiseOk(l) && (slot === 1 ? isCharLora(l.name) : !isCharLora(l.name)))
  )
  return [{ label: 'None', value: 'none' }, ...list.map(l => ({ label: loraLabel(l), value: l.name }))]
}

// Local overlay of trigger-word edits so the UI reflects saves without
// requiring a parent refetch. Falls back to the props.loras value otherwise.
const triggerWordsOverrides = ref<Record<string, string | null>>({})

function triggerWordsFor(name: string): string | null {
  if (!name) return null
  if (name in triggerWordsOverrides.value) return triggerWordsOverrides.value[name]
  return props.loras.find(l => l.name === name)?.trigger_words ?? null
}

function setTriggerWords(name: string, value: string | null) {
  if (!name) return
  triggerWordsOverrides.value = { ...triggerWordsOverrides.value, [name]: value }
  // A character's [subject] token derives from its trigger words, so re-compose
  // live when the trigger is edited in the UI.
  if (effectiveCategory(metaFor(name)) === 'character') {
    const composed = composePrompt(props.modelValue)
    if (composed) emit('update:modelValue', { ...props.modelValue, prompt: composed.prompt })
  }
}

// --- Compositional prompt building -----------------------------------------
// A "position"/"closeup" LoRA is the base template; its [body]/[expression]/
// [accessory]/[effect] slots are filled by the fragments of any selected
// modifier LoRAs (category body/expression/accessory/effect). Rebuilt live on
// every LoRA toggle. Unfilled slots fall back to sensible defaults.
const DEFAULT_EXPRESSION = '{to be moaning in pleasure|to be gasping|to be crying out|to be gritting her teeth|with her eyes rolling back}'
// Default body when no body modifier (thicc/pawg) is chosen — the preferred realistic default.
const DEFAULT_BODY = ' with a big round ass and small, natural breasts'
const BASE_CATS = new Set(['position', 'closeup'])

function metaFor(name: string): LoraInfo | undefined {
  return props.loras.find(l => l.name === name)
}

// Anything under a `char/` folder is treated as a character LoRA regardless of
// seeded metadata, so future character LoRAs work by drop-in convention.
function effectiveCategory(m: LoraInfo | undefined): string | null {
  if (!m) return null
  if (/(^|\/)char\//.test(m.name)) return 'character'
  return m.category || null
}

// A character's [subject] fragment: its seeded fragment, else its trigger token
// (first comma-segment of the trigger words — editable live in the UI).
function charToken(m: LoraInfo): string {
  if (m.prompt_fragment) return m.prompt_fragment
  const t = (triggerWordsFor(m.name) || '').split(',')[0].trim()
  return t ? t + ' ' : ''
}

// The fragment a LoRA contributes to its category slot.
function fragOf(m: LoraInfo): string {
  if (effectiveCategory(m) === 'character') return charToken(m)
  return m.prompt_fragment || ''
}

function recommendedStrength(name: string): number {
  return metaFor(name)?.default_strength ?? 1
}

// Unique LoRA names currently chosen across all slots (high + low), in slot order.
function selectedLoraNames(mv: Record<string, any>): string[] {
  const out: string[] = []
  for (const slot of [1, 2, 3, 4, 5]) {
    for (const noise of ['high', 'low']) {
      const v = mv[`lora_${slot}_${noise}`]
      if (v && !out.includes(v)) out.push(v)
    }
  }
  return out
}

function fillSlot(t: string, slot: string, value: string): string {
  return t.split(`[${slot}]`).join(value)
}

// Build the composed prompt from the selected LoRAs, or null if there's no base
// (position/closeup) LoRA to build on.
function composePrompt(mv: Record<string, any>): { prompt: string; negative: string | null } | null {
  const metas = selectedLoraNames(mv).map(metaFor).filter(Boolean) as LoraInfo[]
  const base = metas.find(m => BASE_CATS.has(effectiveCategory(m) || 'position') && m.prompt_template)
  if (!base?.prompt_template) return null

  const frags = (cat: string) =>
    [...new Set(metas.filter(m => effectiveCategory(m) === cat).map(fragOf).filter(Boolean))]

  const charMeta = metas.find(m => effectiveCategory(m) === 'character')
  // A chosen body modifier (thicc/pawg) overrides the realistic default body.
  const body = frags('body').join('') || DEFAULT_BODY
  const expression = frags('expression')[0] || DEFAULT_EXPRESSION
  const accessory = frags('accessory').join('')
  const effect = frags('effect').join('')

  let out = base.prompt_template

  if (charMeta) {
    // Lead with the character's FULL identity — the trigger token plus any
    // trained/edited appearance (hair colour, bangs, eyes) that lives in its
    // trigger words. Then refer to her as "her" (with nudity + body preserved)
    // so Wan2.2's T5 encoder keeps the trigger and the woman as ONE person.
    const identity = (triggerWordsFor(charMeta.name) || charMeta.prompt_fragment || '')
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
  return { prompt: out, negative: base.negative_prompt || null }
}

// Normalized concept id from a filename (strip folders, noise markers, symbols)
// so an unseeded high/low pair (e.g. a drop-in char LoRA) can still be matched.
function normConcept(name: string): string {
  const base = (name.split('/').pop() || name).toLowerCase().replace(/\.safetensors$/, '')
  return base.replace(/highnoise|lownoise|high|low|hn|ln|noise/g, '').replace(/[^a-z0-9]/g, '')
}

// key -> { high, low } filenames, so picking one noise half auto-fills the other.
// Prefer the seeded pair_key; fall back to the normalized concept id. A neutral
// single-file LoRA (no clear high/low marker) fills both.
const pairIndex = computed(() => {
  const byKey: Record<string, { high?: string; low?: string }> = {}
  const byNorm: Record<string, { high?: string; low?: string }> = {}
  for (const l of props.loras) {
    const assign = (idx: Record<string, { high?: string; low?: string }>, k: string) => {
      const e = idx[k] || (idx[k] = {})
      if (isLowNoise(l.name)) e.low = l.name
      else if (isHighNoise(l.name)) e.high = l.name
      else { e.high = e.high || l.name; e.low = e.low || l.name }
    }
    if (l.pair_key) assign(byKey, l.pair_key)
    else assign(byNorm, normConcept(l.name))
  }
  return { byKey, byNorm }
})

function counterpartOf(name: string, targetNoise: 'high' | 'low'): string | null {
  const pk = metaFor(name)?.pair_key
  if (pk) return pairIndex.value.byKey[pk]?.[targetNoise] || null
  return pairIndex.value.byNorm[normConcept(name)]?.[targetNoise] || null
}

// Set a LoRA into a slot: auto-fills the matching counterpart in the other noise
// half of the same slot, applies each one's recommended strength, and live-
// rebuilds the composed prompt. Clearing one half clears the whole slot.
function setLoraInSlot(slot: number, noise: 'high' | 'low', value: string) {
  const name = value === 'none' ? null : value
  const other: 'high' | 'low' = noise === 'high' ? 'low' : 'high'
  const mv: Record<string, any> = { ...props.modelValue, [`lora_${slot}_${noise}`]: name }

  if (name) {
    mv[`lora_${slot}_${noise}_strength`] = recommendedStrength(name)
    const cp = counterpartOf(name, other)
    if (cp) {
      mv[`lora_${slot}_${other}`] = cp
      mv[`lora_${slot}_${other}_strength`] = recommendedStrength(cp)
    }
  } else {
    // Clearing one half removes the whole concept from the slot.
    mv[`lora_${slot}_${other}`] = null
  }

  const composed = composePrompt(mv)
  if (composed) {
    mv.prompt = composed.prompt
    if (composed.negative) mv.negative_prompt = composed.negative
  } else if (name && !BASE_CATS.has(effectiveCategory(metaFor(name)) || 'position')) {
    // Modifier/character picked but no base yet — nudge, don't clobber their prompt.
    useToast().add({ title: 'Add a position LoRA', description: 'Pick a position to auto-build the prompt from your character & modifiers', color: 'info', duration: 3000 })
  }
  emit('update:modelValue', mv)
}

// The representative LoRA for a slot (for the single trigger/badge display).
function slotRep(slot: number): string | null {
  return props.modelValue[`lora_${slot}_high`] || props.modelValue[`lora_${slot}_low`] || null
}

function loraBadge(name: string): string {
  const m = metaFor(name)
  const cat = effectiveCategory(m)
  if (!cat) return ''
  const str = m?.default_strength != null ? ` · str ${m.default_strength}` : ''
  return `${cat}${str}`
}
</script>
