<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'sm:max-w-4xl' }">
    <template #body>
      <div v-if="media" class="p-3 sm:p-6">
        <!-- Header -->
        <div class="flex justify-between items-center mb-3 sm:mb-6">
          <h3 class="text-base sm:text-lg font-semibold truncate pr-2">Rapid Tag Editor</h3>
          <div class="flex items-center gap-1 sm:gap-2 shrink-0">
            <span v-if="currentIndex !== undefined && totalCount !== undefined" class="text-xs sm:text-sm text-neutral-500 hidden sm:inline">
              {{ currentIndex + 1 }} / {{ totalCount }}
            </span>
            <UButton
              variant="ghost"
              icon="i-heroicons-x-mark"
              size="xs"
              @click="closeModal"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Media Display -->
          <div class="space-y-4">
            <div class="flex justify-center">
              <div class="max-w-md w-full">
                <img
                  v-if="media.type === 'image'"
                  :src="media.thumbnail || `/api/media/${media.uuid}/image?size=md`"
                  :alt="media.filename"
                  class="w-full h-auto max-h-96 object-contain rounded-lg shadow-md"
                  @error="handleImageError"
                >
                <div v-else-if="media.type === 'video'" class="relative">
                  <video
                    v-if="media.thumbnail_uuid"
                    :poster="media.thumbnail || `/api/media/${media.thumbnail_uuid}/image?size=md`"
                    class="w-full h-auto max-h-96 object-contain rounded-lg shadow-md"
                    controls
                    preload="metadata"
                  >
                    <source :src="`/api/stream/${media.uuid}`" type="video/mp4">
                    Your browser does not support the video tag.
                  </video>
                  <div v-else class="w-full h-64 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
                    <UIcon name="i-heroicons-play-circle" class="text-6xl text-neutral-400" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Media Info -->
            <div class="text-center">
              <h4 class="font-medium text-neutral-900 dark:text-white truncate">{{ media.filename }}</h4>
              <p class="text-sm text-neutral-500">{{ media.type }} • {{ media.purpose }}</p>
            </div>

            <!-- Navigation Buttons -->
            <div class="flex justify-between items-center">
              <UButton
                :disabled="!hasPrevious"
                variant="outline"
                icon="i-heroicons-chevron-left"
                @click="navigatePrevious"
              >
                Previous
              </UButton>
              
              <UButton
                color="primary"
                :loading="isSaving"
                @click="saveTags"
              >
                Save
              </UButton>

              <UButton
                :disabled="!hasNext"
                variant="outline"
                trailing-icon="i-heroicons-chevron-right"
                @click="navigateNext"
              >
                Next
              </UButton>
            </div>
          </div>

          <!-- Tag Selection Panel -->
          <div class="space-y-6">
            <!-- Quick Tags -->
            <div>
              <h5 class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">Quick Tags</h5>
              <div class="space-y-2">
                <!-- Hair Color Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="tag in hairColorTags"
                    :key="tag"
                    variant="solid"
                    :color="selectedTags.includes(tag) ? 'primary' : 'neutral'"
                    size="sm"
                    @click="toggleTag(tag)"
                  >
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>
                
                <!-- Age/Body Type Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="tag in ageBodyTags"
                    :key="tag"
                    variant="solid"
                    :color="selectedTags.includes(tag) ? 'primary' : 'neutral'"
                    size="sm"
                    @click="toggleTag(tag)"
                  >
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>
                
                <!-- Action/Other Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="tag in actionTags"
                    :key="tag"
                    variant="solid"
                    :color="selectedTags.includes(tag) ? 'primary' : 'neutral'"
                    size="sm"
                    @click="toggleTag(tag)"
                  >
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>
              </div>
            </div>

            <!-- Current Tags Display -->
            <div>
              <h5 class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">Current Tags</h5>
              <UInputTags
                v-model="selectedTags"
                :ui="{ trailing: 'pe-1' }"
              >
                <template #trailing>
                  <UButton
                    v-if="selectedTags.length > 0"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-x-mark"
                    @click="clearAllTags"
                  />
                </template>
              </UInputTags>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-else class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  media: {
    type: Object,
    default: null
  },
  currentIndex: {
    type: Number,
    default: undefined
  },
  totalCount: {
    type: Number,
    default: undefined
  },
  hasNext: {
    type: Boolean,
    default: false
  },
  hasPrevious: {
    type: Boolean,
    default: false
  },
  showSkipButton: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'save', 'skip', 'close', 'navigate'])

// Reactive data
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const selectedTags = ref([])
const originalTags = ref([])
const isSaving = ref(false)
const settingsStore = useSettingsStore()

// Predefined quick tags organized by category
const hairColorTags = ['ginger', 'blonde', 'brunette', 'colored_hair', 'braid', 'bangs']
const ageBodyTags = ['teen', 'milf', 'chub']
const actionTags = ['rough', 'ass', 'bj', 'multi', 'rule34']

// Computed to check if tags have changed
const hasChanges = computed(() => {
  if (selectedTags.value.length !== originalTags.value.length) return true
  return !selectedTags.value.every(tag => originalTags.value.includes(tag))
})

// Watch for media changes to update tags
watch(() => props.media, (newMedia) => {
  if (newMedia) {
    // Extract tags from the media object
    const tags = newMedia.tags?.tags || []
    selectedTags.value = [...tags]
    originalTags.value = [...tags]
  } else {
    selectedTags.value = []
    originalTags.value = []
  }
}, { immediate: true })

// Methods
const handleImageError = (event) => {
  console.error('Image failed to load:', event.target.src)
  // Hide the broken image
  event.target.style.display = 'none'
}

const formatTagDisplay = (tag) => {
  // Convert underscores to spaces and capitalize
  return tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const toggleTag = (tag) => {
  const index = selectedTags.value.indexOf(tag)
  if (index > -1) {
    selectedTags.value.splice(index, 1)
  } else {
    selectedTags.value.push(tag)
  }
}

const clearAllTags = () => {
  selectedTags.value = []
}

const navigatePrevious = async () => {
  if (hasChanges.value) {
    await saveTags()
  }
  emit('navigate', -1)
}

const navigateNext = async () => {
  if (hasChanges.value) {
    await saveTags()
  }
  emit('navigate', 1)
}

const saveTags = async () => {
  if (!props.media) return
  
  // Only save if there are changes
  if (!hasChanges.value) return
  
  isSaving.value = true
  
  try {
    await emit('save', {
      uuid: props.media.uuid,
      tags: selectedTags.value
    })
    
    // Update original tags after successful save
    originalTags.value = [...selectedTags.value]
  } finally {
    isSaving.value = false
  }
}

const closeModal = () => {
  emit('close')
}

// Initialize settings on mount
onMounted(async () => {
  await settingsStore.initializeSettings()
})
</script>