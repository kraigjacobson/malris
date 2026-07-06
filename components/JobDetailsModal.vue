<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile">
    <template #header>
      <div class="flex items-center justify-between w-full gap-3">
        <h3 class="text-lg sm:text-xl font-semibold">Job Details</h3>
        <div v-if="hasMultipleJobs && currentJobInfo" class="text-base sm:text-sm text-gray-600 dark:text-gray-400 font-medium">Job {{ currentJobInfo.current }} of {{ currentJobInfo.total }}</div>
        <!-- Desktop only: Close button in header -->
        <UButton v-if="!isMobile" variant="ghost" size="lg" icon="i-heroicons-x-mark" @click="closeModal" class="flex-shrink-0" />
      </div>
    </template>

    <template #body>
      <div v-if="job" class="relative flex flex-col" :class="isMobile ? 'h-full' : 'h-[600px]'">
        <!-- Tabs at top -->
        <UTabs v-model="currentTab" :items="tabItems" class="flex-shrink-0" />

        <div class="relative flex-1 overflow-hidden mt-3">
          <!-- Left side overlay buttons - only on media tab -->
          <ThumbButtons v-if="currentTab === 'media' && !isCropping" :slot2="closeButtonConfig" :slot4="deleteButtonConfig" @thumb-click-slot-2="closeModal" @thumb-click-slot-4="$emit('delete-job')">
            <!-- Slot 3: Star Rating -->
            <template v-if="currentVideoUuid" #slot3>
              <StarRating :media-uuid="currentVideoUuid" :rating="currentVideoRating" @updated="handleCurrentVideoRatingUpdate" />
            </template>
          </ThumbButtons>

          <!-- Scrollable content area -->
          <div class="space-y-4 h-full overflow-y-auto custom-scrollbar" @touchstart="handleGestureTouchStart" @touchmove="handleGestureTouchMove" @touchend="handleGestureTouchEnd">
            <!-- ===== MEDIA TAB ===== -->
            <template v-if="currentTab === 'media'">
          <!-- Crop panel takes over the media area when cropping -->
          <div v-if="isCropping && mainSlot?.cropUuid" class="h-full">
            <ImageCropper :uuid="mainSlot.cropUuid" :filename="mainSlot.label" @cancel="isCropping = false" @cropped="onCropped" />
          </div>

          <template v-else>
          <!-- Main Media Display Section -->
          <div v-if="displayImages && mainSlot" class="text-center">
            <!-- Main Media Container with Arrow Overlays -->
            <div class="relative w-full group">
              <!-- Media Container with Full Width -->
              <div ref="videoContainer" class="relative overflow-hidden rounded-lg shadow-lg w-full bg-gray-100 dark:bg-gray-800 h-[500px] max-h-[70vh] fit-video">
                <!-- Single main display bound to the active slot (output/dest/source/subject) -->
                <MediaCard :key="`main-${mainSlot.key}-${mainSlot.uuid}-${mainSlot.cacheBuster || 0}`" :media="{ uuid: mainSlot.uuid, type: mainSlot.type, thumbnail_uuid: mainSlot.thumbnail_uuid, thumbnail: mainSlot.thumbnail, filename: mainSlot.label, rating: mainSlot.rating, job_id: mainSlot.job_id, cacheBuster: mainSlot.cacheBuster }" :show-duration="false" :show-delete="false" :show-rating="false" :autoplay="true" :show-controls="true" aspect-ratio="auto" image-size="full" @click="() => {}" @rating-updated="handleCurrentVideoRatingUpdate" class="!rounded-none" />
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

              <!-- Crop button — only when the active media is a croppable image -->
              <div v-if="mainSlot.cropUuid" class="absolute bottom-2 right-2 z-40">
                <UButton color="primary" variant="solid" size="sm" icon="i-heroicons-scissors" @click="isCropping = true" class="opacity-80 hover:opacity-100 transition-opacity" title="Crop image" />
              </div>

              <!-- Video Type Toggle Button -->
              <div class="absolute top-2 right-2">
                <UButton v-if="hasOutputAndDest" :color="showingOutputVideo ? 'primary' : 'gray'" variant="solid" size="sm" :icon="showingOutputVideo ? 'i-heroicons-film' : 'i-heroicons-video-camera'" @click="toggleVideoType" class="opacity-80 hover:opacity-100 transition-opacity" :title="showingOutputVideo ? `Show ${destMediaLabel}` : `Show ${outputMediaLabel}`" />
              </div>
            </div>
          </div>

          <!-- Thumbnails Section (only show when displayImages is true) -->
          <div v-if="displayImages" class="space-y-3">
            <h4 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Media Thumbnails</h4>
            <div class="flex gap-2 sm:gap-4">
              <!-- Subject Thumbnail -->
              <div v-if="subjectImageUuid" class="flex-1 min-w-0 cursor-pointer rounded-lg" :class="{ 'ring-2 ring-primary': mainSlot?.key === 'subject' }">
                <div class="mb-1 sm:mb-2 text-center">
                  <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Subject</span>
                </div>
                <div class="relative">
                  <MediaCard :key="`subject-${subjectImageUuid}`" :media="{ uuid: subjectImageUuid, type: 'image', thumbnail: `/api/media/${subjectImageUuid}/image`, filename: 'Subject thumbnail' }" :show-duration="false" :show-delete="false" aspect-ratio="3/4" @click="selectSlot('subject')" />
                  <!-- Favorite toggle for the subject image actually used -->
                  <button
                    type="button"
                    class="absolute bottom-1 left-1 z-40 rounded-full w-7 h-7 flex items-center justify-center transition-colors disabled:opacity-50"
                    :class="subjectFavorite ? 'bg-yellow-400/90 hover:bg-yellow-300 text-black' : 'bg-black/70 hover:bg-black/90 text-white'"
                    :title="subjectFavorite ? 'Unmark favorite' : 'Mark as favorite'"
                    :disabled="subjectFavoriteSaving"
                    @click.stop="toggleSubjectFavorite"
                  >
                    <UIcon :name="subjectFavorite ? 'i-heroicons-star-solid' : 'i-heroicons-star'" class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Source Image Thumbnail -->
              <div v-if="job.source_media_thumbnail_uuid" class="flex-1 min-w-0 cursor-pointer rounded-lg" :class="{ 'ring-2 ring-primary': mainSlot?.key === 'source' }">
                <div class="mb-1 sm:mb-2 text-center">
                  <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Source Image</span>
                </div>
                <MediaCard :key="`source-${job.source_media_thumbnail_uuid}`" :media="{ uuid: job.source_media_thumbnail_uuid, type: 'image', thumbnail: `/api/media/${job.source_media_thumbnail_uuid}/image`, filename: 'Source image thumbnail' }" :show-duration="false" :show-delete="false" aspect-ratio="3/4" @click="selectSlot('source')" />
              </div>

              <!-- Destination Media Thumbnail (don't show for queued jobs since it's the main media) -->
              <div v-if="(job.dest_media_thumbnail_uuid || job.dest_media_uuid) && job.status !== 'queued'" class="flex-1 min-w-0 cursor-pointer rounded-lg" :class="{ 'ring-2 ring-primary': mainSlot?.key === 'dest' }">
                <div class="mb-1 sm:mb-2 text-center">
                  <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">{{ destMediaLabel }}</span>
                </div>
                <MediaCard :key="`dest-thumb-${job.dest_media_uuid}-${cacheBusters[job.dest_media_uuid] || 0}`" :media="{ uuid: job.dest_media_uuid, type: destMediaType, thumbnail_uuid: job.dest_media_thumbnail_uuid, filename: destMediaLabel, rating: destRating, cacheBuster: cacheBusters[job.dest_media_uuid] }" :show-duration="false" :show-delete="false" :autoplay="true" aspect-ratio="3/4" @click="selectSlot('dest')" @rating-updated="handleDestRatingUpdate" />
              </div>

              <!-- Output Thumbnail (don't show for queued jobs) -->
              <div v-if="job.output_uuid && job.status !== 'queued'" class="flex-1 min-w-0 cursor-pointer rounded-lg" :class="{ 'ring-2 ring-primary': mainSlot?.key === 'output' }">
                <div class="mb-1 sm:mb-2 text-center">
                  <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">{{ outputMediaLabel }}</span>
                </div>
                <MediaCard :key="`output-thumb-${job.output_uuid}-${cacheBusters[job.output_uuid] || 0}`" :media="{ uuid: job.output_uuid, type: outputMediaType, thumbnail_uuid: job.output_thumbnail_uuid, filename: outputMediaLabel, rating: outputRating, job_id: job.id, cacheBuster: cacheBusters[job.output_uuid] }" :show-duration="false" :show-delete="false" :autoplay="true" aspect-ratio="3/4" @click="selectSlot('output')" @rating-updated="handleOutputRatingUpdate" />
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
          </template>
          <!-- end crop v-else -->

            </template>
            <!-- ===== END MEDIA TAB ===== -->

            <!-- ===== DETAILS TAB ===== -->
            <template v-if="currentTab === 'details'">
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

                  <!-- I2V/T2V Parameters -->
                  <div v-if="(job.job_type === 'i2v' || job.job_type === 't2v') && job.parameters" class="space-y-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div v-if="job.parameters.prompt" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Prompt</span>
                      <span class="text-xs text-gray-600 dark:text-gray-400">{{ job.parameters.prompt }}</span>
                    </div>
                    <div v-if="job.parameters.negative_prompt" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Negative Prompt</span>
                      <span class="text-xs text-gray-600 dark:text-gray-400">{{ job.parameters.negative_prompt }}</span>
                    </div>
                    <div v-if="job.parameters.length" class="flex gap-2">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Length:</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ job.parameters.length }} frames (~{{ (job.parameters.length / 16).toFixed(1) }}s)</span>
                    </div>
                    <div v-for="slot in 3" :key="slot">
                      <div v-if="job.parameters[`lora_${slot}_high`] || job.parameters[`lora_${slot}_low`]" class="flex flex-col space-y-1 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                        <span class="text-xs font-medium text-gray-700 dark:text-gray-300">LoRA {{ slot }}</span>
                        <div v-if="job.parameters[`lora_${slot}_high`]" class="text-xs text-gray-600 dark:text-gray-400">
                          <span class="font-medium">High:</span> {{ job.parameters[`lora_${slot}_high`] }} @ {{ job.parameters[`lora_${slot}_high_strength`] ?? 1 }}
                        </div>
                        <div v-if="job.parameters[`lora_${slot}_low`]" class="text-xs text-gray-600 dark:text-gray-400">
                          <span class="font-medium">Low:</span> {{ job.parameters[`lora_${slot}_low`] }} @ {{ job.parameters[`lora_${slot}_low_strength`] ?? 1 }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="job.error_message" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                  <span class="font-medium text-red-700 dark:text-red-300">Error:</span>
                  <p class="mt-1 text-sm text-red-600 dark:text-red-400">{{ job.error_message }}</p>
                </div>
            </template>
            <!-- ===== END DETAILS TAB ===== -->
          </div>
          <!-- End scrollable content area -->
        </div>
      </div>
      <!-- End outer container -->
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
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSettings } from '~/composables/useSettings'
import StarRating from '~/components/StarRating.vue'

// Use Nuxt's device detection
const { isMobile } = useDevice()

// Button configurations for ThumbButtons
const closeButtonConfig = computed(() => ({
  icon: 'i-heroicons-x-mark',
  title: 'Close'
}))

const deleteButtonConfig = computed(() => ({
  icon: 'i-heroicons-trash',
  color: 'error',
  title: 'Delete Job'
}))

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

const emit = defineEmits(['update:modelValue', 'cancel-job', 'retry-job', 'delete-job', 'open-image-fullscreen', 'job-changed', 'rating-changed'])

const { displayImages } = useSettings()

// Job navigation gesture handling
const {
  handleTouchStart: handleGestureTouchStart,
  handleTouchMove: handleGestureTouchMove,
  handleTouchEnd: handleGestureTouchEnd
} = useGesture({
  minSwipeDistance: 50,
  onSwipeLeft: () => {
    // Don't navigate jobs while cropping — the crop drag's release reads as a swipe.
    if (isCropping.value) return
    if (hasMultipleJobs.value) {
      goToNextJob()
    }
  },
  onSwipeRight: () => {
    if (isCropping.value) return
    if (hasMultipleJobs.value) {
      goToPreviousJob()
    }
  },
  debug: false
})

const showingOutputVideo = ref(true) // Default to showing output video

// Explicit thumbnail selection for the main display (null = default output/dest).
const selectedSlotKey = ref(null)
// Whether the crop panel is taking over the media area.
const isCropping = ref(false)
// uuid -> version, bumped after a crop so the main display refetches fresh bytes.
const cacheBusters = ref({})

// fs (Faceswap I2I) jobs have IMAGE dest + IMAGE output instead of videos.
// All the dest/output MediaCard renders in this modal pull from these so the
// markup stays DRY and the toggle button label adapts.
const isImageJob = computed(() => props.job?.job_type === 'fs')
const destMediaType = computed(() => isImageJob.value ? 'image' : 'video')
const outputMediaType = computed(() => isImageJob.value ? 'image' : 'video')
const destMediaLabel = computed(() => isImageJob.value ? 'Destination Image' : 'Destination Video')
const outputMediaLabel = computed(() => isImageJob.value ? 'Output Image' : 'Output Video')

const videoContainer = ref(null)

// Rating state
const outputRating = ref(null)
const destRating = ref(null)
// Favorite flag for the subject image actually used (subjectImageUuid).
const subjectFavorite = ref(false)
const subjectFavoriteSaving = ref(false)

// Which video the rating thumb button targets. Two cases:
//   - Face-swap jobs (have both dest and output): respect the user's toggle
//     (showingOutputVideo). For non-completed face-swaps the output isn't
//     rendered yet, so we always rate the dest the user is looking at.
//   - Single-video jobs (t2v/i2v with no dest): rate whichever media exists,
//     so completed ones always rate the output.
// All media slots that can occupy the main display, keyed by role. Each carries
// a cropUuid (the real media UUID to crop, or null when only a derived thumbnail
// is available — e.g. the subject).

// The subject image actually used for this job is the resolved source image
// (the reference the source workflow picked, or the subject's single source
// image). Fall back to the subject's main thumbnail when there's no source.
const subjectImageUuid = computed(() => props.job?.source_media_uuid || props.job?.subject_thumbnail_uuid || null)

const slotByKey = computed(() => {
  const j = props.job
  if (!j) return {}
  const map = {}
  if (j.output_uuid && j.status === 'completed') {
    map.output = {
      key: 'output', uuid: j.output_uuid, type: outputMediaType.value,
      thumbnail_uuid: j.output_thumbnail_uuid, label: outputMediaLabel.value,
      rating: outputRating.value, job_id: j.id,
      cropUuid: outputMediaType.value === 'image' ? j.output_uuid : null
    }
  }
  if (j.dest_media_uuid) {
    map.dest = {
      key: 'dest', uuid: j.dest_media_uuid, type: destMediaType.value,
      thumbnail_uuid: j.dest_media_thumbnail_uuid, label: destMediaLabel.value,
      rating: destRating.value,
      cropUuid: destMediaType.value === 'image' ? j.dest_media_uuid : null
    }
  }
  if (j.source_media_uuid) {
    map.source = {
      key: 'source', uuid: j.source_media_uuid, type: 'image',
      thumbnail_uuid: j.source_media_thumbnail_uuid, label: 'Source Image',
      rating: null, cropUuid: j.source_media_uuid
    }
  }
  if (subjectImageUuid.value) {
    map.subject = {
      key: 'subject', uuid: subjectImageUuid.value, type: 'image',
      thumbnail: `/api/media/${subjectImageUuid.value}/image`, label: 'Subject',
      rating: null, cropUuid: null
    }
  }
  return map
})

// Default main slot when the user hasn't explicitly picked a thumbnail.
const defaultSlotKey = computed(() => {
  const j = props.job
  if (!j) return null
  if (j.output_uuid && j.status === 'completed' && showingOutputVideo.value) return 'output'
  if (j.dest_media_uuid) return 'dest'
  if (j.output_uuid && j.status === 'completed') return 'output'
  if (j.source_media_uuid) return 'source'
  return null
})

// The media currently shown in the main display.
const mainSlot = computed(() => {
  const map = slotByKey.value
  const key = (selectedSlotKey.value && map[selectedSlotKey.value]) ? selectedSlotKey.value : defaultSlotKey.value
  const slot = key ? map[key] : null
  if (!slot) return null
  return { ...slot, cacheBuster: cacheBusters.value[slot.uuid] || null }
})

const hasOutputAndDest = computed(() => !!(props.job?.output_uuid && props.job?.dest_media_uuid))

// StarRating thumb targets whatever's in the main display.
const currentVideoUuid = computed(() => mainSlot.value?.uuid || null)
const currentVideoRating = computed(() => mainSlot.value?.rating ?? null)

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

// Tabs
const currentTab = ref(displayImages.value ? 'media' : 'details')
const tabItems = computed(() => [
  { label: 'Media', value: 'media' },
  { label: 'Details', value: 'details' }
])

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
  selectedSlotKey.value = showingOutputVideo.value ? 'output' : 'dest'
}

// Click a thumbnail to load it into the main display.
const selectSlot = key => {
  if (!slotByKey.value[key]) return
  selectedSlotKey.value = key
  isCropping.value = false
  if (key === 'output') showingOutputVideo.value = true
  else if (key === 'dest') showingOutputVideo.value = false
}

// After a successful crop, force the main display to refetch fresh bytes.
const onCropped = ({ uuid }) => {
  if (uuid) cacheBusters.value = { ...cacheBusters.value, [uuid]: Date.now() }
  isCropping.value = false
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
    selectedSlotKey.value = null
    isCropping.value = false
  }
})

// Rating update handlers. Each also notifies the parent (jobs list) with the
// rated media's UUID so the list can update the matching job's star rating
// reactively — no manual refresh needed.
const handleOutputRatingUpdate = rating => {
  outputRating.value = rating
  if (props.job?.output_uuid) emit('rating-changed', { mediaUuid: props.job.output_uuid, rating })
}

const handleDestRatingUpdate = rating => {
  destRating.value = rating
  if (props.job?.dest_media_uuid) emit('rating-changed', { mediaUuid: props.job.dest_media_uuid, rating })
}

const handleCurrentVideoRatingUpdate = rating => {
  // Route the rating to whichever slot is in the main display.
  const key = mainSlot.value?.key
  if (key === 'output') outputRating.value = rating
  else if (key === 'dest') destRating.value = rating
  if (currentVideoUuid.value) emit('rating-changed', { mediaUuid: currentVideoUuid.value, rating })
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

// Fetch the favorite flag for the subject image actually used
const fetchSubjectFavorite = async uuid => {
  if (!uuid) {
    subjectFavorite.value = false
    return
  }
  try {
    const response = await useApiFetch(`media/${uuid}/info`)
    subjectFavorite.value = !!response.favorite
  } catch (error) {
    console.error('Failed to fetch subject favorite:', error)
    subjectFavorite.value = false
  }
}

// Toggle favorite on the subject image actually used (optimistic + rollback).
const toggleSubjectFavorite = async () => {
  const uuid = subjectImageUuid.value
  if (!uuid || subjectFavoriteSaving.value) return
  const before = subjectFavorite.value
  const next = !before
  subjectFavorite.value = next
  subjectFavoriteSaving.value = true
  try {
    await useApiFetch(`media/${uuid}/favorite`, {
      method: 'PUT',
      body: { favorite: next }
    })
  } catch (error) {
    subjectFavorite.value = before
    const toast = useToast()
    toast.add({
      title: 'Favorite update failed',
      description: error.data?.statusMessage || error.message || 'Could not update favorite',
      color: 'error',
      duration: 3000
    })
  } finally {
    subjectFavoriteSaving.value = false
  }
}

// Reset video states when job changes
watch(
  () => props.job,
  async newJob => {
    // Always default to showing output video (dest will show if no output exists)
    showingOutputVideo.value = true
    selectedSlotKey.value = null
    isCropping.value = false

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

    // Fetch favorite flag for the subject image actually used
    await fetchSubjectFavorite(subjectImageUuid.value)

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

.fit-video :deep(video),
.fit-video :deep(img) {
  object-fit: contain !important;
  object-position: center !important;
}
</style>
