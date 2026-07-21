<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile" :ui="{ content: 'max-w-3xl' }">
    <template #header>
      <h3 class="text-lg font-semibold">New LoRA Training</h3>
    </template>

    <template #body>
      <div class="space-y-4">
        <!-- Mode: Character vs Concept -->
        <div>
          <label class="block text-sm font-medium mb-1">Type</label>
          <div class="flex gap-2">
            <UButton :variant="form.mode === 'character' ? 'solid' : 'outline'" size="sm" @click="setMode('character')">Character</UButton>
            <UButton :variant="form.mode === 'concept' ? 'solid' : 'outline'" size="sm" @click="setMode('concept')">Concept / Position</UButton>
          </div>
          <p class="text-xs text-gray-500 mt-1">
            <template v-if="form.mode === 'character'">Learn one person's identity from their subject images.</template>
            <template v-else>Learn a pose/action across many people — pick real dest images by tag; the trigger absorbs the pose.</template>
          </p>
        </div>

        <!-- Character: subject picker -->
        <div v-if="form.mode === 'character'">
          <label class="block text-sm font-medium mb-1">Subject</label>
          <USelectMenu
            v-model="form.subjectUuid"
            :items="subjectItems"
            value-key="value"
            placeholder="Select subject"
            searchable
            class="w-full"
            @update:model-value="onSubjectChange"
          />
        </div>

        <!-- Concept: multi-tag search with autocomplete -->
        <div v-else>
          <label class="block text-sm font-medium mb-1">Concept tags</label>
          <!-- selected tag chips -->
          <div v-if="form.conceptTags.length" class="flex flex-wrap gap-1 mb-1">
            <UBadge
              v-for="t in form.conceptTags"
              :key="t"
              color="primary"
              variant="soft"
              class="cursor-pointer"
              @click="removeTag(t)"
            >
              {{ t }} ✕
            </UBadge>
          </div>
          <div class="flex gap-2">
            <div class="relative w-full">
              <UInput
                v-model="tagQuery"
                placeholder="type to find tags — e.g. pov, anal"
                class="w-full"
                @update:model-value="onTagQuery"
                @keydown.enter.prevent="addTypedTag"
              />
              <!-- autocomplete dropdown of real dest tags + counts -->
              <div
                v-if="tagSuggestions.length"
                class="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg max-h-56 overflow-y-auto"
              >
                <button
                  v-for="s in tagSuggestions"
                  :key="s.tag"
                  type="button"
                  class="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center"
                  @click="addTag(s.tag)"
                >
                  <span>{{ s.tag }}</span>
                  <span class="text-gray-400 text-xs">{{ s.n }}</span>
                </button>
              </div>
            </div>
            <UButton :loading="loadingImages" :disabled="!form.conceptTags.length" @click="onTagSearch">Search</UButton>
          </div>
          <!-- Live combined match count (before hitting Search) -->
          <p v-if="form.conceptTags.length" class="text-xs mt-1 font-medium" :class="matchCount === 0 ? 'text-red-500' : matchCount == null ? 'text-gray-400' : 'text-green-600 dark:text-green-400'">
            <template v-if="matchCount == null">counting matches…</template>
            <template v-else>{{ matchCount }} real dest image{{ matchCount === 1 ? '' : 's' }} match {{ form.conceptTags.join(' + ') }}</template>
          </p>
          <p class="text-xs text-gray-500 mt-1">
            Pick one or more real-dest tags — multiple = images with <strong>ALL</strong> of them (e.g. pov + anal). Enter adds a typed tag. Run the full-tag backfill first.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- LoRA name -->
          <div>
            <label class="block text-sm font-medium mb-1">LoRA name</label>
            <UInput v-model="form.loraName" placeholder="e.g. jane_wan22" class="w-full" />
            <p class="text-xs text-gray-500 mt-1">Becomes {{ form.loraName || 'name' }}_high/_low.safetensors</p>
          </div>
          <!-- Trigger word -->
          <div>
            <label class="block text-sm font-medium mb-1">Trigger word</label>
            <UInput v-model="form.triggerWord" placeholder="e.g. j4ne_person" class="w-full" />
            <p class="text-xs text-gray-500 mt-1">Leads every caption; use it in prompts</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <!-- Epochs -->
          <div>
            <label class="block text-sm font-medium mb-1">Epochs: {{ form.epochs }}</label>
            <USlider v-model="form.epochs" :min="10" :max="100" :step="5" />
          </div>
          <!-- Rank -->
          <div>
            <label class="block text-sm font-medium mb-1">LoRA rank</label>
            <USelect v-model="form.rank" :items="rankItems" value-key="value" class="w-full" />
          </div>
        </div>

        <!-- Checkpoint interval (resume granularity) -->
        <div>
          <label class="block text-sm font-medium mb-1">Checkpoint every: {{ form.checkpointMinutes }} min</label>
          <USlider v-model="form.checkpointMinutes" :min="5" :max="60" :step="5" />
          <p class="text-xs text-gray-500 mt-1">
            How often training saves a resume point — a pause or cancel loses at most this much work. Smaller = more flexible, slightly more disk churn.
          </p>
        </div>

        <!-- Image picker -->
        <div v-if="pickerVisible">
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium">
              {{ form.mode === 'concept' ? 'Training media' : 'Training images' }}
              <span class="text-gray-500">
                <template v-if="form.mode === 'concept'">({{ selectedUuids.size }} imgs + {{ selectedClips.size }} clips / {{ form.goalImages }} goal)</template>
                <template v-else>({{ selectedUuids.size }} selected)</template>
              </span>
            </label>
            <div class="flex items-center gap-2">
              <template v-if="form.mode === 'concept'">
                <label class="text-xs text-gray-500">Goal</label>
                <UInput v-model.number="form.goalImages" type="number" min="5" max="500" size="xs" class="w-16" />
              </template>
              <UButton size="xs" variant="ghost" @click="selectedUuids = new Set()">Clear</UButton>
            </div>
          </div>
          <!-- Goal progress (concept only) -->
          <div v-if="form.mode === 'concept'" class="mb-2">
            <UProgress :model-value="Math.min(selectedUuids.size + selectedClips.size, form.goalImages)" :max="form.goalImages" size="sm" />
          </div>
          <!-- Dataset-readiness assessment (concept only) -->
          <div v-if="form.mode === 'concept' && assessment" class="mb-2 rounded p-2 text-xs border" :class="assessmentClass">
            <span class="font-semibold uppercase mr-1">{{ assessmentLabel }}</span>{{ assessment.recommendation }}
            <span class="block mt-0.5 opacity-80">{{ assessment.total }} matches · {{ assessment.usable }} usable · {{ assessment.belowBlur }} below blur floor</span>
          </div>
          <p class="text-xs text-gray-500 mb-2">
            Ordered by a composite of <strong>sharpness × a resolution floor</strong> — real
            detail first, but sub-512px images demoted (they'd upscale soft). Badge shows
            <strong>S</strong>harpness · resolution; unscored images show MP only and sort behind.
            <template v-if="form.mode === 'character'"> Pick for diversity — varied angles and expressions. Grayed images have no detected face.</template>
            <template v-else> Pick a variety of DIFFERENT people doing the pose, so identity doesn't bind to the trigger.</template>
          </p>

          <!-- Images / Videos tab toggle (concept only) -->
          <div v-if="form.mode === 'concept'" class="flex gap-2 mb-2">
            <UButton size="xs" :variant="conceptTab === 'images' ? 'solid' : 'outline'" @click="conceptTab = 'images'">Images ({{ scoredImages.length }})</UButton>
            <UButton size="xs" :variant="conceptTab === 'videos' ? 'solid' : 'outline'" @click="conceptTab = 'videos'">Videos ({{ conceptVideos.length }})</UButton>
          </div>

          <!-- IMAGES grid (character always; concept when Images tab) -->
          <template v-if="form.mode === 'character' || conceptTab === 'images'">
            <div v-if="loadingImages" class="flex justify-center py-8">
              <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl text-gray-400" />
            </div>
            <div v-else-if="scoredImages.length === 0 && searched" class="text-center py-8 text-gray-500 text-sm">
              <template v-if="form.mode === 'character'">No source images found for this subject.</template>
              <template v-else>No real dest images found with {{ form.conceptTags.join(' + ') }}. Tag some dest images real in the gallery, and make sure the full-tag backfill has run.</template>
            </div>
            <div v-else class="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-96 overflow-y-auto pr-1">
              <div v-for="img in scoredImages" :key="img.uuid" class="relative" :class="{ 'opacity-40': form.mode === 'character' && !img.hasFace }">
                <MediaItem
                  :media="{ uuid: img.uuid, type: 'image', filename: img.filename, width: img.width, height: img.height }"
                  image-size="thumbnail"
                  aspect="square"
                  selectable
                  :selected="selectedUuids.has(img.uuid)"
                  @click="toggleImage(img)"
                />
                <span class="absolute bottom-1 left-1 z-30 bg-black/70 text-white text-[10px] px-1 rounded">
                  {{ img.sharpness != null ? `S${Math.round(img.sharpness)} · ${img.megapixels}MP` : `${img.megapixels}MP` }}
                </span>
              </div>
            </div>
          </template>

          <!-- VIDEOS grid (concept, Videos tab) — click a clip to trim/crop it -->
          <template v-else>
            <div v-if="loadingVideos" class="flex justify-center py-8">
              <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl text-gray-400" />
            </div>
            <div v-else-if="conceptVideos.length === 0 && searched" class="text-center py-8 text-gray-500 text-sm">
              No real dest videos found with {{ form.conceptTags.join(' + ') }}. Import + tag some clips, or mark dest videos real.
            </div>
            <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-96 overflow-y-auto pr-1">
              <div v-for="vid in conceptVideos" :key="vid.uuid" class="relative cursor-pointer"
                   :class="selectedClips.has(vid.uuid) ? 'ring-2 ring-blue-500 rounded' : ''"
                   @click="openClip(vid)">
                <MediaItem
                  :media="{ uuid: vid.uuid, type: 'video', filename: vid.filename, width: vid.width, height: vid.height, thumbnail_uuid: vid.thumbnail_uuid }"
                  image-size="thumbnail"
                  aspect="square"
                  :show-controls="false"
                />
                <span class="absolute bottom-1 left-1 z-30 bg-black/70 text-white text-[10px] px-1 rounded">
                  {{ vid.duration != null ? vid.duration + 's' : '' }}<template v-if="vid.sharpness != null"> · S{{ Math.round(vid.sharpness) }}</template>
                </span>
                <span v-if="selectedClips.has(vid.uuid)" class="absolute top-1 right-1 z-30 bg-blue-500 hover:bg-red-500 text-white text-[10px] px-1 rounded cursor-pointer" title="Remove clip" @click.stop="removeClip(vid.uuid)">
                  {{ clipLabel(vid.uuid) }} ✕
                </span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between items-center w-full">
        <p class="text-xs text-gray-500">
          Two experts (high/low noise) train sequentially — expect many hours on the 3090.
        </p>
        <div class="flex gap-2">
          <UButton variant="ghost" @click="close">Cancel</UButton>
          <UButton
            :loading="creating"
            :disabled="!canCreate"
            @click="createTraining"
          >
            Queue Training
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- Clip trim/crop editor for the concept Videos tab -->
  <ConceptClipModal v-model:open="clipModalOpen" :video="clipVideo" :existing="clipExisting" @save="onClipSave" />
</template>

<script setup lang="ts">
import ConceptClipModal from '~/components/ConceptClipModal.vue'

const isOpen = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [] }>()

const { isMobile } = useDevice()
const toast = useToast()
const { subjectItems, getSubjects } = useSubjects()

const rankItems = [
  { label: '16 (small / fast)', value: 16 },
  { label: '32 (recommended)', value: 32 },
  { label: '64 (large)', value: 64 }
]

const form = ref({
  mode: 'character' as 'character' | 'concept',
  subjectUuid: undefined as string | undefined,
  conceptTags: [] as string[],
  loraName: '',
  triggerWord: '',
  epochs: 40,
  rank: 32,
  checkpointMinutes: 15,
  goalImages: 40
})

// Concept tag autocomplete
const tagQuery = ref('')
const tagSuggestions = ref<{ tag: string; n: number }[]>([])
let tagQueryTimer: any = null

// Live combined match-count for the currently-selected concept tags.
const matchCount = ref<number | null>(null)
let matchCountTimer: any = null
const refreshMatchCount = async () => {
  if (form.value.conceptTags.length === 0) { matchCount.value = null; return }
  matchCount.value = null // "counting…"
  try {
    const res = await $fetch<{ count: number }>('/api/trainings/concept-match-count', {
      query: { tags: form.value.conceptTags.join(',') }
    })
    matchCount.value = res.count
  } catch { matchCount.value = null }
}
watch(() => form.value.conceptTags.join(','), () => {
  if (matchCountTimer) clearTimeout(matchCountTimer)
  matchCountTimer = setTimeout(refreshMatchCount, 150)
})

// Concept Images/Videos tabs + video clip selection
const conceptTab = ref<'images' | 'videos'>('images')
const conceptVideos = ref<any[]>([])
const loadingVideos = ref(false)
const selectedClips = ref(new Map<string, { uuid: string; start: number; end: number; crop: any }>())
const clipModalOpen = ref(false)
const clipVideo = ref<any>(null)
const clipExisting = ref<any>(null)

const openClip = (vid: any) => {
  clipVideo.value = vid
  clipExisting.value = selectedClips.value.get(vid.uuid) || null
  clipModalOpen.value = true
}
const onClipSave = (clip: { uuid: string; start: number; end: number; crop: any }) => {
  const next = new Map(selectedClips.value)
  next.set(clip.uuid, clip)
  selectedClips.value = next
}
const clipLabel = (uuid: string) => {
  const c = selectedClips.value.get(uuid)
  return c ? `${(c.end - c.start).toFixed(1)}s${c.crop ? ' ✂' : ''}` : ''
}
const removeClip = (uuid: string) => {
  const next = new Map(selectedClips.value)
  next.delete(uuid)
  selectedClips.value = next
}

// Concept dataset-readiness assessment
const assessment = ref<any>(null)
const assessmentLabel = computed(() =>
  assessment.value?.grade === 'ready' ? '✓ Ready' : assessment.value?.grade === 'marginal' ? '△ Marginal' : '✕ Too thin'
)
const assessmentClass = computed(() => {
  const g = assessment.value?.grade
  if (g === 'ready') return 'bg-green-500/10 border-green-500/40 text-green-700 dark:text-green-300'
  if (g === 'marginal') return 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300'
  return 'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300'
})

const close = () => {
  isOpen.value = false
}

const scoredImages = ref<any[]>([])
const selectedUuids = ref(new Set<string>())
const loadingImages = ref(false)
const creating = ref(false)
const searched = ref(false)

// The picker shows once a source is chosen: a subject (character) or a completed
// tag search (concept).
const pickerVisible = computed(() =>
  form.value.mode === 'character' ? !!form.value.subjectUuid : searched.value
)

const canCreate = computed(() => {
  const nameOk = /^[A-Za-z0-9_-]+$/.test(form.value.loraName) && !!form.value.triggerWord.trim()
  if (form.value.mode === 'concept') {
    // Concept can mix images + video clips; need 5 items total.
    return nameOk && form.value.conceptTags.length > 0 && (selectedUuids.value.size + selectedClips.value.size) >= 5
  }
  return nameOk && !!form.value.subjectUuid && selectedUuids.value.size >= 5
})

// Leetspeak-ish token so the trigger isn't a word the model already knows.
const leet = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .replace(/a/g, '4').replace(/e/g, '3').replace(/i/g, '1').replace(/o/g, '0')
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

const setMode = (mode: 'character' | 'concept') => {
  if (form.value.mode === mode) return
  form.value.mode = mode
  // Reset the source-specific bits + picker when switching modes.
  form.value.subjectUuid = undefined
  form.value.conceptTags = []
  tagQuery.value = ''
  tagSuggestions.value = []
  matchCount.value = null
  assessment.value = null
  conceptTab.value = 'images'
  conceptVideos.value = []
  selectedClips.value = new Map()
  scoredImages.value = []
  selectedUuids.value = new Set()
  searched.value = false
}

// ---- Concept tag autocomplete + multi-select ----
const fetchTagSuggestions = async () => {
  try {
    const res = await $fetch<{ tags: { tag: string; n: number }[] }>('/api/trainings/concept-tags', {
      query: { q: tagQuery.value.trim(), exclude: form.value.conceptTags.join(',') }
    })
    tagSuggestions.value = res.tags
  } catch {
    tagSuggestions.value = []
  }
}

const onTagQuery = () => {
  if (tagQueryTimer) clearTimeout(tagQueryTimer)
  if (!tagQuery.value.trim()) { tagSuggestions.value = []; return }
  tagQueryTimer = setTimeout(fetchTagSuggestions, 200)
}

const suggestName = () => {
  const joined = form.value.conceptTags.join('_')
  if (!joined) return
  if (!form.value.loraName) form.value.loraName = `${slug(joined)}_pos_wan22`
  if (!form.value.triggerWord) form.value.triggerWord = `${leet(joined)}_pos`
}

const addTag = (tag: string) => {
  const t = tag.trim()
  if (t && !form.value.conceptTags.includes(t)) form.value.conceptTags.push(t)
  tagQuery.value = ''
  tagSuggestions.value = []
  suggestName()
}

const addTypedTag = () => {
  // Prefer the top suggestion if the dropdown is open, else add the raw text.
  if (tagSuggestions.value.length) addTag(tagSuggestions.value[0].tag)
  else if (tagQuery.value.trim()) addTag(tagQuery.value)
}

const removeTag = (tag: string) => {
  form.value.conceptTags = form.value.conceptTags.filter(t => t !== tag)
}

const onSubjectChange = async (subjectUuid: string | undefined) => {
  scoredImages.value = []
  selectedUuids.value = new Set()
  searched.value = false
  if (!subjectUuid) return

  // Suggest a name/trigger from the subject if untouched
  const subject = subjectItems.value.find(s => s.value === subjectUuid)
  if (subject && !form.value.loraName) {
    const s = slug(subject.label)
    form.value.loraName = `${s}_wan22`
    if (!form.value.triggerWord) form.value.triggerWord = `${leet(subject.label)}_person`
  }

  loadingImages.value = true
  try {
    const response = await $fetch<{ images: any[] }>('/api/trainings/score-images', {
      query: { subject_uuid: subjectUuid }
    })
    scoredImages.value = response.images
    searched.value = true
    // No auto-selection — images are curated by hand for diversity.
  } catch (error: any) {
    toast.add({ title: 'Failed to score images', description: error?.message, color: 'error' })
  } finally {
    loadingImages.value = false
  }
}

const onTagSearch = async () => {
  // Fold a still-typed tag into the selection before searching.
  if (tagQuery.value.trim()) addTypedTag()
  if (form.value.conceptTags.length === 0) return
  scoredImages.value = []
  selectedUuids.value = new Set()
  suggestName()

  loadingImages.value = true
  loadingVideos.value = true
  // Fetch images (with assessment) and videos in parallel.
  const imgP = $fetch<{ images: any[]; assessment: any }>('/api/trainings/score-concept-images', {
    query: { tags: form.value.conceptTags.join(','), goal: form.value.goalImages }
  }).then((r) => {
    scoredImages.value = r.images
    assessment.value = r.assessment
    selectedUuids.value = new Set(r.assessment?.preselect || [])
  }).catch((error: any) => {
    toast.add({ title: 'Failed to search images', description: error?.data?.statusMessage || error?.message, color: 'error' })
  }).finally(() => { loadingImages.value = false })

  const vidP = $fetch<{ videos: any[] }>('/api/trainings/score-concept-videos', {
    query: { tags: form.value.conceptTags.join(',') }
  }).then((r) => {
    conceptVideos.value = r.videos
    // Keep only clip selections that still match the new search.
    const ids = new Set(r.videos.map((v: any) => v.uuid))
    const kept = new Map(Array.from(selectedClips.value).filter(([id]) => ids.has(id)))
    selectedClips.value = kept
  }).catch(() => { conceptVideos.value = [] }).finally(() => { loadingVideos.value = false })

  await Promise.allSettled([imgP, vidP])
  searched.value = true
}

const toggleImage = (img: any) => {
  if (selectedUuids.value.has(img.uuid)) {
    selectedUuids.value.delete(img.uuid)
  } else {
    selectedUuids.value.add(img.uuid)
  }
  // Reassign so the Set change is reactive
  selectedUuids.value = new Set(selectedUuids.value)
}

const createTraining = async () => {
  creating.value = true
  try {
    await $fetch('/api/trainings', {
      method: 'POST',
      body: {
        kind: form.value.mode,
        subject_uuid: form.value.mode === 'character' ? form.value.subjectUuid : undefined,
        concept_tags: form.value.mode === 'concept' ? form.value.conceptTags : undefined,
        video_clips: form.value.mode === 'concept' ? Array.from(selectedClips.value.values()) : undefined,
        lora_name: form.value.loraName,
        trigger_word: form.value.triggerWord.trim(),
        image_uuids: [...selectedUuids.value],
        config: { epochs: form.value.epochs, rank: form.value.rank, checkpoint_minutes: form.value.checkpointMinutes }
      }
    })
    toast.add({ title: 'Training queued', description: 'The dataset was exported; it will start when the GPU frees up.', color: 'success' })
    isOpen.value = false
    resetForm()
    emit('created')
  } catch (error: any) {
    toast.add({ title: 'Failed to queue training', description: error?.data?.statusMessage || error?.message, color: 'error' })
  } finally {
    creating.value = false
  }
}

const resetForm = () => {
  form.value = { mode: 'character', subjectUuid: undefined, conceptTags: [], loraName: '', triggerWord: '', epochs: 40, rank: 32, checkpointMinutes: 15, goalImages: 40 }
  tagQuery.value = ''
  tagSuggestions.value = []
  matchCount.value = null
  assessment.value = null
  conceptTab.value = 'images'
  conceptVideos.value = []
  selectedClips.value = new Map()
  scoredImages.value = []
  selectedUuids.value = new Set()
  searched.value = false
}

// Make sure the subject dropdown has data when the modal opens
watch(isOpen, (open) => { if (open) getSubjects() })
</script>
