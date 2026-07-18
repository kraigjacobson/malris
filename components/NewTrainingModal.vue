<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile" :ui="{ content: 'max-w-3xl' }">
    <template #header>
      <h3 class="text-lg font-semibold">New LoRA Training</h3>
    </template>

    <template #body>
      <div class="space-y-4">
        <!-- Subject -->
        <div>
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
        <div v-if="form.subjectUuid">
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium">
              Training images
              <span class="text-gray-500">({{ selectedUuids.size }} selected)</span>
            </label>
            <div class="flex items-center gap-2">
              <UButton size="xs" variant="ghost" @click="preselect(25)">Top 25</UButton>
              <UButton size="xs" variant="ghost" @click="preselect(35)">Top 35</UButton>
              <UButton size="xs" variant="ghost" @click="selectedUuids.clear()">Clear</UButton>
            </div>
          </div>
          <p class="text-xs text-gray-500 mb-2">
            Ordered by diversity (varied angles/expressions first, scored by face + resolution + rating).
            Grayed images have no detected face and are excluded from ordering.
          </p>

          <div v-if="loadingImages" class="flex justify-center py-8">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl text-gray-400" />
          </div>
          <div v-else-if="scoredImages.length === 0" class="text-center py-8 text-gray-500 text-sm">
            No source images found for this subject.
          </div>
          <div v-else class="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-96 overflow-y-auto pr-1">
            <div v-for="img in scoredImages" :key="img.uuid" class="relative" :class="{ 'opacity-40': !img.hasFace }">
              <MediaItem
                :media="{ uuid: img.uuid, type: 'image', filename: img.filename, width: img.width, height: img.height }"
                image-size="thumbnail"
                aspect="square"
                selectable
                :selected="selectedUuids.has(img.uuid)"
                @click="toggleImage(img)"
              />
              <span class="absolute bottom-1 left-1 z-30 bg-black/70 text-white text-[10px] px-1 rounded">
                {{ img.viability }}
              </span>
            </div>
          </div>
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
</template>

<script setup lang="ts">
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
  subjectUuid: undefined as string | undefined,
  loraName: '',
  triggerWord: '',
  epochs: 40,
  rank: 32,
  checkpointMinutes: 30
})

const close = () => {
  isOpen.value = false
}

const scoredImages = ref<any[]>([])
const selectedUuids = ref(new Set<string>())
const loadingImages = ref(false)
const creating = ref(false)

const canCreate = computed(() =>
  !!form.value.subjectUuid &&
  /^[A-Za-z0-9_-]+$/.test(form.value.loraName) &&
  !!form.value.triggerWord.trim() &&
  selectedUuids.value.size >= 5
)

const onSubjectChange = async (subjectUuid: string | undefined) => {
  scoredImages.value = []
  selectedUuids.value = new Set()
  if (!subjectUuid) return

  // Suggest a name/trigger from the subject if untouched
  const subject = subjectItems.value.find(s => s.value === subjectUuid)
  if (subject && !form.value.loraName) {
    const slug = subject.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    form.value.loraName = `${slug}_wan22`
    if (!form.value.triggerWord) {
      // Leetspeak-ish trigger so it's not a token the model already knows
      form.value.triggerWord = `${slug.replace(/a/g, '4').replace(/e/g, '3')}_person`
    }
  }

  loadingImages.value = true
  try {
    const response = await $fetch<{ images: any[] }>('/api/trainings/score-images', {
      query: { subject_uuid: subjectUuid }
    })
    scoredImages.value = response.images
    preselect(30)
  } catch (error: any) {
    toast.add({ title: 'Failed to score images', description: error?.message, color: 'error' })
  } finally {
    loadingImages.value = false
  }
}

// Preselect the first N usable images in diversity order (list arrives sorted)
const preselect = (n: number) => {
  selectedUuids.value = new Set(
    scoredImages.value.filter(i => i.hasFace).slice(0, n).map(i => i.uuid)
  )
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
        subject_uuid: form.value.subjectUuid,
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
  form.value = { subjectUuid: undefined, loraName: '', triggerWord: '', epochs: 40, rank: 32, checkpointMinutes: 30 }
  scoredImages.value = []
  selectedUuids.value = new Set()
}

// Make sure the subject dropdown has data when the modal opens
watch(isOpen, (open) => { if (open) getSubjects() })
</script>
