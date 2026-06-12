<template>
  <div class="space-y-4">
    <!-- Preset Selector (sticky so New/Update/Delete stay reachable while scrolling params) -->
    <div class="sticky top-0 z-20 bg-gray-900 pb-2 -mt-2 pt-2 pr-2 border-b border-gray-800">
      <div class="flex gap-2 items-end">
        <div class="flex-1 min-w-0">
          <label class="block text-sm font-medium text-gray-300 mb-1">Preset</label>
          <USelect
            v-model="selectedPresetId"
            :items="presetOptions"
            placeholder="Select a preset..."
            class="w-full"
            :ui="{ content: 'min-w-[16rem] max-w-[90vw] w-max' }"
            @update:model-value="loadPreset"
          />
        </div>
        <UButton size="sm" icon="i-heroicons-bookmark" @click="showSavePreset = true" :disabled="!modelValue.prompt">
          New
        </UButton>
        <UButton v-if="selectedPresetId" size="sm" icon="i-heroicons-pencil" variant="outline" @click="updateCurrentPreset">
          Update
        </UButton>
        <UButton v-if="selectedPresetId" size="sm" icon="i-heroicons-trash" variant="outline" color="red" @click="deleteCurrentPreset" />
      </div>

      <!-- Save Preset Dialog -->
      <div v-if="showSavePreset" class="mt-2 border border-primary/30 rounded-lg p-3 bg-gray-900">
        <div class="flex gap-2">
          <UInput v-model="newPresetName" placeholder="Preset name..." class="flex-1" @keyup.enter="savePreset" />
          <UButton size="sm" @click="savePreset" :disabled="!newPresetName.trim()">Save</UButton>
          <UButton size="sm" variant="ghost" @click="showSavePreset = false">Cancel</UButton>
        </div>
      </div>
    </div>

    <!-- Prompt -->
    <div>
      <label class="block text-sm font-medium text-gray-300 mb-1">Prompt</label>
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
         new order persists when the preset is saved). -->
    <div
      v-for="slot in 5"
      :key="slot"
      class="border rounded-lg p-3 transition-colors"
      :class="[
        dragSlot === slot ? 'opacity-40' : '',
        dragOverSlot === slot && dragSlot !== slot ? 'border-primary border-dashed' : 'border-gray-700'
      ]"
      draggable="true"
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
          <span class="text-sm font-medium text-gray-300">LoRA {{ slot }}</span>
        </div>
        <span v-if="hasLoraInSlot(slot)" class="text-xs text-green-400">Active</span>
      </div>

      <div class="space-y-2 mb-2">
        <div>
          <label class="block text-xs text-gray-400 mb-1">High Noise</label>
          <USelectMenu
            :model-value="modelValue[`lora_${slot}_high`] || 'none'"
            @update:model-value="update(`lora_${slot}_high`, $event === 'none' ? null : $event)"
            :items="highNoiseLoraOptions"
            value-key="value"
            placeholder="None"
            :search-input="{ placeholder: 'Search LoRAs...' }"
            class="w-full"
          />
          <TriggerWordsEditor
            v-if="modelValue[`lora_${slot}_high`]"
            :key="`trig-high-${modelValue[`lora_${slot}_high`]}`"
            :model-value="triggerWordsFor(modelValue[`lora_${slot}_high`])"
            :lora-name="modelValue[`lora_${slot}_high`]"
            @update:model-value="setTriggerWords(modelValue[`lora_${slot}_high`], $event)"
            class="mt-1"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Low Noise</label>
          <USelectMenu
            :model-value="modelValue[`lora_${slot}_low`] || 'none'"
            @update:model-value="update(`lora_${slot}_low`, $event === 'none' ? null : $event)"
            :items="lowNoiseLoraOptions"
            value-key="value"
            placeholder="None"
            :search-input="{ placeholder: 'Search LoRAs...' }"
            class="w-full"
          />
          <TriggerWordsEditor
            v-if="modelValue[`lora_${slot}_low`]"
            :key="`trig-low-${modelValue[`lora_${slot}_low`]}`"
            :model-value="triggerWordsFor(modelValue[`lora_${slot}_low`])"
            :lora-name="modelValue[`lora_${slot}_low`]"
            @update:model-value="setTriggerWords(modelValue[`lora_${slot}_low`], $event)"
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
}

const props = defineProps<{
  modelValue: Record<string, any>
  loras: LoraInfo[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const selectedPresetId = ref('')
const presets = ref<any[]>([])
const showSavePreset = ref(false)
const newPresetName = ref('')

onMounted(() => fetchPresets())

async function fetchPresets() {
  try {
    const data = await $fetch<any>('/api/presets?job_type=i2v')
    presets.value = data?.presets || []
  } catch (e) {
    console.error('Failed to fetch presets:', e)
  }
}

// Sync the dropdown selection from an externally-provided _preset_id on modelValue
// (e.g. the Duplicate action on the jobs list pre-fills the params with this stash).
// Setting selectedPresetId programmatically does NOT trigger loadPreset, so we don't
// clobber any tweaked params that came in with the duplicate.
watch(
  [() => props.modelValue?._preset_id, presets],
  ([presetId]) => {
    if (!presetId) return
    const exists = presets.value.some(p => p.id === presetId)
    if (exists && selectedPresetId.value !== presetId) {
      selectedPresetId.value = presetId
    }
  },
  { immediate: true }
)

const presetOptions = computed(() => [
  { label: 'No preset', value: 'none' },
  ...presets.value.map(p => ({ label: p.name, value: p.id }))
])

function loadPreset(presetId: string) {
  if (!presetId || presetId === 'none') {
    // Clear any stashed preset identity so this job won't carry a stale preset label
    const { _preset_id, _preset_name, ...rest } = props.modelValue
    void _preset_id; void _preset_name
    emit('update:modelValue', rest)
    return
  }
  const preset = presets.value.find(p => p.id === presetId)
  if (!preset) return

  const next: Record<string, any> = {
    prompt: preset.prompt || '',
    negative_prompt: preset.negativePrompt || props.modelValue.negative_prompt,
    length: preset.length || 81,
    lora_1_high: preset.lora1High || null,
    lora_1_low: preset.lora1Low || null,
    lora_1_high_strength: preset.lora1HighStrength ?? 1,
    lora_1_low_strength: preset.lora1LowStrength ?? 1,
    lora_2_high: preset.lora2High || null,
    lora_2_low: preset.lora2Low || null,
    lora_2_high_strength: preset.lora2HighStrength ?? 1,
    lora_2_low_strength: preset.lora2LowStrength ?? 1,
    lora_3_high: preset.lora3High || null,
    lora_3_low: preset.lora3Low || null,
    lora_3_high_strength: preset.lora3HighStrength ?? 1,
    lora_3_low_strength: preset.lora3LowStrength ?? 1,
    lora_4_high: preset.lora4High || null,
    lora_4_low: preset.lora4Low || null,
    lora_4_high_strength: preset.lora4HighStrength ?? 1,
    lora_4_low_strength: preset.lora4LowStrength ?? 1,
    lora_5_high: preset.lora5High || null,
    lora_5_low: preset.lora5Low || null,
    lora_5_high_strength: preset.lora5HighStrength ?? 1,
    lora_5_low_strength: preset.lora5LowStrength ?? 1,
    // Stash preset identity; stays on the job's parameters jsonb for list display
    _preset_id: preset.id,
    _preset_name: preset.name,
  }
  if (preset.lora1HighStrengthOff) next[loraOffKey('lora_1_high_strength')] = true
  if (preset.lora1LowStrengthOff) next[loraOffKey('lora_1_low_strength')] = true
  if (preset.lora2HighStrengthOff) next[loraOffKey('lora_2_high_strength')] = true
  if (preset.lora2LowStrengthOff) next[loraOffKey('lora_2_low_strength')] = true
  if (preset.lora3HighStrengthOff) next[loraOffKey('lora_3_high_strength')] = true
  if (preset.lora3LowStrengthOff) next[loraOffKey('lora_3_low_strength')] = true
  if (preset.lora4HighStrengthOff) next[loraOffKey('lora_4_high_strength')] = true
  if (preset.lora4LowStrengthOff) next[loraOffKey('lora_4_low_strength')] = true
  if (preset.lora5HighStrengthOff) next[loraOffKey('lora_5_high_strength')] = true
  if (preset.lora5LowStrengthOff) next[loraOffKey('lora_5_low_strength')] = true
  emit('update:modelValue', next)
}

function currentParamsPayload(name: string) {
  const mv = props.modelValue
  return {
    name,
    job_type: 'i2v',
    prompt: mv.prompt,
    negative_prompt: mv.negative_prompt,
    length: mv.length,
    lora_1_high: mv.lora_1_high,
    lora_1_low: mv.lora_1_low,
    lora_1_high_strength: mv.lora_1_high_strength,
    lora_1_low_strength: mv.lora_1_low_strength,
    lora_1_high_strength_off: !!mv[loraOffKey('lora_1_high_strength')],
    lora_1_low_strength_off: !!mv[loraOffKey('lora_1_low_strength')],
    lora_2_high: mv.lora_2_high,
    lora_2_low: mv.lora_2_low,
    lora_2_high_strength: mv.lora_2_high_strength,
    lora_2_low_strength: mv.lora_2_low_strength,
    lora_2_high_strength_off: !!mv[loraOffKey('lora_2_high_strength')],
    lora_2_low_strength_off: !!mv[loraOffKey('lora_2_low_strength')],
    lora_3_high: mv.lora_3_high,
    lora_3_low: mv.lora_3_low,
    lora_3_high_strength: mv.lora_3_high_strength,
    lora_3_low_strength: mv.lora_3_low_strength,
    lora_3_high_strength_off: !!mv[loraOffKey('lora_3_high_strength')],
    lora_3_low_strength_off: !!mv[loraOffKey('lora_3_low_strength')],
    lora_4_high: mv.lora_4_high,
    lora_4_low: mv.lora_4_low,
    lora_4_high_strength: mv.lora_4_high_strength,
    lora_4_low_strength: mv.lora_4_low_strength,
    lora_4_high_strength_off: !!mv[loraOffKey('lora_4_high_strength')],
    lora_4_low_strength_off: !!mv[loraOffKey('lora_4_low_strength')],
    lora_5_high: mv.lora_5_high,
    lora_5_low: mv.lora_5_low,
    lora_5_high_strength: mv.lora_5_high_strength,
    lora_5_low_strength: mv.lora_5_low_strength,
    lora_5_high_strength_off: !!mv[loraOffKey('lora_5_high_strength')],
    lora_5_low_strength_off: !!mv[loraOffKey('lora_5_low_strength')],
  }
}

async function savePreset() {
  if (!newPresetName.value.trim()) return
  const toast = useToast()
  try {
    const res = await $fetch<any>('/api/presets', {
      method: 'POST',
      body: currentParamsPayload(newPresetName.value.trim())
    })
    const newId = res?.preset?.id
    const savedName = newPresetName.value.trim()
    showSavePreset.value = false
    newPresetName.value = ''
    await fetchPresets()
    if (newId) {
      selectedPresetId.value = newId
      // Keep current params but tag them with the new preset identity
      emit('update:modelValue', {
        ...props.modelValue,
        _preset_id: newId,
        _preset_name: savedName,
      })
    }
    toast.add({
      title: 'Preset Saved',
      description: `"${savedName}" is now selected`,
      color: 'success',
      duration: 3000
    })
  } catch (e) {
    console.error('Failed to save preset:', e)
    toast.add({
      title: 'Save Failed',
      description: (e as any)?.data?.statusMessage || (e as any)?.message || 'Could not save preset',
      color: 'error',
      duration: 4000
    })
  }
}

async function updateCurrentPreset() {
  if (!selectedPresetId.value) return
  const preset = presets.value.find(p => p.id === selectedPresetId.value)
  if (!preset) return
  const toast = useToast()
  try {
    await $fetch(`/api/presets/${selectedPresetId.value}`, {
      method: 'PUT',
      body: currentParamsPayload(preset.name)
    })
    await fetchPresets()
    toast.add({
      title: 'Preset Updated',
      description: `"${preset.name}" saved`,
      color: 'success',
      duration: 3000
    })
  } catch (e) {
    console.error('Failed to update preset:', e)
    toast.add({
      title: 'Update Failed',
      description: (e as any)?.data?.statusMessage || (e as any)?.message || 'Could not update preset',
      color: 'error',
      duration: 4000
    })
  }
}

async function deleteCurrentPreset() {
  if (!selectedPresetId.value) return
  try {
    await $fetch(`/api/presets/${selectedPresetId.value}`, { method: 'DELETE' })
    selectedPresetId.value = ''
    await fetchPresets()
  } catch (e) {
    console.error('Failed to delete preset:', e)
  }
}

function update(key: string, value: any) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function hasLoraInSlot(slot: number): boolean {
  return !!(props.modelValue[`lora_${slot}_high`] || props.modelValue[`lora_${slot}_low`])
}

// --- LoRA slot drag-reorder -------------------------------------------------
// dragArmed is set only when the pointer goes down on the drag handle, so the
// card (which is always draggable) only actually starts a drag from the handle
// — clicks on the selects/sliders inside don't initiate one.
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

function isHighNoise(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.includes('high') || /[-_]h[-_.\d]/.test(lower) || lower.endsWith('-h.safetensors') || lower.endsWith('_h.safetensors')
}

function isLowNoise(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.includes('low') || /[-_]l[-_.\d]/.test(lower) || lower.endsWith('-l.safetensors') || lower.endsWith('_l.safetensors')
}

const highNoiseLoraOptions = computed(() => [
  { label: 'None', value: 'none' },
  ...props.loras.filter(l => !isLowNoise(l.name)).map(l => ({ label: l.name, value: l.name }))
])

const lowNoiseLoraOptions = computed(() => [
  { label: 'None', value: 'none' },
  ...props.loras.filter(l => !isHighNoise(l.name)).map(l => ({ label: l.name, value: l.name }))
])

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
}
</script>
