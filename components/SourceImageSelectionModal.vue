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
      <div class="space-y-4 h-[600px] overflow-y-auto custom-scrollbar">

        <!-- Result Limit Controls -->
        <div class="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Output Images Limit
            </label>
            <USelectMenu
              v-model="outputImageLimit"
              :items="limitOptions"
              class="w-full"
              size="sm"
              @change="reloadImagesForCurrentJob"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Source Images Limit
            </label>
            <USelectMenu
              v-model="sourceImageLimit"
              :items="limitOptions"
              class="w-full"
              size="sm"
              @change="reloadImagesForCurrentJob"
            />
          </div>
        </div>

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
                style="height: 384px; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;"
                @wheel.prevent="handleWheel" @mousedown.prevent="handleMouseDown" @touchstart.prevent="handleTouchStart"
                @touchmove.prevent="handleTouchMove" @touchend.prevent="handleTouchEnd" @gesturestart.prevent
                @gesturechange.prevent @gestureend.prevent>
                
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
                  <!-- Previous/Fallback Image (stays visible during transitions) -->
                  <img v-if="lastLoadedImage"
                    :src="getImageUrl(lastLoadedImage)"
                    :alt="lastLoadedImage.filename"
                    class="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-200 ease-out select-none"
                    :style="imageTransformStyle"
                    @dragstart.prevent />
                  
                  <!-- Current Image (fades in when loaded) -->
                  <img ref="zoomableImage"
                    v-if="currentImage"
                    :src="getImageUrl(currentImage)"
                    :alt="currentImage.filename"
                    class="absolute inset-0 w-full h-full object-cover object-top transition-all duration-200 ease-out select-none"
                    :class="{ 'opacity-0': isCurrentImageLoading, 'opacity-100': !isCurrentImageLoading }"
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

              <!-- Left Arrow Overlay -->
              <div v-if="sourceImages.length > 1"
                class="absolute left-0 top-0 w-1/2 h-full flex items-center justify-start pl-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                @click="goToPreviousImage">
                <UIcon name="i-heroicons-chevron-left"
                  class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
              </div>

              <!-- Right Arrow Overlay -->
              <div v-if="sourceImages.length > 1"
                class="absolute right-0 top-0 w-1/2 h-full flex items-center justify-end pr-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                @click="goToNextImage">
                <UIcon name="i-heroicons-chevron-right"
                  class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
              </div>

              <!-- Image Counter -->
              <div v-if="sourceImages.length > 1" class="absolute top-2 left-2">
                <div class="bg-black bg-opacity-70 text-white text-sm font-medium px-2 py-1 rounded">
                  {{ currentImageIndex + 1 }}/{{ sourceImages.length }}
                </div>
              </div>

              <!-- Video/Image Toggle Button -->
              <div class="absolute top-2 right-2">
                <UButton
                  v-if="job?.dest_media_uuid"
                  :color="showingVideo ? 'primary' : 'gray'"
                  variant="solid"
                  size="sm"
                  :icon="showingVideo ? 'i-heroicons-photo' : 'i-heroicons-film'"
                  @click="toggleVideoView"
                  class="opacity-80 hover:opacity-100 transition-opacity"
                  :title="showingVideo ? 'Show Output Image' : 'Show Destination Video'" />
                <UButton
                  v-else
                  color="error"
                  variant="solid"
                  size="sm"
                  icon="i-heroicons-trash"
                  :loading="isDeletingImage"
                  @click="deleteCurrentImage"
                  class="opacity-80 hover:opacity-100 transition-opacity" />
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
                class="flex gap-2 overflow-x-auto py-2 scroll-smooth">
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

            <!-- Consolidated Information Panel -->
            <div class="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
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
          </div>
        </div>
      </div>
    </template>

    <template #footer>
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

// Result limit controls
const outputImageLimit = ref(50)
const sourceImageLimit = ref(100)

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

// Limit options for dropdowns
const limitOptions = [
  { label: '24 results', value: 24 },
  { label: '48 results', value: 48 },
  { label: '96 results', value: 96 },
  { label: '192 results', value: 192 },
  { label: '480 results', value: 480 }
]

// Computed
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const currentImage = computed(() => {
  // Get the currently selected source image
  const selectedSourceImage = sourceImages.value[currentImageIndex.value]
  if (!selectedSourceImage) {
    console.log('🚨 [currentImage] No selected source image at index:', currentImageIndex.value)
    return null
  }

  // Find ALL output images that correspond to this source image
  const allCorrespondingOutputs = outputImages.value.filter(outputImg =>
    outputImg.source_media_uuid_ref === selectedSourceImage.uuid
  )

  // For now, take the first one, but log if there are multiple
  const correspondingOutputImage = allCorrespondingOutputs[0]

  console.log('🖼️ [currentImage] COMPUTED RESULT:', {
    currentImageIndex: currentImageIndex.value,
    selectedSourceImage: {
      uuid: selectedSourceImage.uuid,
      filename: selectedSourceImage.filename,
      created_at: selectedSourceImage.created_at
    },
    allCorrespondingOutputs: allCorrespondingOutputs.map(img => ({
      uuid: img.uuid,
      filename: img.filename,
      source_media_uuid_ref: img.source_media_uuid_ref
    })),
    selectedOutput: correspondingOutputImage ? {
      uuid: correspondingOutputImage.uuid,
      filename: correspondingOutputImage.filename,
      source_media_uuid_ref: correspondingOutputImage.source_media_uuid_ref,
      created_at: correspondingOutputImage.created_at
    } : null,
    multipleOutputsForSameSource: allCorrespondingOutputs.length > 1,
    outputCount: allCorrespondingOutputs.length
  })

  if (!correspondingOutputImage) {
    console.log('🚨 [currentImage] No corresponding output image found for source:', selectedSourceImage.uuid)
  }

  return correspondingOutputImage || null
})


const imageTransformStyle = computed(() => {
  const state = sharedZoomState.value
  return {
    transform: `scale(${state.scale}) translate(${state.translateX}px, ${state.translateY}px)`,
    transformOrigin: 'center center'
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
  if (props.needInputJobs.length > 1) {
    if (currentJobIndex.value > 0) {
      currentJobIndex.value--
    } else {
      // Wrap to last job
      currentJobIndex.value = props.needInputJobs.length - 1
    }
    const newJob = props.needInputJobs[currentJobIndex.value]
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
      limit: outputImageLimit.value,
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
    console.log('🎬 Destination video loaded:', response)
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
}

// Image loading event handlers
const onImageLoad = () => {
  console.log('🖼️ Image loaded successfully')
  isCurrentImageLoading.value = false
  // Update last loaded image to current image once it's loaded
  if (currentImage.value) {
    lastLoadedImage.value = currentImage.value
  }
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
      console.log('✅ Preloaded image:', imageData.filename)
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
  console.log('🚀 Starting progressive image preloading for', preloadQueue.value.length, 'images')
  
  // Preload images one by one to avoid overwhelming the browser
  for (const imageData of preloadQueue.value) {
    try {
      await preloadImage(imageData)
      // Small delay between preloads to keep UI responsive
      await new Promise(resolve => setTimeout(resolve, 50))
    } catch (error) {
      console.error('Preload error:', error)
    }
  }
  
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

const goToPreviousImage = () => {
  if (sourceImages.value.length > 1) {
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
  if (event.touches && event.touches.length > 1) {
    // Check if the touch is inside our image container
    if (imageContainer.value && imageContainer.value.contains(event.target)) {
      // Allow our custom zoom to handle it
      return
    }
    // Block zoom everywhere else
    event.preventDefault()
    event.stopPropagation()
  }
}

const preventGlobalGesture = (event) => {
  // Check if the gesture is inside our image container
  if (imageContainer.value && imageContainer.value.contains(event.target)) {
    // Allow our custom zoom to handle it
    return
  }
  // Block gestures everywhere else
  event.preventDefault()
  event.stopPropagation()
}

// Add global keyboard event listener when modal opens
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
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

// Helper methods for safe URL generation
const getImageUrl = (image, size = 'md') => {
  if (!image || !image.uuid) {
    console.log('⚠️ getImageUrl: Invalid image:', image)
    return ''
  }

  // Remove cache-busting for smoother transitions
  const url = `/api/media/${image.uuid}/image?size=${size}`
  
  // Check if image is preloaded for faster access
  const isPreloaded = preloadedImages.value.has(image.uuid)
  console.log('🔗 [SourceImageModal] Generated image URL:', url, 'for image:', {
    uuid: image.uuid,
    filename: image.filename,
    purpose: image.purpose,
    source_media_uuid_ref: image.source_media_uuid_ref,
    currentImageIndex: currentImageIndex.value,
    preloaded: isPreloaded
  })
  return url
}

const getThumbnailUrl = (image) => {
  if (!image || !image.uuid) return ''

  // Always use the main image UUID with thumbnail size for consistent performance
  const url = `/api/media/${image.uuid}/image?size=thumbnail`
  console.log('🔗 [SourceImageModal] Generated thumbnail URL:', url, 'for image:', image.uuid)
  return url
}

// Zoom functionality methods
const updateSharedZoom = (updates) => {
  Object.assign(sharedZoomState.value, updates)
}

const resetZoom = () => {
  updateSharedZoom({ scale: 1, translateX: 0, translateY: 0 })
}

const constrainTranslation = (scale, translateX, translateY) => {
  if (!imageContainer.value || !zoomableImage.value) return { translateX, translateY }

  const containerRect = imageContainer.value.getBoundingClientRect()
  const imageRect = zoomableImage.value.getBoundingClientRect()

  // Calculate the scaled image dimensions
  const scaledWidth = imageRect.width * scale
  const scaledHeight = imageRect.height * scale

  // Calculate max translation to keep image within container
  const maxTranslateX = Math.max(0, (scaledWidth - containerRect.width) / 2 / scale)
  const maxTranslateY = Math.max(0, (scaledHeight - containerRect.height) / 2 / scale)

  return {
    translateX: Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX)),
    translateY: Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY))
  }
}

const handleWheel = (event) => {
  if (!currentImage.value) return

  event.preventDefault()

  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const currentState = sharedZoomState.value
  const newScale = Math.max(0.5, Math.min(5, currentState.scale + delta))

  if (newScale !== currentState.scale) {
    updateSharedZoom({ scale: newScale })
  }
}

const handleMouseDown = (event) => {
  if (!currentImage.value || sharedZoomState.value.scale <= 1) return

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
  if (!currentImage.value) return

  // Aggressively prevent default behavior
  event.preventDefault()
  event.stopPropagation()

  if (event.touches.length === 1) {
    // Single touch - start dragging if zoomed
    if (sharedZoomState.value.scale > 1) {
      isDragging.value = true
      const touch = event.touches[0]
      dragStart.value = { x: touch.clientX, y: touch.clientY }
    }
  } else if (event.touches.length === 2) {
    // Two touches - start zooming
    isZooming.value = true
    isDragging.value = false
    lastTouchDistance.value = getTouchDistance(event.touches)
  }
}

const handleTouchMove = (event) => {
  if (!currentImage.value) return

  // Aggressively prevent default behavior
  event.preventDefault()
  event.stopPropagation()

  if (event.touches.length === 1 && isDragging.value) {
    // Single touch drag
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
    // Two touch zoom
    const currentDistance = getTouchDistance(event.touches)
    const distanceRatio = currentDistance / lastTouchDistance.value

    const currentState = sharedZoomState.value
    const newScale = Math.max(0.5, Math.min(5, currentState.scale * distanceRatio))

    updateSharedZoom({ scale: newScale })
    lastTouchDistance.value = currentDistance
  }
}

const handleTouchEnd = (event) => {
  // Prevent default behavior
  event.preventDefault()
  event.stopPropagation()

  if (event.touches.length === 0) {
    isDragging.value = false
    isZooming.value = false
  } else if (event.touches.length === 1) {
    isZooming.value = false
    // Continue dragging with remaining touch
    if (sharedZoomState.value.scale > 1) {
      isDragging.value = true
      const touch = event.touches[0]
      dragStart.value = { x: touch.clientX, y: touch.clientY }
    }
  }
}

// Watch for job changes to load images
watch(() => props.job, (newJob) => {
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

// Method to reload images when limits change
const reloadImagesForCurrentJob = () => {
  if (props.job && props.modelValue) {
    console.log('🔄 Reloading images due to limit change')
    loadImagesForJob(props.job)
  }
}
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