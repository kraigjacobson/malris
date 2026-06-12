<template>
  <div class="container mx-auto px-4 py-6 max-w-5xl">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">I2V Presets</h1>
      <UButton icon="i-heroicons-plus" @click="openNew">New Preset</UButton>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-500" />
    </div>
    <div v-else-if="presets.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
      No presets yet. Click "New Preset" to create one.
    </div>
    <div v-else class="space-y-3">
      <div
        v-for="preset in presets"
        :key="preset.id"
        class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-lg text-gray-900 dark:text-white truncate">{{ preset.name }}</h3>
            <p v-if="preset.prompt" class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">{{ preset.prompt }}</p>
            <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-500 mt-2">
              <span v-if="preset.length">{{ preset.length }} frames (~{{ (preset.length / 16).toFixed(1) }}s)</span>
              <span>{{ activeLoraCount(preset) }} LoRA{{ activeLoraCount(preset) !== 1 ? 's' : '' }}</span>
              <span class="text-gray-600 dark:text-gray-500">Updated {{ formatDate(preset.updatedAt) }}</span>
            </div>
          </div>
          <div class="flex gap-2 flex-shrink-0">
            <UButton size="sm" variant="outline" icon="i-heroicons-pencil" @click="openEdit(preset)">Edit</UButton>
            <UButton size="sm" variant="outline" color="error" icon="i-heroicons-trash" @click="confirmDelete(preset)" />
          </div>
        </div>
      </div>
    </div>

    <!-- Edit / Create Modal -->
    <UModal v-model:open="editModalOpen">
      <template #header>
        <h3 class="text-lg font-semibold">{{ editingId ? 'Edit Preset' : 'New Preset' }}</h3>
      </template>

      <template #body>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <UInput v-model="form.name" placeholder="Preset name..." class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prompt</label>
            <UTextarea v-model="form.prompt" placeholder="Describe the motion/scene..." :rows="3" autoresize class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Negative Prompt</label>
            <UTextarea v-model="form.negative_prompt" :rows="2" autoresize class="w-full" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Video Length</label>
            <USelect
              :model-value="form.length ?? 81"
              @update:model-value="form.length = Number($event)"
              :items="lengthOptions"
              class="w-full"
            />
          </div>

          <!-- LoRA Slots -->
          <div
            v-for="slot in 5"
            :key="slot"
            class="border rounded-lg p-3 transition-colors"
            :class="[
              dragSlot === slot ? 'opacity-40' : '',
              dragOverSlot === slot && dragSlot !== slot ? 'border-primary border-dashed' : 'border-gray-200 dark:border-gray-700'
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
                  class="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing shrink-0"
                  title="Drag to reorder"
                  @pointerdown="dragArmed = true"
                  @pointerup="dragArmed = false"
                />
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">LoRA {{ slot }}</span>
              </div>
              <span v-if="hasLoraInSlot(slot)" class="text-xs text-green-500">Active</span>
            </div>

            <div class="space-y-2 mb-2">
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">High Noise</label>
                <USelectMenu
                  :model-value="form[`lora_${slot}_high`] || 'none'"
                  @update:model-value="setLora(slot, 'high', $event)"
                  :items="highNoiseLoraOptions"
                  value-key="value"
                  :search-input="{ placeholder: 'Search LoRAs...' }"
                  class="w-full"
                />
                <TriggerWordsEditor
                  v-if="form[`lora_${slot}_high`]"
                  :key="`trig-high-${form[`lora_${slot}_high`]}`"
                  :model-value="triggerWordsFor(form[`lora_${slot}_high`])"
                  :lora-name="form[`lora_${slot}_high`]"
                  @update:model-value="setTriggerWords(form[`lora_${slot}_high`], $event)"
                  class="mt-1"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Low Noise</label>
                <USelectMenu
                  :model-value="form[`lora_${slot}_low`] || 'none'"
                  @update:model-value="setLora(slot, 'low', $event)"
                  :items="lowNoiseLoraOptions"
                  value-key="value"
                  :search-input="{ placeholder: 'Search LoRAs...' }"
                  class="w-full"
                />
                <TriggerWordsEditor
                  v-if="form[`lora_${slot}_low`]"
                  :key="`trig-low-${form[`lora_${slot}_low`]}`"
                  :model-value="triggerWordsFor(form[`lora_${slot}_low`])"
                  :lora-name="form[`lora_${slot}_low`]"
                  @update:model-value="setTriggerWords(form[`lora_${slot}_low`], $event)"
                  class="mt-1"
                />
              </div>
            </div>

            <div v-if="hasLoraInSlot(slot)" class="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  High Strength: {{ form[`lora_${slot}_high_strength`] ?? 1 }}
                </label>
                <USlider
                  :model-value="form[`lora_${slot}_high_strength`] ?? 1"
                  @update:model-value="form[`lora_${slot}_high_strength`] = $event"
                  :min="0"
                  :max="2"
                  :step="0.05"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Low Strength: {{ form[`lora_${slot}_low_strength`] ?? 1 }}
                </label>
                <USlider
                  :model-value="form[`lora_${slot}_low_strength`] ?? 1"
                  @update:model-value="form[`lora_${slot}_low_strength`] = $event"
                  :min="0"
                  :max="2"
                  :step="0.05"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="editModalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.name?.trim()" @click="savePreset">
            {{ editingId ? 'Update' : 'Create' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="deleteModalOpen">
      <template #header>
        <h3 class="text-lg font-semibold">Delete Preset</h3>
      </template>
      <template #body>
        <p class="text-sm text-gray-700 dark:text-gray-300">
          Are you sure you want to delete <strong>{{ deletingPreset?.name }}</strong>? This cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" @click="deleteModalOpen = false">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="doDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  title: 'I2V Presets'
})

type Preset = {
  id: string
  name: string
  jobType: string
  prompt: string | null
  negativePrompt: string | null
  length: number | null
  lora1High: string | null
  lora1Low: string | null
  lora1HighStrength: number | null
  lora1LowStrength: number | null
  lora2High: string | null
  lora2Low: string | null
  lora2HighStrength: number | null
  lora2LowStrength: number | null
  lora3High: string | null
  lora3Low: string | null
  lora3HighStrength: number | null
  lora3LowStrength: number | null
  updatedAt: string
}

interface LoraInfo {
  name: string
  trigger_words: string | null
}

const presets = ref<Preset[]>([])
const availableLoras = ref<LoraInfo[]>([])
const triggerWordsOverrides = ref<Record<string, string | null>>({})

function triggerWordsFor(name: string): string | null {
  if (!name) return null
  if (name in triggerWordsOverrides.value) return triggerWordsOverrides.value[name]
  return availableLoras.value.find(l => l.name === name)?.trigger_words ?? null
}

function setTriggerWords(name: string, value: string | null) {
  if (!name) return
  triggerWordsOverrides.value = { ...triggerWordsOverrides.value, [name]: value }
}
const loading = ref(true)

const editModalOpen = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)

const deleteModalOpen = ref(false)
const deletingPreset = ref<Preset | null>(null)
const deleting = ref(false)

const emptyForm = () => ({
  name: '',
  prompt: '',
  negative_prompt: '',
  length: 81 as number,
  lora_1_high: null as string | null,
  lora_1_low: null as string | null,
  lora_1_high_strength: 0.8,
  lora_1_low_strength: 0.8,
  lora_2_high: null as string | null,
  lora_2_low: null as string | null,
  lora_2_high_strength: 0.8,
  lora_2_low_strength: 0.8,
  lora_3_high: null as string | null,
  lora_3_low: null as string | null,
  lora_3_high_strength: 0.8,
  lora_3_low_strength: 0.8,
  lora_4_high: null as string | null,
  lora_4_low: null as string | null,
  lora_4_high_strength: 0.8,
  lora_4_low_strength: 0.8,
  lora_5_high: null as string | null,
  lora_5_low: null as string | null,
  lora_5_high_strength: 0.8,
  lora_5_low_strength: 0.8,
})

const form = ref<Record<string, any>>(emptyForm())

const lengthOptions = [
  { label: '17 frames (~1s)', value: 17 },
  { label: '33 frames (~2s)', value: 33 },
  { label: '49 frames (~3s)', value: 49 },
  { label: '81 frames (~5s)', value: 81 },
  { label: '121 frames (~7.5s)', value: 121 },
  { label: '161 frames (~10s)', value: 161 },
]

onMounted(async () => {
  await Promise.all([fetchPresets(), fetchLoras()])
})

async function fetchPresets() {
  loading.value = true
  try {
    const data = await $fetch<{ presets: Preset[] }>('/api/presets?job_type=i2v')
    presets.value = data?.presets || []
  } catch (e) {
    console.error('Failed to fetch presets:', e)
    presets.value = []
  } finally {
    loading.value = false
  }
}

async function fetchLoras() {
  try {
    const data = await $fetch<{ loras: LoraInfo[] }>('/api/loras')
    availableLoras.value = data?.loras || []
  } catch (e) {
    console.error('Failed to fetch LoRAs:', e)
    availableLoras.value = []
  }
}

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
  ...availableLoras.value.filter(l => !isLowNoise(l.name)).map(l => ({ label: l.name, value: l.name }))
])

const lowNoiseLoraOptions = computed(() => [
  { label: 'None', value: 'none' },
  ...availableLoras.value.filter(l => !isHighNoise(l.name)).map(l => ({ label: l.name, value: l.name }))
])

function hasLoraInSlot(slot: number): boolean {
  return !!(form.value[`lora_${slot}_high`] || form.value[`lora_${slot}_low`])
}

// --- LoRA slot drag-reorder (mirrors I2vJobForm; this page has no _off flags) -
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

  const f = form.value
  const bundle = (s: number) => ({
    high: f[`lora_${s}_high`] ?? null,
    low: f[`lora_${s}_low`] ?? null,
    hs: f[`lora_${s}_high_strength`],
    ls: f[`lora_${s}_low_strength`],
  })
  const bundles = [1, 2, 3, 4, 5].map(bundle)
  const [moved] = bundles.splice(from - 1, 1)
  bundles.splice(toSlot - 1, 0, moved)
  bundles.forEach((b, i) => {
    const s = i + 1
    f[`lora_${s}_high`] = b.high
    f[`lora_${s}_low`] = b.low
    f[`lora_${s}_high_strength`] = b.hs
    f[`lora_${s}_low_strength`] = b.ls
  })
}

function setLora(slot: number, kind: 'high' | 'low', value: string) {
  form.value[`lora_${slot}_${kind}`] = value === 'none' ? null : value
}

function activeLoraCount(preset: Preset): number {
  let count = 0
  for (const slot of [1, 2, 3]) {
    if ((preset as any)[`lora${slot}High`] || (preset as any)[`lora${slot}Low`]) count++
  }
  return count
}

function formatDate(dateString: string): string {
  if (!dateString) return ''
  return new Date(dateString).toLocaleString()
}

function openNew() {
  editingId.value = null
  form.value = emptyForm()
  editModalOpen.value = true
}

function openEdit(preset: Preset) {
  editingId.value = preset.id
  form.value = {
    name: preset.name,
    prompt: preset.prompt || '',
    negative_prompt: preset.negativePrompt || '',
    length: preset.length || 81,
    lora_1_high: preset.lora1High,
    lora_1_low: preset.lora1Low,
    lora_1_high_strength: preset.lora1HighStrength ?? 1,
    lora_1_low_strength: preset.lora1LowStrength ?? 1,
    lora_2_high: preset.lora2High,
    lora_2_low: preset.lora2Low,
    lora_2_high_strength: preset.lora2HighStrength ?? 1,
    lora_2_low_strength: preset.lora2LowStrength ?? 1,
    lora_3_high: preset.lora3High,
    lora_3_low: preset.lora3Low,
    lora_3_high_strength: preset.lora3HighStrength ?? 1,
    lora_3_low_strength: preset.lora3LowStrength ?? 1,
    lora_4_high: preset.lora4High,
    lora_4_low: preset.lora4Low,
    lora_4_high_strength: preset.lora4HighStrength ?? 1,
    lora_4_low_strength: preset.lora4LowStrength ?? 1,
    lora_5_high: preset.lora5High,
    lora_5_low: preset.lora5Low,
    lora_5_high_strength: preset.lora5HighStrength ?? 1,
    lora_5_low_strength: preset.lora5LowStrength ?? 1,
  }
  editModalOpen.value = true
}

async function savePreset() {
  if (!form.value.name?.trim()) return
  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      job_type: 'i2v',
      prompt: form.value.prompt,
      negative_prompt: form.value.negative_prompt,
      length: form.value.length,
      lora_1_high: form.value.lora_1_high,
      lora_1_low: form.value.lora_1_low,
      lora_1_high_strength: form.value.lora_1_high_strength,
      lora_1_low_strength: form.value.lora_1_low_strength,
      lora_2_high: form.value.lora_2_high,
      lora_2_low: form.value.lora_2_low,
      lora_2_high_strength: form.value.lora_2_high_strength,
      lora_2_low_strength: form.value.lora_2_low_strength,
      lora_3_high: form.value.lora_3_high,
      lora_3_low: form.value.lora_3_low,
      lora_3_high_strength: form.value.lora_3_high_strength,
      lora_3_low_strength: form.value.lora_3_low_strength,
      lora_4_high: form.value.lora_4_high,
      lora_4_low: form.value.lora_4_low,
      lora_4_high_strength: form.value.lora_4_high_strength,
      lora_4_low_strength: form.value.lora_4_low_strength,
      lora_5_high: form.value.lora_5_high,
      lora_5_low: form.value.lora_5_low,
      lora_5_high_strength: form.value.lora_5_high_strength,
      lora_5_low_strength: form.value.lora_5_low_strength,
    }
    if (editingId.value) {
      await $fetch(`/api/presets/${editingId.value}`, { method: 'PUT', body: payload })
    } else {
      await $fetch('/api/presets', { method: 'POST', body: payload })
    }
    editModalOpen.value = false
    await fetchPresets()
  } catch (e) {
    console.error('Failed to save preset:', e)
  } finally {
    saving.value = false
  }
}

function confirmDelete(preset: Preset) {
  deletingPreset.value = preset
  deleteModalOpen.value = true
}

async function doDelete() {
  if (!deletingPreset.value) return
  deleting.value = true
  try {
    await $fetch(`/api/presets/${deletingPreset.value.id}`, { method: 'DELETE' })
    deleteModalOpen.value = false
    deletingPreset.value = null
    await fetchPresets()
  } catch (e) {
    console.error('Failed to delete preset:', e)
  } finally {
    deleting.value = false
  }
}
</script>
