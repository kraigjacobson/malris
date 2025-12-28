<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile">
    <template #header>
      <div class="flex items-center justify-between w-full gap-3">
        <h3 class="text-lg sm:text-xl font-semibold">Job Details</h3>
        <div v-if="hasMultipleJobs && currentJobInfo" class="text-base sm:text-sm text-gray-600 dark:text-gray-400 font-medium">Job {{ currentJobInfo.current }} of {{ currentJobInfo.total }}</div>
        <UButton variant="ghost" :size="isMobile ? 'xl' : 'lg'" icon="i-heroicons-x-mark" @click="closeModal" class="flex-shrinkz-0" />
      </div>
    </template>

    <template #body>
      <div v-if="job" class="space-y-4 h-[600px] overflow-y-auto custom-scrollbar" @touchstart="handleGestureTouchStart" @touchmove="handleGestureTouchMove" @touchend="handleGestureTouchEnd">
        <!-- Main Video Display Section-->
        <div v-if="displayImages && (job.output_uuid || job.dest_media_uuid)" class="text-center">
          <!-- Main Video Container with Arrow Overlays -->
          <div class="relative w-full group">
            <!-- Video Container with Full Width -->
            <div ref="videoContainer" class="relative overflow-hidden rounded-lg shadow-lg w-full bg-gray-100 dark:bg-gray-800 aspect-auto">
              <!-- Show output video if it exists, job is completed, and toggle is on -->
              <template v-if="job.output_uuid && job.status === 'completed'">
                <MediaCard v-show="showingOutputVideo" :key="`output-${job.output_uuid}`" :media="{ uuid: job.output_uuid, type: 'video', thumbnail_uuid: job.output_thumbnail_uuid, filename: 'Output video', rating: outputRating, job_id: job.id }" :show-duration="false" :show-delete="false" :autoplay="true" :show-controls="true" aspect-ratio="auto" @click="() => {}" @rating-updated="handleOutputRatingUpdate" class="!rounded-none" />
              </template>

              <!-- Show dest video for queued jobs OR when toggle is off OR no output exists -->
              <template v-if="job.dest_media_uuid">
                <MediaCard v-show="job.status === 'queued' || !job.output_uuid || !showingOutputVideo" :key="`dest-${job.dest_media_uuid}`" :media="{ uuid: job.dest_media_uuid, type: 'video', thumbnail_uuid: job.dest_media_thumbnail_uuid, filename: 'Destination video', rating: destRating }" :show-duration="false" :show-delete="false" :autoplay="true" :show-controls="true" aspect-ratio="auto" @click="() => {}" @rating-updated="handleDestRatingUpdate" class="!rounded-none" />
              </template>
            </div>

            <!-- Navigation Buttons - Only on non-mobile -->
            <!-- Left side: Previous button only -->
            <div v-if="!isMobile && hasMultipleJobs" class="absolute top-0 left-0 h-full flex items-center z-40">
              <div class="flex flex-col gap-3 pl-4">
                <UButton variant="solid" color="white" icon="i-heroicons-chevron-left" size="lg" @click="goToPreviousJob" />
              </div>
            </div>

            <!-- Right side: Next button only -->
            <div v-if="!isMobile && hasMultipleJobs" class="absolute top-0 right-0 h-full flex items-center z-40">
              <div class="flex flex-col gap-3 pr-4">
                <UButton variant="solid" color="white" icon="i-heroicons-chevron-right" size="lg" @click="goToNextJob" />
              </div>
            </div>

            <!-- Job Counter -->
            <div v-if="hasMultipleJobs" class="absolute top-2 left-2">
              <div class="bg-black bg-opacity-70 text-white text-sm font-medium px-2 py-1 rounded">{{ currentJobInfo.current }}/{{ currentJobInfo.total }}</div>
            </div>

            <!-- Video Type Toggle Button -->
            <div class="absolute top-2 right-2">
              <UButton v-if="job.output_uuid && job.dest_media_uuid" :color="showingOutputVideo ? 'primary' : 'gray'" variant="solid" size="sm" :icon="showingOutputVideo ? 'i-heroicons-film' : 'i-heroicons-video-camera'" @click="toggleVideoType" class="opacity-80 hover:opacity-100 transition-opacity" :title="showingOutputVideo ? 'Show Destination Video' : 'Show Output Video'" />
            </div>
          </div>
        </div>

        <!-- Thumbnails Section (only show when displayImages is true) -->
        <div v-if="displayImages" class="space-y-3">
          <h4 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Media Thumbnails</h4>
          <div class="flex gap-2 sm:gap-4">
            <!-- Subject Thumbnail -->
            <div v-if="job.subject_thumbnail_uuid" class="flex-1 min-w-0">
              <div class="mb-1 sm:mb-2 text-center">
                <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Subject</span>
              </div>
              <MediaCard :key="`subject-${job.subject_thumbnail_uuid}`" :media="{ uuid: job.subject_thumbnail_uuid, type: 'image', thumbnail: `/api/media/${job.subject_thumbnail_uuid}/image`, filename: 'Subject thumbnail' }" :show-duration="false" :show-delete="false" aspect-ratio="3/4" @click="() => {}" />
            </div>

            <!-- Source Image Thumbnail -->
            <div v-if="job.source_media_thumbnail_uuid" class="flex-1 min-w-0">
              <div class="mb-1 sm:mb-2 text-center">
                <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Source Image</span>
              </div>
              <MediaCard :key="`source-${job.source_media_thumbnail_uuid}`" :media="{ uuid: job.source_media_thumbnail_uuid, type: 'image', thumbnail: `/api/media/${job.source_media_thumbnail_uuid}/image`, filename: 'Source image thumbnail' }" :show-duration="false" :show-delete="false" aspect-ratio="3/4" @click="() => {}" />
            </div>

            <!-- Destination Media Thumbnail (don't show for queued jobs since it's the main video) -->
            <div v-if="(job.dest_media_thumbnail_uuid || job.dest_media_uuid) && job.status !== 'queued'" class="flex-1 min-w-0">
              <div class="mb-1 sm:mb-2 text-center">
                <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Destination Video</span>
              </div>
              <MediaCard :key="`dest-thumb-${job.dest_media_uuid}`" :media="{ uuid: job.dest_media_uuid, type: 'video', thumbnail_uuid: job.dest_media_thumbnail_uuid, filename: 'Destination video', rating: destRating }" :show-duration="false" :show-delete="false" :autoplay="true" aspect-ratio="3/4" @click="() => {}" @rating-updated="handleDestRatingUpdate" />
            </div>

            <!-- Output Video Thumbnail (don't show for queued jobs) -->
            <div v-if="job.output_uuid && job.status !== 'queued'" class="flex-1 min-w-0">
              <div class="mb-1 sm:mb-2 text-center">
                <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Output Video</span>
              </div>
              <MediaCard :key="`output-thumb-${job.output_uuid}`" :media="{ uuid: job.output_uuid, type: 'video', thumbnail_uuid: job.output_thumbnail_uuid, filename: 'Output video', rating: outputRating, job_id: job.id }" :show-duration="false" :show-delete="false" :autoplay="true" aspect-ratio="3/4" @click="() => {}" @rating-updated="handleOutputRatingUpdate" />
            </div>
          </div>

          <!-- Job Output Images Section (for need_input status, only show when displayImages is true) -->
          <div v-if="job.status === 'need_input' && jobOutputImages.length > 0 && displayImages" class="mt-6">
            <h4 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-3">Generated Images</h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
              <MediaCard v-for="image in jobOutputImages" :key="image.uuid" :media="image" :show-duration="false" :show-delete="false" aspect-ratio="square" @click="$emit('open-image-fullscreen', image)" />
            </div>
          </div>
        </div>

        <!-- Job Details Accordion -->
        <div class="mt-4">
          <UAccordion :items="jobDetailsAccordionItems" :default-open="defaultAccordionOpen">
            <template #job-details>
              <div class="space-y-3 text-left">
                <!-- Basic Info Grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                    <UBadge :color="getStatusColor(job.status)" size="sm">
                      {{ job.status }}
                    </UBadge>
                  </div>
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ job.job_type }}</span>
                  </div>
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Progress</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ job.progress || 0 }}%</span>
                  </div>
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Created</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(job.created_at) }}</span>
                  </div>
                  <div v-if="job.updated_at" class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Updated</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(job.updated_at) }}</span>
                  </div>
                  <div v-if="job.completed_at" class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Completed</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(job.completed_at) }}</span>
                  </div>
                </div>

                <!-- ID -->
                <div class="flex flex-col space-y-1">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ID</span>
                  <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ job.id }}</span>
                </div>

                <!-- UUIDs Grid -->
                <div v-if="job.source_media_uuid || job.dest_media_uuid || job.subject_uuid || job.output_uuid" class="space-y-2">
                  <div v-if="job.subject_uuid" class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Subject UUID</span>
                    <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ job.subject_uuid }}</span>
                  </div>
                  <div v-if="job.source_media_uuid" class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Source UUID</span>
                    <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ job.source_media_uuid }}</span>
                  </div>
                  <div v-if="job.dest_media_uuid" class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Destination UUID</span>
                    <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ job.dest_media_uuid }}</span>
                  </div>
                  <div v-if="job.output_uuid" class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Output UUID</span>
                    <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ job.output_uuid }}</span>
                  </div>
                </div>
              </div>
            </template>
          </UAccordion>
        </div>

        <div v-if="job.error_message" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
          <span class="font-medium text-red-700 dark:text-red-300">Error:</span>
          <p class="mt-1 text-sm text-red-600 dark:text-red-400">{{ job.error_message }}</p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between items-center w-full">
        <div class="flex gap-2">
          <!-- Job Navigation Buttons -->
          <div v-if="hasMultipleJobs" class="flex gap-2">
            <UButton variant="outline" size="lg" @click="goToPreviousJob" square class="w-12 h-12 flex items-center justify-center">
              <UIcon name="i-heroicons-chevron-left" class="w-6 h-6" />
            </UButton>
            <UButton variant="outline" size="lg" @click="goToNextJob" square class="w-12 h-12 flex items-center justify-center">
              <UIcon name="i-heroicons-chevron-right" class="w-6 h-6" />
            </UButton>
          </div>
        </div>
        <div v-if="job" class="flex gap-2">
          <UButton v-if="job && ['queued', 'active', 'need_input'].includes(job.status)" color="error" variant="outline" icon="i-heroicons-x-mark" size="lg" @click="$emit('cancel-job')" class="h-12"><span class="hidden sm:inline">Cancel</span></UButton>
          <UButton v-if="job && ['canceled', 'failed', 'completed', 'need_input'].includes(job.status)" color="primary" variant="outline" icon="i-heroicons-arrow-path" size="lg" @click="$emit('retry-job')" class="h-12"><span class="hidden sm:inline">Retry</span></UButton>
          <UButton v-if="job" color="error" variant="outline" icon="i-heroicons-trash" size="lg" @click="$emit('delete-job')" class="h-12"><span class="hidden sm:inline">Delete</span></UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSettings } from '~/composables/useSettings'

// Use Nuxt's device detection
const { isMobile } = useDevice()

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  job: {
    type: Object,
    default: null
  },
  jobOutputImages: {
    type: Array,
    default: () => []
  },
  jobsList: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'cancel-job', 'retry-job', 'delete-job', 'open-image-fullscreen', 'job-changed'])

const { displayImages } = useSettings()

// Job navigation gesture handling
const {
  handleTouchStart: handleGestureTouchStart,
  handleTouchMove: handleGestureTouchMove,
  handleTouchEnd: handleGestureTouchEnd
} = useGesture({
  minSwipeDistance: 50,
  onSwipeLeft: () => {
    if (hasMultipleJobs.value) {
      goToNextJob()
    }
  },
  onSwipeRight: () => {
    if (hasMultipleJobs.value) {
      goToPreviousJob()
    }
  },
  debug: false
})

const showingOutputVideo = ref(true) // Default to showing output video
const videoContainer = ref(null)

// Rating state
const outputRating = ref(null)
const destRating = ref(null)

// Job navigation state
const currentJobIndex = ref(0)

// Modal state
const isOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})

// Job navigation computed properties
const hasMultipleJobs = computed(() => props.jobsList.length > 1)
const currentJobInfo = computed(() => {
  if (props.jobsList.length === 0) return null
  return {
    current: currentJobIndex.value + 1,
    total: props.jobsList.length
  }
})

// Job details accordion items with conditional default open
const jobDetailsAccordionItems = computed(() => {
  return [
    {
      label: 'Job Details',
      slot: 'job-details'
    }
  ]
})

// Default accordion open state - open when images are disabled
const defaultAccordionOpen = computed(() => {
  return !displayImages.value ? [0] : []
})

// Status color helper
const getStatusColor = status => {
  switch (status?.toLowerCase()) {
    case 'queued':
      return 'warning'
    case 'active':
      return 'info'
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'cancelled':
      return 'neutral'
    case 'need_input':
      return 'warning'
    default:
      return 'neutral'
  }
}

// Date formatting helper
const formatDate = dateString => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString()
}

// Job navigation methods
const goToPreviousJob = () => {
  if (props.jobsList.length > 1) {
    if (currentJobIndex.value > 0) {
      currentJobIndex.value--
    } else {
      // Wrap to last job
      currentJobIndex.value = props.jobsList.length - 1
    }
    const newJob = props.jobsList[currentJobIndex.value]
    emit('job-changed', newJob)
  }
}

const goToNextJob = () => {
  if (props.jobsList.length > 1) {
    if (currentJobIndex.value < props.jobsList.length - 1) {
      currentJobIndex.value++
    } else {
      // Wrap to first job
      currentJobIndex.value = 0
    }
    const newJob = props.jobsList[currentJobIndex.value]
    emit('job-changed', newJob)
  }
}

const toggleVideoType = () => {
  showingOutputVideo.value = !showingOutputVideo.value
}

const closeModal = () => {
  emit('update:modelValue', false)
}

// Keyboard navigation
const handleKeydown = event => {
  // Only handle keys when modal is open
  if (!isOpen.value) return

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      if (hasMultipleJobs.value) {
        goToPreviousJob()
      }
      break
    case 'ArrowRight':
      event.preventDefault()
      if (hasMultipleJobs.value) {
        goToNextJob()
      }
      break
    case 'Escape':
      event.preventDefault()
      closeModal()
      break
  }
}

// Add global keyboard event listener when modal opens
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// Reset video states when modal opens/closes
watch(isOpen, newValue => {
  if (!newValue) {
    showingOutputVideo.value = true
  }
})

// Rating update handlers
const handleOutputRatingUpdate = rating => {
  outputRating.value = rating
}

const handleDestRatingUpdate = rating => {
  destRating.value = rating
}

// Fetch rating for output video
const fetchOutputRating = async outputUuid => {
  if (!outputUuid) {
    outputRating.value = null
    return
  }

  try {
    const response = await useApiFetch(`media/${outputUuid}/info`)
    outputRating.value = response.rating || null
  } catch (error) {
    console.error('🌟 [RATING DEBUG] Failed to fetch output rating:', error)
    outputRating.value = null
  }
}

// Fetch rating for destination video
const fetchDestRating = async destUuid => {
  if (!destUuid) {
    destRating.value = null
    return
  }

  try {
    const response = await useApiFetch(`media/${destUuid}/info`)
    destRating.value = response.rating || null
  } catch (error) {
    console.error('🌟 [RATING DEBUG] Failed to fetch dest rating:', error)
    destRating.value = null
  }
}

// Reset video states when job changes
watch(
  () => props.job,
  async newJob => {
    // Always default to showing output video (dest will show if no output exists)
    showingOutputVideo.value = true

    // Fetch rating for output video
    if (newJob?.output_uuid) {
      await fetchOutputRating(newJob.output_uuid)
    } else {
      console.log('🌟 [RATING DEBUG] Job has no output_uuid, setting rating to null')
      outputRating.value = null
    }

    // Fetch rating for destination video
    if (newJob?.dest_media_uuid) {
      await fetchDestRating(newJob.dest_media_uuid)
    } else {
      destRating.value = null
    }

    // Update current job index based on the new job
    if (newJob && props.jobsList.length > 0) {
      const jobIndex = props.jobsList.findIndex(job => job.id === newJob.id)
      if (jobIndex !== -1) {
        currentJobIndex.value = jobIndex
      }
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.custom-scrollbar {
  scrollbar-width: none;
  /* Firefox */
  -ms-overflow-style: none;
  /* Internet Explorer 10+ */
}

.custom-scrollbar::-webkit-scrollbar {
  display: none;
  /* Safari and Chrome */
}
</style>
