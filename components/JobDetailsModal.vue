<template>
  <UModal v-model:open="isOpen">
    <template #header>
      <h3 class="text-lg font-semibold">Job Details</h3>
    </template>
    
    <template #body>
      <div v-if="job">
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
            
            <!-- Output Images/Video Section -->
            <div v-if="job.status === 'completed' && job.output_uuid" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
              <div class="mb-1 sm:mb-2 text-center">
                <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Output Video</span>
              </div>
              <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4] relative group">
                <!-- Show thumbnail first, then replace with video when ready -->
                <img
                  v-if="job.output_thumbnail_uuid && (!outputVideoReady)"
                  :src="`/api/media/${job.output_thumbnail_uuid}/image`"
                  alt="Output thumbnail"
                  class="w-full h-full object-cover object-top"
                />
                <!-- Video player for completed jobs -->
                <video
                  :src="`/api/stream/${job.output_uuid}`"
                  autoplay
                  loop
                  muted
                  class="w-full h-full object-cover object-top group-hover:[&::-webkit-media-controls]:opacity-100 [&::-webkit-media-controls]:opacity-0 [&::-webkit-media-controls]:transition-opacity"
                  preload="metadata"
                  controls
                  @loadeddata="outputVideoReady = true"
                  @error="outputVideoReady = false"
                >
                  <source :src="`/api/stream/${job.output_uuid}`" type="video/mp4">
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
                  class="w-full h-full object-cover"
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
      <div class="flex flex-wrap gap-2 justify-between">
        <!-- Action buttons - all on the same line -->
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="job && ['queued', 'active', 'need_input'].includes(job.status)"
            color="red"
            variant="outline"
            icon="i-heroicons-x-mark"
            size="sm"
            @click="$emit('cancel-job')"
          >
            Cancel
          </UButton>
          <UButton
            v-if="job && ['canceled', 'failed', 'completed', 'need_input'].includes(job.status)"
            color="primary"
            variant="outline"
            icon="i-heroicons-arrow-path"
            size="sm"
            @click="$emit('retry-job')"
          >
            Retry
          </UButton>
          <UButton
            v-if="job"
            color="red"
            variant="outline"
            icon="i-heroicons-trash"
            size="sm"
            @click="$emit('delete-job')"
          >
            Delete
          </UButton>
        </div>
        
        <!-- Close button -->
        <UButton
          variant="outline"
          @click="$emit('update:modelValue', false)"
        >
          Close
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSettings } from '~/composables/useSettings'

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
  }
})

const emit = defineEmits([
  'update:modelValue',
  'cancel-job',
  'retry-job', 
  'delete-job',
  'open-image-fullscreen'
])

const { displayImages } = useSettings()

// Video ready states
const outputVideoReady = ref(false)
const destVideoReady = ref(false)

// Modal state
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
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

// Reset video states when job changes
watch(() => props.job, () => {
  outputVideoReady.value = false
  destVideoReady.value = false
})
</script>