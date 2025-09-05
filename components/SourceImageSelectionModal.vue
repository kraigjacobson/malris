<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-semibold">Select Source Image</h3>
        <div v-if="hasMultipleJobs && currentJobInfo" class="text-sm text-gray-600 dark:text-gray-400 font-medium">
          Job {{ currentJobInfo.current }} of {{ currentJobInfo.total }}
        </div>
        <UButton
          variant="ghost"
          size="lg"
          icon="i-heroicons-x-mark"
          @click="closeModal"
          :disabled="isSubmittingSource || isDeletingJob"
          class="ml-4"
        />
      </div>
    </template>

    <template #body>
      <div
        class="space-y-4 h-full overflow-y-auto custom-scrollbar"
        @touchstart="handleJobSwipeTouchStart"
        @touchmove="handleJobSwipeTouchMove"
        @touchend="handleJobSwipeTouchEnd"
      >


        <!-- Loading State - show skeletons while loading or when no images are available yet -->
        <div v-if="isLoadingImages || isLoadingSourceImages" class="text-center h-full flex flex-col">
          <!-- Main Image Skeleton -->
          <div class="relative w-full flex-shrink-0">
            <div class="relative overflow-hidden rounded-lg shadow-lg w-full h-96 bg-gray-200 dark:bg-gray-700 animate-pulse">
            </div>
          </div>

          <!-- Details Skeleton -->
          <div class="mt-4 space-y-2 flex-shrink-0">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/3 mx-auto"></div>
            <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/4 mx-auto"></div>
          </div>

          <!-- Additional skeleton content to fill remaining space -->
          <div class="mt-4 space-y-3 flex-1">
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-full"></div>
            <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4"></div>
            <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2"></div>
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-full"></div>
            <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3"></div>
          </div>
        </div>

        <!-- No Images State -->
        <div v-else-if="outputImages.length === 0 && sourceImages.length === 0" class="text-center py-8">
          <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-600 dark:text-gray-400">
            No images found for this job.
          </p>
        </div>

        <!-- Content (show when we have images and loading is complete) -->
        <div v-else>
          <!-- Current Image Display with Arrow Overlays -->
          <div v-if="currentImage" class="text-center">
            <!-- Image Display (only show when displayImages is true) -->
            <div v-if="settingsStore.displayImages" class="relative w-full group">
              <!-- Image/Video Container with Fixed Height -->
              <div ref="imageContainer"
                class="relative overflow-hidden rounded-lg shadow-lg w-full bg-gray-100 dark:bg-gray-800"
                style="height: 384px; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; background-color: #1f2937 !important;"
                @wheel.prevent.stop="handleWheel"
                @mousedown.prevent.stop="handleMouseDown"
                @touchstart.capture.prevent="handleImageTouchStart"
                @touchmove.capture.prevent="handleImageTouchMove"
                @touchend.capture.prevent="handleImageTouchEnd"
                @gesturestart.prevent.stop
                @gesturechange.prevent.stop
                @gestureend.prevent.stop
                @click="handleContainerClick"
                @pointerdown.prevent.stop="handlePointerDown"
                @pointermove.prevent.stop="handlePointerMove"
                @pointerup.prevent.stop="handlePointerUp"
                @mouseover="handleMouseOver">
                
                <!-- Video Player (when showing video) -->
                <video v-if="showingVideo && job?.dest_media_uuid"
                  class="absolute inset-0 w-full h-full object-cover object-top"
                  controls
                  autoplay
                  muted
                  loop
                  :key="job.dest_media_uuid">
                  <source :src="`/api/stream/${job.dest_media_uuid}`" type="video/mp4">
                  Your browser does not support the video tag.
                </video>
                
                <!-- Image Display (when not showing video) -->
                <template v-else>
                  <!-- Single Image Element -->
                  <img ref="zoomableImage"
                    v-if="currentImage"
                    :src="getImageUrl(currentImage)"
                    :alt="currentImage.filename"
                    class="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                    :style="imageTransformStyle"
                    :key="currentImage.uuid"
                    @load="onImageLoad"
                    @error="onImageError"
                    @dragstart.prevent />
                   
                   <!-- Loading overlay when switching images -->
                   <div v-if="isCurrentImageLoading"
                     class="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-10">
                     <div class="text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">Loading...</div>
                   </div>
                </template>
              </div>

              <!-- Overlay Action Buttons - Left Side -->
              <div class="absolute left-4 bottom-4 flex flex-col gap-2 opacity-100 transition-opacity duration-200 pointer-events-auto z-10">
                <!-- Navigation Buttons (only show if multiple images) -->
                <template v-if="sourceImages.length > 1">
                  <!-- Next Button -->
                  <div
                    class="w-12 h-12 flex items-center justify-center cursor-pointer transition-all hover:scale-110 overlay-button-bg rounded-full"
                    @click="goToNextImage">
                    <UIcon name="i-heroicons-chevron-right"
                      class="w-8 h-8 text-white drop-shadow-lg" />
                  </div>
                  
                  <!-- Previous Button -->
                  <div
                    class="w-12 h-12 flex items-center justify-center cursor-pointer transition-all hover:scale-110 overlay-button-bg rounded-full"
                    @click="goToPreviousImage">
                    <UIcon name="i-heroicons-chevron-left"
                      class="w-8 h-8 text-white drop-shadow-lg" />
                  </div>
                </template>
                
                <!-- Select Button -->
                <div v-if="currentImage"
                  class="w-12 h-12 flex items-center justify-center cursor-pointer transition-all hover:scale-110 overlay-button-bg rounded-full"
                  @click="selectCurrentImage"
                  :class="{ 'opacity-50 cursor-not-allowed': isSubmittingSource || isDeletingJob }">
                  <UIcon name="i-heroicons-check"
                    class="w-8 h-8 text-white drop-shadow-lg" />
                </div>
              </div>

              <!-- Delete Job Button - Bottom Right -->
              <div v-if="currentImage" class="absolute right-4 bottom-4 pointer-events-auto z-10">
                <div
                  class="w-12 h-12 flex items-center justify-center cursor-pointer transition-all hover:scale-110 overlay-button-bg rounded-full"
                  @click="handleDeleteJob"
                  :class="{ 'opacity-50 cursor-not-allowed': isDeletingJob }">
                  <UIcon name="i-heroicons-x-mark"
                    class="w-8 h-8 text-white drop-shadow-lg" />
                </div>
              </div>

              <!-- Image Counter -->
              <div v-if="sourceImages.length > 1" class="absolute top-2 left-2">
                <div class="bg-black bg-opacity-70 text-white text-sm font-medium px-2 py-1 rounded">
                  {{ currentImageIndex + 1 }}/{{ sourceImages.length }}
                </div>
              </div>

              <!-- Video/Image Toggle Button -->
              <div
                v-if="job?.dest_media_uuid"
                class="absolute top-4 right-4 w-12 h-12 flex items-center justify-center cursor-pointer overlay-button-bg rounded-full transition-all"
                @click="toggleVideoView">
                <UIcon
                  :name="showingVideo ? 'i-heroicons-photo' : 'i-heroicons-film'"
                  class="w-6 h-6 text-white drop-shadow-lg"
                  :title="showingVideo ? 'Show Output Image' : 'Show Destination Video'" />
              </div>
              <div
                v-else
                class="absolute top-4 right-4 w-12 h-12 flex items-center justify-center cursor-pointer overlay-button-bg rounded-full transition-all"
                @click="deleteCurrentImage">
                <UIcon
                  name="i-heroicons-trash"
                  class="w-6 h-6 text-white drop-shadow-lg"
                  :class="{ 'animate-spin': isDeletingImage }" />
              </div>


            </div>

            <!-- Image Placeholder (when images are hidden) -->
            <div v-else class="text-center py-8">
              <UIcon name="i-heroicons-photo" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p class="text-gray-600 dark:text-gray-400 mb-2">Image display is disabled</p>
              <p class="text-sm text-gray-500 dark:text-gray-500">{{ currentImage.filename }}</p>
              <div v-if="sourceImages.length > 1" class="mt-4 flex justify-center gap-4">
                <UButton variant="outline" size="sm" icon="i-heroicons-chevron-left" @click="goToPreviousImage"
                  :disabled="sourceImages.length <= 1">
                  Previous
                </UButton>
                <span class="flex items-center text-sm text-gray-500">
                  {{ currentImageIndex + 1 }} of {{ sourceImages.length }}
                </span>
                <UButton variant="outline" size="sm" icon="i-heroicons-chevron-right" @click="goToNextImage"
                  :disabled="sourceImages.length <= 1">
                  Next
                </UButton>
              </div>
            </div>

            <!-- Subject Images Thumbnail Strip (only show when displayImages is true) -->
            <div v-if="settingsStore.displayImages && (sourceImages.length > 0 || isLoadingSourceImages)" class="mt-4">
              <div v-if="isLoadingSourceImages" class="flex gap-2 overflow-x-auto py-2 scroll-smooth">
                <!-- Thumbnail Skeletons -->
                <div v-for="i in 5" :key="i"
                  class="shrink-0 w-16 h-16 rounded cursor-pointer border-2 border-gray-200 dark:border-gray-700">
                  <div class="w-full h-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </div>
              </div>
              <div v-else-if="sourceImages.length > 0" ref="thumbnailStrip"
                class="flex gap-2 overflow-x-auto py-2 scroll-smooth"
                @touchstart.stop
                @touchmove.stop
                @touchend.stop>
                <div v-for="(sourceImage, index) in sourceImages" :key="sourceImage.uuid"
                  :ref="el => { if (el) thumbnailRefs[index] = el }"
                  class="shrink-0 w-16 h-16 rounded cursor-pointer border-2 transition-colors"
                  :class="index === currentImageIndex ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
                  @click="currentImageIndex = index">
                  <img :src="getThumbnailUrl(sourceImage)" :alt="sourceImage.filename"
                    class="w-full h-full object-cover object-top rounded" />
                </div>
              </div>
            </div>

            <!-- Job Details Collapsible -->
            <div class="mt-4">
              <UCollapsible class="flex flex-col gap-2">
                <UButton
                  label="Job Details"
                  color="neutral"
                  variant="subtle"
                  trailing-icon="i-lucide-chevron-down"
                  block
                />

                <template #content>
                  <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div class="space-y-4 text-left">
                      
                      <!-- Job Information -->
                      <div>
                        <h4 class="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">Job Information</h4>
                        <div class="space-y-1 text-sm">
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">Job ID:</span>
                            <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ job?.id || 'N/A' }}</div>
                          </div>
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">Subject UUID:</span>
                            <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ job?.subject_uuid || 'N/A' }}</div>
                          </div>
                        </div>
                      </div>

                      <!-- Output Image Information -->
                      <div v-if="currentImage">
                        <h4 class="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">Output Image Details</h4>
                        <div class="space-y-1 text-sm">
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">UUID:</span>
                            <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ currentImage.uuid }}</div>
                          </div>
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">Source Reference:</span>
                            <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ currentImage.source_media_uuid_ref || 'N/A' }}</div>
                          </div>
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">Filename:</span>
                            <div class="text-gray-800 dark:text-gray-200 break-all">{{ currentImage.filename }}</div>
                          </div>
                          <div v-if="currentImage.width && currentImage.height">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Dimensions:</span>
                            <div class="text-gray-800 dark:text-gray-200">{{ currentImage.width }} × {{ currentImage.height }}</div>
                          </div>
                          <div v-if="currentImage.file_size">
                            <span class="font-medium text-gray-600 dark:text-gray-400">File Size:</span>
                            <div class="text-gray-800 dark:text-gray-200">{{ formatFileSize(currentImage.file_size) }}</div>
                          </div>
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">Purpose:</span>
                            <div class="text-gray-800 dark:text-gray-200">{{ currentImage.purpose || 'N/A' }}</div>
                          </div>
                        </div>
                      </div>

                      <!-- Source Image Information -->
                      <div v-if="sourceImages[currentImageIndex]">
                        <h4 class="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2">Source Image Details</h4>
                        <div class="space-y-1 text-sm">
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">UUID:</span>
                            <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ sourceImages[currentImageIndex].uuid }}</div>
                          </div>
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">Subject UUID:</span>
                            <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ sourceImages[currentImageIndex].subject_uuid || 'N/A' }}</div>
                          </div>
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">Filename:</span>
                            <div class="text-gray-800 dark:text-gray-200 break-all">{{ sourceImages[currentImageIndex].filename }}</div>
                          </div>
                          <div v-if="sourceImages[currentImageIndex].width && sourceImages[currentImageIndex].height">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Dimensions:</span>
                            <div class="text-gray-800 dark:text-gray-200">{{ sourceImages[currentImageIndex].width }} × {{ sourceImages[currentImageIndex].height }}</div>
                          </div>
                          <div v-if="sourceImages[currentImageIndex].file_size">
                            <span class="font-medium text-gray-600 dark:text-gray-400">File Size:</span>
                            <div class="text-gray-800 dark:text-gray-200">{{ formatFileSize(sourceImages[currentImageIndex].file_size) }}</div>
                          </div>
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">Purpose:</span>
                            <div class="text-gray-800 dark:text-gray-200">{{ sourceImages[currentImageIndex].purpose || 'N/A' }}</div>
                          </div>
                        </div>
                      </div>

                      <!-- Video Information (if available) -->
                      <div v-if="destVideo">
                        <h4 class="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-2">Destination Video</h4>
                        <div class="space-y-1 text-sm">
                          <div>
                            <span class="font-medium text-gray-600 dark:text-gray-400">Video UUID:</span>
                            <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ destVideo.uuid }}</div>
                          </div>
                          <div v-if="destVideo.duration">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Duration:</span>
                            <div class="text-gray-800 dark:text-gray-200">{{ destVideo.duration }}s</div>
                          </div>
                          <div v-if="destVideo.file_size">
                            <span class="font-medium text-gray-600 dark:text-gray-400">File Size:</span>
                            <div class="text-gray-800 dark:text-gray-200">{{ formatFileSize(destVideo.file_size) }}</div>
                          </div>
                          <div v-if="destVideo.metadata?.codec">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Codec:</span>
                            <div class="text-gray-800 dark:text-gray-200">{{ destVideo.metadata.codec }}</div>
                          </div>
                          <div v-if="destVideo.filename">
                            <span class="font-medium text-gray-600 dark:text-gray-400">Filename:</span>
                            <div class="text-gray-800 dark:text-gray-200 break-all">{{ destVideo.filename }}</div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </template>
              </UCollapsible>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer v-if="!isMobile">
      <div class="flex justify-between items-center w-full">
        <div class="flex gap-2">
          <UButton variant="outline" @click="closeModal" :disabled="isSubmittingSource || isDeletingJob">
            Close
          </UButton>
          <!-- Job Navigation Buttons -->
          <div v-if="hasMultipleJobs" class="flex gap-2">
            <UButton
              variant="outline"
              size="lg"
              :disabled="isSubmittingSource || isDeletingJob"
              @click="goToPreviousJob"
              square
              class="w-12 h-12 flex items-center justify-center"
            >
              <UIcon name="i-heroicons-chevron-left" class="w-6 h-6" />
            </UButton>
            <UButton
              variant="outline"
              size="lg"
              :disabled="isSubmittingSource || isDeletingJob"
              @click="goToNextJob"
              square
              class="w-12 h-12 flex items-center justify-center"
            >
              <UIcon name="i-heroicons-chevron-right" class="w-6 h-6" />
            </UButton>
          </div>
        </div>
        <div v-if="currentImage" class="flex gap-2">
          <UButton color="error" variant="outline" size="lg" :loading="isDeletingJob"
            @click="handleDeleteJob" class="h-12" :disabled="isSubmittingSource">
            Delete
          </UButton>
          <UButton color="primary" class="h-12" size="lg" :loading="isSubmittingSource" @click="selectCurrentImage" :disabled="isDeletingJob">
            Select
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'

// Use Nuxt's device detection
const { isMobile } = useDevice()

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  job: {
    type: Object,
    default: null
  },
  needInputJobs: {
    type: Array,
    default: () => []
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'imageSelected', 'jobDeleted', 'jobChanged'])

// Initialize settings store
const settingsStore = useSettingsStore()

// Reactive data
const outputImages = ref([]) // Output images for main display
const sourceImages = ref([]) // Subject images for thumbnail strip
const destVideo = ref(null) // Destination video record
const showingVideo = ref(false) // Toggle between image and video view
const currentImageIndex = ref(0)
const isLoadingImages = ref(false)
const isLoadingSourceImages = ref(false)
const isSubmittingSource = ref(false)
const isDeletingImage = ref(false)
const thumbnailStrip = ref(null)
const thumbnailRefs = ref({})


// Image persistence for smooth transitions
const lastLoadedImage = ref(null) // Keep previous image while new one loads
const isCurrentImageLoading = ref(false) // Track individual image loading state

// Image preloading system
const preloadedImages = ref(new Map()) // Map of UUID -> Image object for preloaded images
const preloadQueue = ref([]) // Queue of images to preload
const isPreloading = ref(false) // Track if preloading is active

// Job navigation state
const currentJobIndex = ref(0)

// Zoom functionality reactive data
const imageContainer = ref(null)
const zoomableImage = ref(null)
const sharedZoomState = ref({
  scale: 1,
  translateX: 0,
  translateY: 0
})
const isDragging = ref(false)
const lastMousePos = ref({ x: 0, y: 0 })
const dragStart = ref({ x: 0, y: 0 })
const isZooming = ref(false)
const lastTouchDistance = ref(0)

// Composables
const { isDeletingJob, deleteJob } = useJobActions()

// Job navigation gesture handling
const {
  handleTouchStart: handleJobSwipeTouchStart,
  handleTouchMove: handleJobSwipeTouchMove,
  handleTouchEnd: handleJobSwipeTouchEnd
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
  debug: true
})


// Computed
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const currentImage = computed(() => {
  // Get the currently selected source image
  const selectedSourceImage = sourceImages.value[currentImageIndex.value]
  if (!selectedSourceImage) {
    return null
  }

  // Find ALL output images that correspond to this source image
  const allCorrespondingOutputs = outputImages.value.filter(outputImg =>
    outputImg.source_media_uuid_ref === selectedSourceImage.uuid
  )

  // For now, take the first one, but log if there are multiple
  const correspondingOutputImage = allCorrespondingOutputs[0]

  return correspondingOutputImage || null
})


const imageTransformStyle = computed(() => {
  const state = sharedZoomState.value
  return {
    transform: `scale(${state.scale}) translate(${state.translateX}px, ${state.translateY}px)`,
    transformOrigin: 'top center'
  }
})

// Sort jobs by updated_at in descending order (latest first)
const sortedNeedInputJobs = computed(() => {
  return props.needInputJobs
    .slice() // Create a copy to avoid mutating the original
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
})

// Job navigation computed properties
const hasMultipleJobs = computed(() => sortedNeedInputJobs.value.length > 1)
const currentJobInfo = computed(() => {
  if (sortedNeedInputJobs.value.length === 0) return null
  return {
    current: currentJobIndex.value + 1,
    total: sortedNeedInputJobs.value.length
  }
})

// Check if we can go to the next job that needs input
const canGoToNextJob = computed(() => {
  if (sortedNeedInputJobs.value.length <= 1) return false
  
  // Check if there are any other jobs besides the current one that need input
  const otherJobs = sortedNeedInputJobs.value.filter(job => job.id !== props.job?.id)
  return otherJobs.length > 0
})

// Methods
// Job navigation methods
const goToPreviousJob = () => {
  if (sortedNeedInputJobs.value.length > 1) {
    if (currentJobIndex.value > 0) {
      currentJobIndex.value--
    } else {
      // Wrap to last job
      currentJobIndex.value = sortedNeedInputJobs.value.length - 1
    }
    const newJob = sortedNeedInputJobs.value[currentJobIndex.value]
    emit('jobChanged', newJob)
  }
}

const goToNextJob = () => {
  if (sortedNeedInputJobs.value.length > 1) {
    if (currentJobIndex.value < sortedNeedInputJobs.value.length - 1) {
      currentJobIndex.value++
    } else {
      // Wrap to first job
      currentJobIndex.value = 0
    }
    const newJob = sortedNeedInputJobs.value[currentJobIndex.value]
    emit('jobChanged', newJob)
  }
}

const scrollToCurrentThumbnail = () => {
  nextTick(() => {
    if (thumbnailStrip.value && thumbnailRefs.value[currentImageIndex.value]) {
      const selectedThumbnail = thumbnailRefs.value[currentImageIndex.value]
      const stripContainer = thumbnailStrip.value

      // Calculate the position to center the selected thumbnail
      const thumbnailLeft = selectedThumbnail.offsetLeft
      const thumbnailWidth = selectedThumbnail.offsetWidth
      const stripWidth = stripContainer.clientWidth

      // Center the thumbnail in the strip
      const scrollPosition = thumbnailLeft - (stripWidth / 2) + (thumbnailWidth / 2)

      stripContainer.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      })
    }
  })
}

const loadImagesForJob = async (job) => {
  if (!job || !job.id) return

  const startTime = performance.now()
  console.log(`⏱️ [SourceImageModal] Starting loadImagesForJob for job: ${job.id}`)

  isLoadingImages.value = true

  try {
    // First, get just the metadata for output images (no thumbnails to avoid large response)
    const searchParams = {
      media_type: 'image',
      purpose: 'output',
      job_id: job.id,
      include_thumbnails: false,
      sort_by: 'created_at',
      sort_order: 'desc'
    }

    // Don't filter by dest_media_uuid_ref as it may not match the actual stored values
    // The job_id filter is sufficient and more reliable

    const searchStartTime = performance.now()
    console.log(`⏱️ [SourceImageModal] Starting output images metadata search...`)

    const response = await useApiFetch('media/search', {
      query: searchParams
    })

    const searchEndTime = performance.now()
    console.log(`⏱️ [SourceImageModal] ✅ Output metadata search completed in ${(searchEndTime - searchStartTime).toFixed(2)}ms`)
    console.log('🔍 Output search response:', response)

    if (response.results && Array.isArray(response.results)) {
      // Filter output images to only include those with source_media_uuid_ref
      const outputImagesWithSource = response.results.filter(img => img.source_media_uuid_ref)
      console.log('📸 Found output images with source references:', outputImagesWithSource.length, 'out of', response.results.length, 'total')

      outputImages.value = outputImagesWithSource
    } else {
      console.log('❌ No output images found in response')
      outputImages.value = []
    }
  } catch (error) {
    console.error('Failed to load images for job:', error)
    outputImages.value = []
  } finally {
    isLoadingImages.value = false
    const endTime = performance.now()
    console.log(`⏱️ [SourceImageModal] ✅ loadImagesForJob TOTAL TIME: ${(endTime - startTime).toFixed(2)}ms`)
  }

  // Load source images in the background (lazy loading)
  loadSourceImagesForJob(job)
  
  // Setup image preloading after output images are loaded
  setupPreloading()
}

const loadSourceImagesForJob = async (job) => {
  if (!job || !job.subject_uuid) return

  const startTime = performance.now()
  console.log(`⏱️ [SourceImageModal] Starting loadSourceImagesForJob for subject: ${job.subject_uuid}`)

  isLoadingSourceImages.value = true
  try {
    // Get all unique source_media_uuid_ref values from output images
    const sourceUuidsFromOutputs = [...new Set(
      outputImages.value
        .map(outputImg => outputImg.source_media_uuid_ref)
        .filter(Boolean)
    )]

    // Check for duplicate source references
    const sourceRefCounts = {}
    outputImages.value.forEach(img => {
      if (img.source_media_uuid_ref) {
        sourceRefCounts[img.source_media_uuid_ref] = (sourceRefCounts[img.source_media_uuid_ref] || 0) + 1
      }
    })
    
    console.log('🔍 Source reference analysis:', {
      uniqueSourceUuids: sourceUuidsFromOutputs.length,
      sourceUuidsFromOutputs,
      duplicateSourceRefs: Object.entries(sourceRefCounts).filter(([_uuid, count]) => count > 1),
      allSourceRefCounts: sourceRefCounts
    })

    if (sourceUuidsFromOutputs.length === 0) {
      console.log('❌ No source UUIDs found in output images')
      sourceImages.value = []
      return
    }

    // Get all source images for the subject (metadata only, no thumbnails)
    const subjectSourceParams = {
      media_type: 'image',
      purpose: 'source',
      subject_uuid: job.subject_uuid,
      limit: 10000, // Load all available source images
      include_thumbnails: false,
      sort_by: 'created_at',
      sort_order: 'asc'
    }

    const searchStartTime = performance.now()
    console.log(`⏱️ [SourceImageModal] Starting source images metadata search for subject...`)

    const subjectSourceResponse = await useApiFetch('media/search', {
      query: subjectSourceParams
    })

    const searchEndTime = performance.now()
    console.log(`⏱️ [SourceImageModal] ✅ Source metadata search completed in ${(searchEndTime - searchStartTime).toFixed(2)}ms`)

    if (!subjectSourceResponse.results || !Array.isArray(subjectSourceResponse.results)) {
      console.log('❌ No source images found in response')
      sourceImages.value = []
      return
    }

    // Filter to only include source images that have corresponding outputs
    const validSourceImages = subjectSourceResponse.results.filter(sourceImg =>
      sourceUuidsFromOutputs.includes(sourceImg.uuid)
    )

    // Since we're using database-level random sorting, no need for client-side sorting
    console.log('👤 Loaded source images with random order:', validSourceImages.length, 'out of', sourceUuidsFromOutputs.length, 'requested')
    console.log('🎯 Source UUIDs loaded (random order):', validSourceImages.map(img => img.uuid))
    sourceImages.value = validSourceImages

  } catch (error) {
    console.error('Failed to load subject source images:', error)
    sourceImages.value = []
  } finally {
    isLoadingSourceImages.value = false
    const endTime = performance.now()
    console.log(`⏱️ [SourceImageModal] ✅ loadSourceImagesForJob TOTAL TIME: ${(endTime - startTime).toFixed(2)}ms`)
  }
}

const loadDestinationVideo = async (destMediaUuid) => {
  if (!destMediaUuid) {
    destVideo.value = null
    return
  }

  try {
    console.log('🎬 Loading destination video:', destMediaUuid)
    const response = await useApiFetch(`media/${destMediaUuid}`)
    destVideo.value = response
  } catch (error) {
    console.error('Failed to load destination video:', error)
    destVideo.value = null
  }
}

const toggleVideoView = () => {
  if (!props.job?.dest_media_uuid) {
    console.warn('🎬 Cannot toggle to video view - no dest_media_uuid on job')
    return
  }
  
  showingVideo.value = !showingVideo.value
  console.log('🎬 Toggled video view:', showingVideo.value ? 'showing video' : 'showing image', {
    videoUuid: props.job.dest_media_uuid
  })
}

const closeModal = () => {
  isOpen.value = false
  // Clear all image data to prevent continued loading
  outputImages.value = []
  sourceImages.value = []
  destVideo.value = null
  showingVideo.value = false
  currentImageIndex.value = 0
  currentJobIndex.value = 0
  isLoadingImages.value = false
  isLoadingSourceImages.value = false
  isSubmittingSource.value = false
  isDeletingImage.value = false
  
  // Clear preloading data
  preloadedImages.value.clear()
  preloadQueue.value = []
  isPreloading.value = false
  
  // Clear image URL cache
  imageUrlCache.value.clear()
  
  // Reset zoom state when closing modal
  resetZoom()
}

// Image loading event handlers
const onImageLoad = () => {
  console.log('🖼️ Image loaded successfully')
  isCurrentImageLoading.value = false
  // Update last loaded image to current image once it's loaded
  if (currentImage.value) {
    lastLoadedImage.value = currentImage.value
  }
  
  // Restore preserved zoom state or set initial zoom
  nextTick(() => {
    if (preservedZoomState.value) {
      // Restore the preserved zoom state
      updateSharedZoom(preservedZoomState.value)
      preservedZoomState.value = null // Clear after use
    } else {
      // Set initial zoom to fit width for new images
      setInitialZoomToFitWidth()
    }
  })
}

const onImageError = () => {
  console.error('❌ Image failed to load')
  isCurrentImageLoading.value = false
}

// Image preloading system
const preloadImage = (imageData) => {
  return new Promise((resolve, reject) => {
    if (preloadedImages.value.has(imageData.uuid)) {
      console.log('🚀 Image already preloaded:', imageData.uuid)
      resolve(imageData)
      return
    }

    const img = new Image()
    img.onload = () => {
      preloadedImages.value.set(imageData.uuid, img)
      resolve(imageData)
    }
    img.onerror = () => {
      console.error('❌ Failed to preload image:', imageData.filename)
      reject(new Error(`Failed to preload ${imageData.filename}`))
    }
    img.src = getImageUrl(imageData)
  })
}

const startPreloading = async () => {
  if (isPreloading.value || preloadQueue.value.length === 0) return
  
  isPreloading.value = true
  console.log('🚀 Starting fast image preloading for', preloadQueue.value.length, 'images')
  
  // Preload all images as fast as possible without delays
  const preloadPromises = preloadQueue.value.map(imageData =>
    preloadImage(imageData).catch(error => {
      console.error('Preload error:', error)
      return null
    })
  )
  
  await Promise.all(preloadPromises)
  
  isPreloading.value = false
  console.log('🎉 Image preloading completed')
}

const setupPreloading = () => {
  // Clear previous preload data
  preloadedImages.value.clear()
  preloadQueue.value = []
  
  // Add all output images to preload queue
  if (outputImages.value.length > 0) {
    preloadQueue.value = [...outputImages.value]
    console.log('📋 Set up preload queue with', preloadQueue.value.length, 'images')
    
    // Start preloading in background
    nextTick(() => {
      startPreloading()
    })
  }
}

// Store zoom state for persistence across image changes
const preservedZoomState = ref(null)

const goToPreviousImage = () => {
  if (sourceImages.value.length > 1) {
    // Store current zoom state
    preservedZoomState.value = { ...sharedZoomState.value }
    
    if (currentImageIndex.value > 0) {
      currentImageIndex.value--
    } else {
      // Wrap to last image
      currentImageIndex.value = sourceImages.value.length - 1
    }
    scrollToCurrentThumbnail()
  }
}

const goToNextImage = () => {
  if (sourceImages.value.length > 1) {
    // Store current zoom state
    preservedZoomState.value = { ...sharedZoomState.value }
    
    if (currentImageIndex.value < sourceImages.value.length - 1) {
      currentImageIndex.value++
    } else {
      // Wrap to first image
      currentImageIndex.value = 0
    }
    scrollToCurrentThumbnail()
  }
}

const handleKeydown = (event) => {
  // Only handle keys when modal is open
  if (!isOpen.value) return

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd + Left Arrow: Previous job
        if (hasMultipleJobs.value) {
          goToPreviousJob()
        }
      } else if (sourceImages.value.length > 0) {
        // Left Arrow: Previous image
        goToPreviousImage()
      }
      break
    case 'ArrowRight':
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd + Right Arrow: Next job
        if (hasMultipleJobs.value) {
          goToNextJob()
        }
      } else if (sourceImages.value.length > 0) {
        // Right Arrow: Next image
        goToNextImage()
      }
      break
    case 'Enter':
      event.preventDefault()
      if (currentImage.value && !isSubmittingSource.value && !isDeletingJob.value) {
        selectCurrentImage()
      }
      break
    case 'Escape':
      event.preventDefault()
      closeModal()
      break
    case '0':
    case 'r':
    case 'R':
      // Reset zoom with '0' or 'r' key
      event.preventDefault()
      resetZoom()
      break
  }
}

// Global event prevention for mobile zoom (but allow our image container)
const preventGlobalZoom = (event) => {
  console.log('🔥 [GLOBAL DEBUG] preventGlobalZoom called', {
    touchCount: event.touches?.length,
    target: event.target,
    imageContainer: imageContainer.value,
    contains: imageContainer.value?.contains(event.target),
    targetClasses: event.target?.className
  })
  
  // Don't prevent single touches at all - let them through
  if (!event.touches || event.touches.length <= 1) {
    console.log('🔥 [GLOBAL DEBUG] Single or no touch, allowing')
    return
  }
  
  // For multi-touch, check if it's inside our image container or its children
  if (imageContainer.value && (
    imageContainer.value.contains(event.target) ||
    event.target === imageContainer.value
  )) {
    console.log('🔥 [GLOBAL DEBUG] Multi-touch inside image container, allowing')
    // Allow our custom zoom to handle it
    return
  }
  
  console.log('🔥 [GLOBAL DEBUG] Multi-touch outside image container, preventing')
  // Block zoom everywhere else
  event.preventDefault()
  event.stopPropagation()
}

const preventGlobalGesture = (event) => {
  console.log('🔥 [GLOBAL DEBUG] preventGlobalGesture called', {
    target: event.target,
    imageContainer: imageContainer.value,
    contains: imageContainer.value?.contains(event.target),
    targetClasses: event.target?.className
  })
  
  // Check if the gesture is inside our image container or its children
  if (imageContainer.value && (
    imageContainer.value.contains(event.target) ||
    event.target === imageContainer.value
  )) {
    console.log('🔥 [GLOBAL DEBUG] Gesture inside image container, allowing')
    // Allow our custom zoom to handle it
    return
  }
  
  console.log('🔥 [GLOBAL DEBUG] Gesture outside image container, preventing')
  // Block gestures everywhere else
  event.preventDefault()
  event.stopPropagation()
}

// Add global keyboard event listener when modal opens
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  
  // Debug: Check if imageContainer ref is working
  console.log('🔥 [MOUNT DEBUG] Component mounted', {
    imageContainer: imageContainer.value,
    containerExists: !!imageContainer.value
  })
  
  // Add a timeout to check after Vue has had time to render
  setTimeout(() => {
    console.log('🔥 [MOUNT DEBUG] After timeout', {
      imageContainer: imageContainer.value,
      containerExists: !!imageContainer.value,
      containerTagName: imageContainer.value?.tagName,
      containerClasses: imageContainer.value?.className
    })
    
    // Try to manually add event listeners as a test
    if (imageContainer.value) {
      console.log('🔥 [MOUNT DEBUG] Adding manual event listeners')
      imageContainer.value.addEventListener('touchstart', (e) => {
        console.log('🔥 [MANUAL DEBUG] Manual touchstart triggered!', e)
      }, { passive: false })
      
      imageContainer.value.addEventListener('click', (e) => {
        console.log('🔥 [MANUAL DEBUG] Manual click triggered!', e)
      })
    }
  }, 1000)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// Watch for modal opening/closing to add/remove global touch prevention
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    // Prevent global zoom when modal is open
    document.addEventListener('touchstart', preventGlobalZoom, { passive: false })
    document.addEventListener('touchmove', preventGlobalZoom, { passive: false })
    document.addEventListener('touchend', preventGlobalZoom, { passive: false })
    document.addEventListener('gesturestart', preventGlobalGesture, { passive: false })
    document.addEventListener('gesturechange', preventGlobalGesture, { passive: false })
    document.addEventListener('gestureend', preventGlobalGesture, { passive: false })
  } else {
    // Remove global prevention when modal closes
    document.removeEventListener('touchstart', preventGlobalZoom)
    document.removeEventListener('touchmove', preventGlobalZoom)
    document.removeEventListener('touchend', preventGlobalZoom)
    document.removeEventListener('gesturestart', preventGlobalGesture)
    document.removeEventListener('gesturechange', preventGlobalGesture)
    document.removeEventListener('gestureend', preventGlobalGesture)
  }
})

const selectCurrentImage = async () => {
  if (!props.job || !currentImage.value) return

  // Get the corresponding source image for the selected output
  const selectedSourceImage = sourceImages.value[currentImageIndex.value]
  if (!selectedSourceImage) return

  isSubmittingSource.value = true
  try {
    await useApiFetch(`jobs/${props.job.id}/add-source`, {
      method: 'POST',
      body: {
        source_media_uuid: selectedSourceImage.uuid
      }
    })

    // Emit success event with the source image
    emit('imageSelected', {
      job: props.job,
      selectedImage: selectedSourceImage
    })

    // Check if there are more jobs that need input
    if (canGoToNextJob.value) {
      // Move to the next job that needs input
      goToNextJob()
    } else {
      // No more jobs, close the modal
      closeModal()
    }

  } catch (error) {
    console.error('Failed to add source image:', error)
    // You might want to show an error toast here
  } finally {
    isSubmittingSource.value = false
  }
}

const deleteCurrentImage = async () => {
  if (!currentImage.value) return

  isDeletingImage.value = true
  try {
    await useApiFetch(`media/${currentImage.value.uuid}/delete`, {
      method: 'DELETE'
    })

    // Remove the deleted output image from the outputImages array
    const outputImageIndex = outputImages.value.findIndex(img => img.uuid === currentImage.value.uuid)
    if (outputImageIndex !== -1) {
      outputImages.value.splice(outputImageIndex, 1)
    }

    // Remove the corresponding source image from the sourceImages array
    const currentSourceImage = sourceImages.value[currentImageIndex.value]
    if (currentSourceImage) {
      const sourceImageIndex = sourceImages.value.findIndex(img => img.uuid === currentSourceImage.uuid)
      if (sourceImageIndex !== -1) {
        sourceImages.value.splice(sourceImageIndex, 1)
      }
    }

    // Adjust current index if necessary
    if (sourceImages.value.length === 0) {
      // No images left, close modal
      closeModal()
    } else if (currentImageIndex.value >= sourceImages.value.length) {
      // If we deleted the last image, go to the previous one
      currentImageIndex.value = sourceImages.value.length - 1
    }
    // If we deleted an image in the middle, currentImageIndex stays the same
    // which will show the next image in the array

  } catch (error) {
    console.error('Failed to delete image:', error)
    // You might want to show an error toast here
  } finally {
    isDeletingImage.value = false
  }
}

const handleDeleteJob = async () => {
  if (!props.job) return

  await deleteJob(props.job, () => {
    // Emit job deleted event
    emit('jobDeleted', props.job)

    // Check if there are more jobs that need input
    if (canGoToNextJob.value) {
      // Move to the next job that needs input
      goToNextJob()
    } else {
      // No more jobs, close the modal
      closeModal()
    }
  })

  // The composable handles all the confirmation and deletion logic
  // We just need to handle the success callback above
}

const formatFileSize = (bytes) => {
  if (!bytes) return 'Unknown'
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

// Helper methods for safe URL generation - memoized to prevent repeated calls
const imageUrlCache = ref(new Map())

const getImageUrl = (image, size = 'original') => {
  if (!image || !image.uuid) {
    return ''
  }

  const cacheKey = `${image.uuid}-${size}`
  if (imageUrlCache.value.has(cacheKey)) {
    return imageUrlCache.value.get(cacheKey)
  }

  // Use 'large' size for faster loading while maintaining good quality
  const url = `/api/media/${image.uuid}/image?size=${size}`
  imageUrlCache.value.set(cacheKey, url)
  return url
}

const getThumbnailUrl = (image) => {
  if (!image || !image.uuid) return ''

  // Always use the main image UUID with thumbnail size for consistent performance
  const url = `/api/media/${image.uuid}/image?size=thumbnail`
  return url
}

// Zoom functionality methods
const updateSharedZoom = (updates) => {
  Object.assign(sharedZoomState.value, updates)
}

const resetZoom = () => {
  updateSharedZoom({ scale: 1, translateX: 0, translateY: 0 })
}

const setInitialZoomToFitWidth = () => {
  if (!imageContainer.value || !zoomableImage.value || !currentImage.value) return
  
  const containerRect = imageContainer.value.getBoundingClientRect()
  
  // Get the natural dimensions of the image
  const naturalWidth = currentImage.value.width || zoomableImage.value.naturalWidth
  const naturalHeight = currentImage.value.height || zoomableImage.value.naturalHeight
  
  if (!naturalWidth || !naturalHeight) return
  
  // Calculate what object-contain would do
  const containerAspect = containerRect.width / containerRect.height
  const imageAspect = naturalWidth / naturalHeight
  
  let displayedWidth, displayedHeight
  
  if (imageAspect > containerAspect) {
    // Image is wider - width will be constrained
    displayedWidth = containerRect.width
    displayedHeight = containerRect.width / imageAspect
  } else {
    // Image is taller - height will be constrained
    displayedHeight = containerRect.height
    displayedWidth = containerRect.height * imageAspect
  }
  
  // Calculate the scale needed to make the displayed width fill the container width
  const scaleToFitWidth = containerRect.width / displayedWidth
  
  // Calculate initial Y translation to anchor to top of image
  const initialTranslateY = 0
  
  // With transform-origin 'top center', scaling from top means no Y translation needed
  // The image will naturally show from the top when scaled
  
  // Apply the scale to fit width and anchor to top
  updateSharedZoom({
    scale: scaleToFitWidth,
    translateX: 0,
    translateY: initialTranslateY
  })
  
  console.log('🔍 Auto-fit calculation:', {
    containerSize: { width: containerRect.width, height: containerRect.height },
    naturalSize: { width: naturalWidth, height: naturalHeight },
    displayedSize: { width: displayedWidth, height: displayedHeight },
    scaleToFitWidth,
    initialTranslateY,
    containerAspect,
    imageAspect
  })
}

const constrainTranslation = (scale, translateX, translateY) => {
  if (!imageContainer.value || !zoomableImage.value || !currentImage.value) return { translateX, translateY }

  const containerRect = imageContainer.value.getBoundingClientRect()
  
  // Get the natural dimensions of the image
  const naturalWidth = currentImage.value.width || zoomableImage.value.naturalWidth
  const naturalHeight = currentImage.value.height || zoomableImage.value.naturalHeight
  
  if (!naturalWidth || !naturalHeight) return { translateX, translateY }
  
  // Calculate what object-contain would display
  const containerAspect = containerRect.width / containerRect.height
  const imageAspect = naturalWidth / naturalHeight
  
  let displayedWidth, displayedHeight
  
  if (imageAspect > containerAspect) {
    displayedWidth = containerRect.width
    displayedHeight = containerRect.width / imageAspect
  } else {
    displayedHeight = containerRect.height
    displayedWidth = containerRect.height * imageAspect
  }

  // Calculate the scaled image dimensions
  const scaledWidth = displayedWidth * scale
  const scaledHeight = displayedHeight * scale

  // Calculate max translation - with transform-origin 'top center'
  let maxTranslateX = 0
  let minTranslateY = 0
  let maxTranslateY = 0
  
  if (scaledWidth > containerRect.width) {
    maxTranslateX = (scaledWidth - containerRect.width) / 2 / scale
  }
  
  if (scaledHeight > containerRect.height) {
    // With 'top center' origin, the image starts at the top
    // We can translate up (negative Y) to see more of the bottom
    // We can translate down (positive Y) but not past the top edge
    const excessHeight = scaledHeight - containerRect.height
    minTranslateY = -excessHeight / scale  // Can translate up to see bottom
    maxTranslateY = 0  // Can't translate down past the top edge
  }

  return {
    translateX: Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX)),
    translateY: Math.max(minTranslateY, Math.min(maxTranslateY, translateY))
  }
}

const handleWheel = (event) => {
  if (!currentImage.value) return

  event.preventDefault()

  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const currentState = sharedZoomState.value
  
  // Calculate minimum scale to fit width
  const minScale = getMinimumScale()
  const newScale = Math.max(minScale, Math.min(5, currentState.scale + delta))

  if (newScale !== currentState.scale) {
    // Constrain translation when scale changes
    const constrained = constrainTranslation(newScale, currentState.translateX, currentState.translateY)
    updateSharedZoom({
      scale: newScale,
      translateX: constrained.translateX,
      translateY: constrained.translateY
    })
  }
}

const getMinimumScale = () => {
  if (!imageContainer.value || !currentImage.value) return 1
  
  const containerRect = imageContainer.value.getBoundingClientRect()
  const naturalWidth = currentImage.value.width || 1
  const naturalHeight = currentImage.value.height || 1
  
  const containerAspect = containerRect.width / containerRect.height
  const imageAspect = naturalWidth / naturalHeight
  
  let displayedWidth
  
  if (imageAspect > containerAspect) {
    displayedWidth = containerRect.width
  } else {
    displayedWidth = containerRect.height * imageAspect
  }
  
  // Minimum scale is what's needed to fit the width
  return containerRect.width / displayedWidth
}

const handleMouseDown = (event) => {
  if (!currentImage.value) return

  event.preventDefault()
  isDragging.value = true
  lastMousePos.value = { x: event.clientX, y: event.clientY }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const handleMouseMove = (event) => {
  if (!isDragging.value || !currentImage.value) return

  const deltaX = event.clientX - lastMousePos.value.x
  const deltaY = event.clientY - lastMousePos.value.y

  const currentState = sharedZoomState.value
  const newTranslateX = currentState.translateX + deltaX / currentState.scale
  const newTranslateY = currentState.translateY + deltaY / currentState.scale

  const constrained = constrainTranslation(currentState.scale, newTranslateX, newTranslateY)
  updateSharedZoom(constrained)

  lastMousePos.value = { x: event.clientX, y: event.clientY }
}

const handleMouseUp = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}

const getTouchDistance = (touches) => {
  if (touches.length < 2) return 0

  const touch1 = touches[0]
  const touch2 = touches[1]

  return Math.sqrt(
    Math.pow(touch2.clientX - touch1.clientX, 2) +
    Math.pow(touch2.clientY - touch1.clientY, 2)
  )
}


const handleTouchStart = (event) => {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  if (!currentImage.value) return

  if (event.touches.length === 1) {
    // Single touch - start panning
    const touch = event.touches[0]
    dragStart.value = { x: touch.clientX, y: touch.clientY }
    isDragging.value = true
    isZooming.value = false
  } else if (event.touches.length === 2) {
    // Two touches - start simultaneous zoom and pan
    // IMPORTANT: Use the first finger for panning, not the center
    const firstTouch = event.touches[0]
    dragStart.value = { x: firstTouch.clientX, y: firstTouch.clientY }
    
    isZooming.value = true
    isDragging.value = true
    lastTouchDistance.value = getTouchDistance(event.touches)
  }
}

const handleTouchMove = (event) => {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  if (!currentImage.value) return

  if (event.touches.length === 1 && isDragging.value && !isZooming.value) {
    // Single touch panning
    const touch = event.touches[0]
    const deltaX = touch.clientX - dragStart.value.x
    const deltaY = touch.clientY - dragStart.value.y

    const currentState = sharedZoomState.value
    const newTranslateX = currentState.translateX + deltaX / currentState.scale
    const newTranslateY = currentState.translateY + deltaY / currentState.scale

    const constrained = constrainTranslation(currentState.scale, newTranslateX, newTranslateY)
    updateSharedZoom(constrained)

    dragStart.value = { x: touch.clientX, y: touch.clientY }
  } else if (event.touches.length === 2 && isZooming.value) {
    // Two touch simultaneous zoom and pan
    // IMPORTANT: Pan is based ONLY on the first finger's movement
    const firstTouch = event.touches[0]
    const currentDistance = getTouchDistance(event.touches)
    
    const currentState = sharedZoomState.value
    
    // Handle zoom
    const distanceRatio = currentDistance / lastTouchDistance.value
    const smoothedRatio = 1 + (distanceRatio - 1) * 0.5 // Smooth zoom
    const newScale = Math.max(0.5, Math.min(5, currentState.scale * smoothedRatio))
    
    // Handle pan based ONLY on first finger movement
    const deltaX = firstTouch.clientX - dragStart.value.x
    const deltaY = firstTouch.clientY - dragStart.value.y
    
    const newTranslateX = currentState.translateX + deltaX / currentState.scale
    const newTranslateY = currentState.translateY + deltaY / currentState.scale

    const constrained = constrainTranslation(newScale, newTranslateX, newTranslateY)
    updateSharedZoom({
      scale: newScale,
      translateX: constrained.translateX,
      translateY: constrained.translateY
    })

    // Update tracking values
    lastTouchDistance.value = currentDistance
    dragStart.value = { x: firstTouch.clientX, y: firstTouch.clientY }
  }
}

const handleTouchEnd = (event) => {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  if (event.touches.length === 0) {
    // All touches ended
    isDragging.value = false
    isZooming.value = false
  } else if (event.touches.length === 1) {
    // One touch remaining - continue with single touch panning
    // Use the remaining touch as the new drag start point
    isZooming.value = false
    isDragging.value = true
    const touch = event.touches[0]
    dragStart.value = { x: touch.clientX, y: touch.clientY }
  }
}

// Test function to verify container is receiving events
const handleContainerClick = (event) => {
  console.log('🔥 [CONTAINER DEBUG] Container clicked!', {
    target: event.target,
    currentTarget: event.currentTarget,
    imageContainer: imageContainer.value,
    containerMatches: event.currentTarget === imageContainer.value
  })
}

// Most basic event test
const handleMouseOver = (event) => {
  console.log('🔥 [BASIC DEBUG] Mouse over container!', {
    containerExists: !!imageContainer.value,
    elementTagName: event.currentTarget?.tagName,
    elementClasses: event.currentTarget?.className
  })
}

// Pointer event handlers as fallback
const handlePointerDown = (event) => {
  if (event.pointerType === 'mouse') {
    handleMouseDown(event)
  } else if (event.pointerType === 'touch') {
    // Convert pointer event to touch-like event for our existing logic
    const fakeEvent = {
      touches: [{ clientX: event.clientX, clientY: event.clientY }],
      preventDefault: () => event.preventDefault(),
      stopPropagation: () => event.stopPropagation(),
      stopImmediatePropagation: () => event.stopImmediatePropagation()
    }
    handleTouchStart(fakeEvent)
  }
}

const handlePointerMove = (event) => {
  if (event.pointerType === 'mouse') {
    handleMouseMove(event)
  } else if (event.pointerType === 'touch') {
    const fakeEvent = {
      touches: [{ clientX: event.clientX, clientY: event.clientY }],
      preventDefault: () => event.preventDefault(),
      stopPropagation: () => event.stopPropagation(),
      stopImmediatePropagation: () => event.stopImmediatePropagation()
    }
    handleTouchMove(fakeEvent)
  }
}

const handlePointerUp = (event) => {
  if (event.pointerType === 'mouse') {
    handleMouseUp(event)
  } else if (event.pointerType === 'touch') {
    const fakeEvent = {
      touches: [],
      preventDefault: () => event.preventDefault(),
      stopPropagation: () => event.stopPropagation(),
      stopImmediatePropagation: () => event.stopImmediatePropagation()
    }
    handleTouchEnd(fakeEvent)
  }
}

// Watch for job changes to load images
watch(() => props.job, (newJob, oldJob) => {
  if (newJob && props.modelValue) {
    console.log('⏱️ [SourceImageModal] Job changed, loading images for job:', newJob.id)
    
    // Debug: Log job data to see what video references are available
    console.log('🔍 [DEBUG] Job data:', {
      id: newJob.id,
      dest_media_uuid: newJob.dest_media_uuid,
      output_uuid: newJob.output_uuid,
      source_media_uuid: newJob.source_media_uuid,
      allFields: Object.keys(newJob)
    })
    
    // Reset zoom state when switching to a different job
    if (oldJob && oldJob.id !== newJob.id) {
      resetZoom()
    }
    
    // CRITICAL FIX: Clear all previous state before loading new job
    outputImages.value = []
    sourceImages.value = []
    currentImageIndex.value = 0
    isLoadingImages.value = false
    isLoadingSourceImages.value = false
    
    // Clear preloading data
    preloadedImages.value.clear()
    preloadQueue.value = []
    isPreloading.value = false
    
    // Now load the new job
    loadImagesForJob(newJob)
    
    // Update current job index based on the new job
    const jobIndex = sortedNeedInputJobs.value.findIndex(job => job.id === newJob.id)
    if (jobIndex !== -1) {
      currentJobIndex.value = jobIndex
    }
  }
}, { immediate: true })

// Watch for modal opening to load images
watch(() => props.modelValue, (isOpen) => {
  if (isOpen && props.job) {
    console.log(`⏱️ [SourceImageModal] 🚀 MODAL OPENED - Loading images for job: ${props.job.id}`)
    const modalStartTime = performance.now()
    loadImagesForJob(props.job).then(() => {
      const modalEndTime = performance.now()
      console.log(`⏱️ [SourceImageModal] 🎉 MODAL FULLY LOADED in ${(modalEndTime - modalStartTime).toFixed(2)}ms`)
    })
  } else if (!isOpen) {
    console.log(`⏱️ [SourceImageModal] Modal closed, cleaning up`)
    // Clean up when modal closes
    outputImages.value = []
    sourceImages.value = []
    currentImageIndex.value = 0
    currentJobIndex.value = 0
    isLoadingImages.value = false
    isLoadingSourceImages.value = false
    isSubmittingSource.value = false
    isDeletingImage.value = false
    
    // Reset zoom state when modal closes
    resetZoom()
  }
})

// Watch for currentImageIndex changes to auto-scroll thumbnail strip
watch(() => currentImageIndex.value, () => {
  scrollToCurrentThumbnail()
})

// Watch for currentImage changes to update lastLoadedImage and load destination video
watch(() => currentImage.value, (newImage) => {
  if (newImage && !isCurrentImageLoading.value) {
    // If we have a new image and we're not currently loading, update immediately
    lastLoadedImage.value = newImage
  }
  
  // Debug: Log all available fields on the current image
  console.log('🔍 [DEBUG] Current image data:', {
    uuid: newImage?.uuid,
    filename: newImage?.filename,
    purpose: newImage?.purpose,
    dest_media_uuid_ref: newImage?.dest_media_uuid_ref,
    video_uuid: newImage?.video_uuid,
    job_id: newImage?.job_id,
    allFields: newImage ? Object.keys(newImage) : 'no image'
  })
  
  // Load destination video from job's dest_media_uuid (this is where the video UUID is stored)
  if (props.job?.dest_media_uuid) {
    console.log('🎬 Found dest_media_uuid on job:', props.job.dest_media_uuid)
    loadDestinationVideo(props.job.dest_media_uuid)
  } else {
    console.log('🎬 No dest_media_uuid found on job')
    destVideo.value = null
  }
  
  // Reset video view when changing images
  showingVideo.value = false
}, { immediate: true })

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
