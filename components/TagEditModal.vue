<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'sm:max-w-2xl' }">
    <template #body>
      <div v-if="media" class="p-3 sm:p-6">
        <!-- Header -->
        <div class="flex justify-between items-center mb-3 sm:mb-6">
          <h3 class="text-base sm:text-lg font-semibold truncate pr-2">Edit Tags</h3>
          <div class="flex items-center gap-1 sm:gap-2 shrink-0">
            <span v-if="currentIndex !== undefined && totalCount !== undefined" class="text-xs sm:text-sm text-gray-500 hidden sm:inline">
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

        <div class="space-y-4">
          <!-- Image Display -->
          <div class="flex justify-center">
            <div class="max-w-md">
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
                <div v-else class="w-full h-64 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                  <UIcon name="i-heroicons-play-circle" class="text-6xl text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          <!-- Media Info -->
          <div class="text-center">
            <h4 class="font-medium text-gray-900 dark:text-white truncate">{{ media.filename }}</h4>
            <p class="text-sm text-gray-500">{{ media.type }} • {{ media.purpose }}</p>
          </div>

          <!-- Hair Tags Input -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Hair Tags
            </label>
            <UInputTags
              v-model="hairTags"
              placeholder="Add hair tags (e.g., long_hair, blonde_hair, twintails)"
              class="w-full"
              :ui="{
                input: 'w-full',
                tag: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800'
              }"
            />
            <p class="text-xs text-gray-500 mt-1">
              Hair-related tags (containing "hair" or common hair styles)
            </p>
          </div>

          <!-- Other Tags Input -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Other Tags
            </label>
            <UInputTags
              v-model="otherTags"
              placeholder="Add other tags (e.g., 1girl, anime, school_uniform)"
              class="w-full"
              :ui="{
                input: 'w-full',
                tag: 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 border-pink-200 dark:border-pink-800'
              }"
            />
            <p class="text-xs text-gray-500 mt-1">
              All other tags (non-hair related)
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex justify-between gap-3">
            <UButton
              variant="outline"
              color="gray"
              @click="closeModal"
            >
              Cancel
            </UButton>
            
            <div class="flex gap-2">
              <UButton
                v-if="showSkipButton"
                variant="outline"
                color="yellow"
                @click="skipCurrent"
              >
                Skip
              </UButton>
              <UButton
                color="primary"
                :loading="isSaving"
                @click="saveTags"
              >
                Save & {{ hasNext ? 'Next' : 'Close' }}
              </UButton>
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
  showSkipButton: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'save', 'skip', 'close'])

// Reactive data
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const hairTags = ref([])
const otherTags = ref([])
const isSaving = ref(false)
const settingsStore = useSettingsStore()

// Helper function to check if a tag is hair-related
const isHairTag = (tag) => {
  const lowerTag = tag.toLowerCase()
  return lowerTag.includes('black_hair') ||
         lowerTag.includes('blonde_hair') ||
         lowerTag.includes('brown_hair') ||
         lowerTag.includes('curly_hair') ||
         lowerTag.includes('grey_hair') ||
         lowerTag.includes('orange_hair') ||
         lowerTag.includes('red_hair') ||
         lowerTag.includes('ginger_hair') ||
         lowerTag.includes('braid') ||
         lowerTag.includes('bangs')
}

// Watch for media changes to update tags
watch(() => props.media, (newMedia) => {
  if (newMedia) {
    // Extract tags from the media object
    const tags = newMedia.tags?.tags || []
    
    // Separate hair tags from other tags
    const hairRelated = []
    const otherRelated = []
    
    tags.forEach(tag => {
      if (isHairTag(tag)) {
        hairRelated.push(tag)
      } else {
        otherRelated.push(tag)
      }
    })
    
    hairTags.value = [...hairRelated]
    otherTags.value = [...otherRelated]
  } else {
    hairTags.value = []
    otherTags.value = []
  }
}, { immediate: true })

// Methods
const handleImageError = (event) => {
  console.error('Image failed to load:', event.target.src)
  // Hide the broken image
  event.target.style.display = 'none'
}

const saveTags = async () => {
  if (!props.media) return
  
  isSaving.value = true
  
  try {
    // Concatenate hair tags and other tags
    const allTags = [...hairTags.value, ...otherTags.value]
    
    await emit('save', {
      uuid: props.media.uuid,
      tags: allTags
    })
  } finally {
    isSaving.value = false
  }
}

const skipCurrent = () => {
  emit('skip')
}

const closeModal = () => {
  emit('close')
}

// Initialize settings on mount
onMounted(async () => {
  await settingsStore.initializeSettings()
})
</script>