<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-semibold">Job Details</h3>
        <div v-if="hasMultipleJobs && currentJobInfo" class="text-sm text-gray-600 dark:text-gray-400 font-medium">
          Job {{ currentJobInfo.current }} of {{ currentJobInfo.total }}
        </div>
        <UButton
          variant="ghost"
          size="lg"
          icon="i-heroicons-x-mark"
          @click="closeModal"
          class="ml-4"
        />
      </div>
    </template>
    
    <template #body>
      <div v-if="job" class="space-y-4 h-[600px] overflow-y-auto custom-scrollbar">
        
        <!-- Main Video Display Section -->
        <div v-if="displayImages && (job.output_uuid || job.dest_media_uuid)" class="text-center">
          <!-- Main Video Container with Arrow Overlays -->
          <div class="relative w-full group">
            <!-- Video Container with Full Width -->
            <div ref="videoContainer"
              class="relative overflow-hidden rounded-lg shadow-lg w-full bg-gray-100 dark:bg-gray-800">
              
              <!-- Main Video Player -->
              <video v-if="mainVideoUuid"
                class="w-full h-auto"
                controls
                autoplay
                muted
                loop
                :key="mainVideoUuid">
                <source :src="`/api/stream/${mainVideoUuid}`" type="video/mp4">
                Your browser does not support the video tag.
              </video>
              
              <!-- Fallback when no video available -->
              <div v-else class="w-full h-64 flex items-center justify-center">
                <div class="text-center">
                  <UIcon name="i-heroicons-film" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p class="text-gray-600 dark:text-gray-400">No video available</p>
                </div>
              </div>
            </div>

            <!-- Left Arrow Overlay -->
            <div v-if="hasMultipleJobs"
              class="absolute left-0 top-0 w-1/2 h-full flex items-center justify-start pl-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              @click="goToPreviousJob">
              <UIcon name="i-heroicons-chevron-left"
                class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
            </div>

            <!-- Right Arrow Overlay -->
            <div v-if="hasMultipleJobs"
              class="absolute right-0 top-0 w-1/2 h-full flex items-center justify-end pr-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              @click="goToNextJob">
              <UIcon name="i-heroicons-chevron-right"
                class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
            </div>

            <!-- Job Counter -->
            <div v-if="hasMultipleJobs" class="absolute top-2 left-2">
              <div class="bg-black bg-opacity-70 text-white text-sm font-medium px-2 py-1 rounded">
                {{ currentJobInfo.current }}/{{ currentJobInfo.total }}
              </div>
            </div>

            <!-- Video Type Toggle Button -->
            <div class="absolute top-2 right-2">
              <UButton
                v-if="job.output_uuid && job.dest_media_uuid"
                :color="showingOutputVideo ? 'primary' : 'gray'"
                variant="solid"
                size="sm"
                :icon="showingOutputVideo ? 'i-heroicons-film' : 'i-heroicons-video-camera'"
                @click="toggleVideoType"
                class="opacity-80 hover:opacity-100 transition-opacity"
                :title="showingOutputVideo ? 'Show Destination Video' : 'Show Output Video'" />
            </div>
          </div>
        </div>

        <!-- Thumbnails Section (only show when displayImages is true) -->
        <div v-if="displayImages" class="space-y-3">
          <h4 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Media Thumbnails</h4>
          <div class="flex flex-wrap gap-2 sm:gap-4 justify-center">
            <!-- Subject Thumbnail -->
            <div v-if="job.subject_thumbnail_uuid" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
              <div class="mb-1 sm:mb-2 text-center">
                <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Subject</span>
              </div>
              <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4]">
                <img
                  :src="`/api/media/${job.subject_thumbnail_uuid}/image`"
                  alt="Subject thumbnail"
                  class="w-full h-full object-cover object-top"
                />
              </div>
            </div>
            
            <!-- Source Image Thumbnail -->
            <div v-if="job.source_media_thumbnail_uuid" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
              <div class="mb-1 sm:mb-2 text-center">
                <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Source Image</span>
              </div>
              <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4]">
                <img
                  :src="`/api/media/${job.source_media_thumbnail_uuid}/image`"
                  alt="Source image thumbnail"
                  class="w-full h-full object-cover object-top"
                />
              </div>
            </div>
            
            <!-- Destination Media Thumbnail -->
            <div v-if="job.dest_media_thumbnail_uuid" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
              <div class="mb-1 sm:mb-2 text-center">
                <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Destination Video</span>
              </div>
              <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4] relative group">
                <!-- Show thumbnail first, then replace with video when ready -->
                <img
                  v-if="job.dest_media_thumbnail_uuid && (!destVideoReady)"
                  :src="`/api/media/${job.dest_media_thumbnail_uuid}/image`"
                  alt="Destination media thumbnail"
                  class="w-full h-full object-cover object-top"
                />
                <!-- Video player for destination video -->
                <video
                  v-if="job.dest_media_uuid"
                  :src="`/api/stream/${job.dest_media_uuid}`"
                  autoplay
                  loop
                  muted
                  class="w-full h-full object-cover object-top group-hover:[&::-webkit-media-controls]:opacity-100 [&::-webkit-media-controls]:opacity-0 [&::-webkit-media-controls]:transition-opacity"
                  preload="metadata"
                  controls
                  @loadeddata="destVideoReady = true"
                  @error="destVideoReady = false"
                >
                  <source :src="`/api/stream/${job.dest_media_uuid}`" type="video/mp4">
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
            
          </div>
          
          <!-- Job Output Images Section (for need_input status, only show when displayImages is true) -->
          <div v-if="job.status === 'need_input' && jobOutputImages.length > 0 && displayImages" class="mt-6">
            <h4 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-3">Generated Images</h4>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
              <div
                v-for="image in jobOutputImages"
                :key="image.uuid"
                class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-square relative group cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                @click="$emit('open-image-fullscreen', image)"
              >
                <img
                  v-if="image.thumbnail"
                  :src="image.thumbnail"
                  :alt="image.filename"
                  class="w-full h-full object-cover object-top"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-400" />
                </div>
                <!-- Overlay with filename -->
                <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {{ image.filename }}
                </div>
              </div>
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
          <UButton variant="outline" @click="closeModal">
            Close
          </UButton>
          <!-- Job Navigation Buttons -->
          <div v-if="hasMultipleJobs" class="flex gap-2">
            <UButton
              variant="outline"
              size="lg"
              @click="goToPreviousJob"
              square
              class="w-12 h-12 flex items-center justify-center"
            >
              <UIcon name="i-heroicons-chevron-left" class="w-6 h-6" />
            </UButton>
            <UButton
              variant="outline"
              size="lg"
              @click="goToNextJob"
              square
              class="w-12 h-12 flex items-center justify-center"
            >
              <UIcon name="i-heroicons-chevron-right" class="w-6 h-6" />
            </UButton>
          </div>
        </div>
        <div v-if="job" class="flex gap-2">
          <UButton
            v-if="job && ['queued', 'active', 'need_input'].includes(job.status)"
            color="error"
            variant="outline"
            icon="i-heroicons-x-mark"
            size="lg"
            @click="$emit('cancel-job')"
            class="h-12"
          >
            Cancel
          </UButton>
          <UButton
            v-if="job && ['canceled', 'failed', 'completed', 'need_input'].includes(job.status)"
            color="primary"
            variant="outline"
            icon="i-heroicons-arrow-path"
            size="lg"
            @click="$emit('retry-job')"
            class="h-12"
          >
            Retry
          </UButton>
          <UButton
            v-if="job"
            color="error"
            variant="outline"
            icon="i-heroicons-trash"
            size="lg"
            @click="$emit('delete-job')"
            class="h-12"
          >
            Delete
          </UButton>
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

const emit = defineEmits([
  'update:modelValue',
  'cancel-job',
  'retry-job',
  'delete-job',
  'open-image-fullscreen',
  'job-changed'
])

const { displayImages } = useSettings()

// Video ready states
const outputVideoReady = ref(false)
const destVideoReady = ref(false)
const showingOutputVideo = ref(true) // Default to showing output video
const videoContainer = ref(null)

// Job navigation state
const currentJobIndex = ref(0)

// Modal state
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
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

// Main video UUID computed property
const mainVideoUuid = computed(() => {
  if (!props.job) return null
  
  // Prioritize output video if available and we're showing output
  if (showingOutputVideo.value && props.job.output_uuid) {
    return props.job.output_uuid
  }
  
  // Fall back to destination video
  if (props.job.dest_media_uuid) {
    return props.job.dest_media_uuid
  }
  
  // If no output video but we have destination video, show that
  if (props.job.output_uuid) {
    return props.job.output_uuid
  }
  
  return null
})

// Job details accordion items with conditional default open
const jobDetailsAccordionItems = computed(() => {
  return [{
    label: 'Job Details',
    slot: 'job-details'
  }]
})

// Default accordion open state - open when images are disabled
const defaultAccordionOpen = computed(() => {
  return !displayImages.value ? [0] : []
})

// Status color helper
const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'queued': return 'warning'
    case 'active': return 'info'
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'cancelled': return 'neutral'
    case 'need_input': return 'warning'
    default: return 'neutral'
  }
}

// Date formatting helper
const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString()
}

// Reset video states when modal opens/closes
watch(isOpen, (newValue) => {
  if (!newValue) {
    outputVideoReady.value = false
    destVideoReady.value = false
  }
})

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
const handleKeydown = (event) => {
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
watch(isOpen, (newValue) => {
  if (!newValue) {
    outputVideoReady.value = false
    destVideoReady.value = false
    showingOutputVideo.value = true
  }
})

// Reset video states when job changes
watch(() => props.job, (newJob) => {
  outputVideoReady.value = false
  destVideoReady.value = false
  showingOutputVideo.value = true
  
  // Update current job index based on the new job
  if (newJob && props.jobsList.length > 0) {
    const jobIndex = props.jobsList.findIndex(job => job.id === newJob.id)
    if (jobIndex !== -1) {
      currentJobIndex.value = jobIndex
    }
  }
})
</script>

<style scoped>
.custom-scrollbar {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* Internet Explorer 10+ */
}

.custom-scrollbar::-webkit-scrollbar {
  display: none; /* Safari and Chrome */
}
</style>