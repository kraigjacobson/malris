<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'max-w-4xl' }">
    <template #header>
      <h3 class="text-lg font-semibold">Select Source Image</h3>
    </template>
    
    <template #body>
      <div class="space-y-4">

        <!-- Job Details Accordion (always show) -->
        <div class="mb-4">
          <UAccordion :items="jobDetailsItems">
            <template #job-info>
              <div class="space-y-3 text-left">
                <div class="flex flex-col space-y-1">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Job ID</span>
                  <span class="text-sm text-gray-600 dark:text-gray-400">{{ job?.id }}</span>
                </div>
                <div class="flex flex-col space-y-1">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Image Count</span>
                  <span class="text-sm text-gray-600 dark:text-gray-400">{{ sourceImages.length }} subject images available</span>
                </div>
                <div class="flex flex-col space-y-1">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Current Selection</span>
                  <span class="text-sm text-gray-600 dark:text-gray-400">Image {{ currentImageIndex + 1 }} of {{ sourceImages.length }}</span>
                </div>
              </div>
            </template>
          </UAccordion>
        </div>

        <!-- Loading State -->
        <div v-if="isLoadingImages && outputImages.length === 0" class="text-center">
          <!-- Main Image Skeleton -->
          <div class="relative inline-block max-w-full">
            <div class="w-96 h-64 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mx-auto"></div>
          </div>
          
          <!-- Details Skeleton -->
          <div class="mt-4 space-y-2">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/3 mx-auto"></div>
            <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/4 mx-auto"></div>
          </div>
        </div>

        <!-- No Images State -->
        <div v-else-if="!isLoadingImages && outputImages.length === 0" class="text-center py-8">
          <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-600 dark:text-gray-400">
            No images found for this job.
          </p>
        </div>

        <!-- Content (show when we have images or are loading with existing images) -->
        <div v-else>
          <!-- Current Image Display with Arrow Overlays -->
        <div v-if="currentImage" class="text-center">
          <!-- Image Display (only show when displayImages is true) -->
          <div v-if="settingsStore.displayImages" class="relative inline-block max-w-full group">
            <!-- Zoomable Image Container -->
            <div
              ref="imageContainer"
              class="relative overflow-hidden rounded-lg shadow-lg max-w-full max-h-96 mx-auto bg-gray-100 dark:bg-gray-800"
              style="touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;"
              @wheel.prevent="handleWheel"
              @mousedown.prevent="handleMouseDown"
              @touchstart.prevent="handleTouchStart"
              @touchmove.prevent="handleTouchMove"
              @touchend.prevent="handleTouchEnd"
              @gesturestart.prevent
              @gesturechange.prevent
              @gestureend.prevent
            >
              <img
                ref="zoomableImage"
                :src="getImageUrl(currentImage)"
                :alt="currentImage.filename"
                class="block transition-transform duration-200 ease-out select-none"
                :style="imageTransformStyle"
                @dragstart.prevent
              />
            </div>
            
            <!-- Left Arrow Overlay -->
            <div
              v-if="sourceImages.length > 1"
              class="absolute left-0 top-0 w-1/2 h-full flex items-center justify-start pl-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              @click="previousImage"
            >
              <UIcon name="i-heroicons-chevron-left" class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
            </div>
            
            <!-- Right Arrow Overlay -->
            <div
              v-if="sourceImages.length > 1"
              class="absolute right-0 top-0 w-1/2 h-full flex items-center justify-end pr-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              @click="nextImage"
            >
              <UIcon name="i-heroicons-chevron-right" class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
            </div>
            
            <!-- Image Counter -->
            <div v-if="sourceImages.length > 1" class="absolute top-2 left-2">
              <div class="bg-black bg-opacity-70 text-white text-sm font-medium px-2 py-1 rounded">
                {{ currentImageIndex + 1 }}/{{ sourceImages.length }}
              </div>
            </div>
            
            <!-- Delete Button -->
            <div class="absolute top-2 right-2">
              <UButton
                color="red"
                variant="solid"
                size="sm"
                icon="i-heroicons-trash"
                :loading="isDeletingImage"
                @click="deleteCurrentImage"
                class="opacity-80 hover:opacity-100 transition-opacity"
              />
            </div>
          </div>
          
          <!-- Image Placeholder (when images are hidden) -->
          <div v-else class="text-center py-8">
            <UIcon name="i-heroicons-photo" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p class="text-gray-600 dark:text-gray-400 mb-2">Image display is disabled</p>
            <p class="text-sm text-gray-500 dark:text-gray-500">{{ currentImage.filename }}</p>
            <div v-if="sourceImages.length > 1" class="mt-4 flex justify-center gap-4">
              <UButton
                variant="outline"
                size="sm"
                icon="i-heroicons-chevron-left"
                @click="previousImage"
                :disabled="sourceImages.length <= 1"
              >
                Previous
              </UButton>
              <span class="flex items-center text-sm text-gray-500">
                {{ currentImageIndex + 1 }} of {{ sourceImages.length }}
              </span>
              <UButton
                variant="outline"
                size="sm"
                icon="i-heroicons-chevron-right"
                @click="nextImage"
                :disabled="sourceImages.length <= 1"
              >
                Next
              </UButton>
            </div>
          </div>
          
          <!-- Image Details Accordion -->
          <div class="mt-4">
            <UAccordion :items="imageDetailsItems">
              <template #details>
                <div class="space-y-3 text-left">
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Filename</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400 break-all">{{ currentImage.filename }}</span>
                  </div>
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">UUID</span>
                    <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ currentImage.uuid }}</span>
                  </div>
                  <div v-if="currentImage.width && currentImage.height" class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Dimensions</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ currentImage.width }} × {{ currentImage.height }}</span>
                  </div>
                  <div v-if="currentImage.file_size" class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Size</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatFileSize(currentImage.file_size) }}</span>
                  </div>
                  
                </div>
              </template>
            </UAccordion>
          </div>
        </div>

          <!-- Subject Images Thumbnail Strip (only show when displayImages is true) -->
          <div v-if="settingsStore.displayImages && (sourceImages.length > 0 || isLoadingSourceImages)" class="mt-4">
            <div v-if="isLoadingSourceImages && sourceImages.length === 0" class="flex gap-2 py-2">
              <!-- Thumbnail Skeletons -->
              <div v-for="i in 5" :key="i" class="shrink-0 w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
            <div v-else ref="thumbnailStrip" class="flex gap-2 overflow-x-auto py-2 scroll-smooth">
              <div
                v-for="(sourceImage, index) in sourceImages"
                :key="sourceImage.uuid"
                :ref="el => { if (el) thumbnailRefs[index] = el }"
                class="shrink-0 w-16 h-16 rounded cursor-pointer border-2 transition-colors"
                :class="index === currentImageIndex ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
                @click="currentImageIndex = index"
              >
                <img
                  :src="getThumbnailUrl(sourceImage)"
                  :alt="sourceImage.filename"
                  class="w-full h-full object-cover rounded"
                />
              </div>
            </div>
            </div>
          </div>
        </div>
    </template>

    <template #footer>
      <div class="flex justify-between">
        <UButton
          variant="outline"
          @click="closeModal"
          :disabled="isSubmittingSource || isDeletingJob"
        >
          Cancel
        </UButton>
        <div v-if="currentImage" class="flex gap-2">
          <UButton
            color="red"
            variant="outline"
            icon="i-heroicons-trash"
            :loading="isDeletingJob"
            @click="handleDeleteJob"
            :disabled="isSubmittingSource"
          >
            Delete Job
          </UButton>
          <UButton
            color="primary"
            :loading="isSubmittingSource"
            @click="selectCurrentImage"
            :disabled="isDeletingJob"
          >
            Select This Image
          </UButton>
        </div>
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
  job: {
    type: Object,
    default: null
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'imageSelected', 'jobDeleted'])

// Initialize settings store
const settingsStore = useSettingsStore()

// Reactive data
const outputImages = ref([]) // Output images for main display
const sourceImages = ref([]) // Subject images for thumbnail strip
const currentImageIndex = ref(0)
const isLoadingImages = ref(false)
const isLoadingSourceImages = ref(false)
const isSubmittingSource = ref(false)
const isDeletingImage = ref(false)
const thumbnailStrip = ref(null)
const thumbnailRefs = ref({})

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

// Computed
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const currentImage = computed(() => {
  // Get the currently selected source image
  const selectedSourceImage = sourceImages.value[currentImageIndex.value]
  if (!selectedSourceImage) return null
  
  // Find the output image that corresponds to this source image
  const correspondingOutputImage = outputImages.value.find(outputImg =>
    outputImg.source_media_uuid_ref === selectedSourceImage.uuid
  )
  
  console.log('🖼️ Current image computed:', {
    currentImageIndex: currentImageIndex.value,
    selectedSourceImageUuid: selectedSourceImage.uuid,
    correspondingOutputImage: correspondingOutputImage,
    outputImagesLength: outputImages.value.length,
    sourceImagesLength: sourceImages.value.length
  })
  
  return correspondingOutputImage || null
})

const imageDetailsItems = computed(() => {
  if (!currentImage.value) return []
  
  return [{
    label: 'Image Details',
    slot: 'details'
  }]
})

const jobDetailsItems = computed(() => {
  return [{
    label: 'Job Details',
    slot: 'job-info'
  }]
})

const imageTransformStyle = computed(() => {
  const state = sharedZoomState.value
  return {
    transform: `scale(${state.scale}) translate(${state.translateX}px, ${state.translateY}px)`,
    transformOrigin: 'center center'
  }
})

// Methods
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
    // Get output images for this job that have source_media_uuid_ref
    const searchParams = {
      media_type: 'image',
      purpose: 'output',
      job_id: job.id,
      limit: 100,
      include_thumbnails: false,
      sort_by: 'created_at',
      sort_order: 'desc',
      tag_match_mode: 'partial'
    }
    
    // Include dest_media_uuid_ref if available
    if (job.dest_media_uuid) {
      searchParams.dest_media_uuid_ref = job.dest_media_uuid
    }
    
    const searchStartTime = performance.now()
    console.log(`⏱️ [SourceImageModal] Starting output images search...`)
    
    const response = await useApiFetch('media/search', {
      query: searchParams
    })
    
    const searchEndTime = performance.now()
    console.log(`⏱️ [SourceImageModal] ✅ Output search completed in ${(searchEndTime - searchStartTime).toFixed(2)}ms`)
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
}

const loadSourceImagesForJob = async (job) => {
  if (!job || !job.subject_uuid) return
  
  const startTime = performance.now()
  console.log(`⏱️ [SourceImageModal] Starting loadSourceImagesForJob for subject: ${job.subject_uuid}`)
  
  isLoadingSourceImages.value = true
  try {
    const subjectSourceParams = {
      media_type: 'image',
      purpose: 'source',
      subject_uuid: job.subject_uuid,
      limit: 100,
      include_thumbnails: false,
      sort_by: 'created_at',
      sort_order: 'desc'
    }
    
    const searchStartTime = performance.now()
    console.log(`⏱️ [SourceImageModal] Starting source images search...`)
    
    const subjectSourceResponse = await useApiFetch('media/search', {
      query: subjectSourceParams
    })
    
    const searchEndTime = performance.now()
    console.log(`⏱️ [SourceImageModal] ✅ Source search completed in ${(searchEndTime - searchStartTime).toFixed(2)}ms`)
    console.log('🔍 Source search response:', subjectSourceResponse)
    
    if (subjectSourceResponse.results && Array.isArray(subjectSourceResponse.results)) {
      // Filter source images to only include those that have corresponding output images
      const sourceImagesWithOutputs = subjectSourceResponse.results.filter(sourceImg =>
        outputImages.value.some(outputImg => outputImg.source_media_uuid_ref === sourceImg.uuid)
      )
      
      console.log('👤 Found source images with outputs:', sourceImagesWithOutputs.length, 'out of', subjectSourceResponse.results.length, 'total source images')
      sourceImages.value = sourceImagesWithOutputs
    } else {
      console.log('❌ No source images found in response')
      sourceImages.value = []
    }
  } catch (error) {
    console.error('Failed to load subject source images:', error)
    sourceImages.value = []
  } finally {
    isLoadingSourceImages.value = false
    const endTime = performance.now()
    console.log(`⏱️ [SourceImageModal] ✅ loadSourceImagesForJob TOTAL TIME: ${(endTime - startTime).toFixed(2)}ms`)
  }
}

const closeModal = () => {
  isOpen.value = false
  // Clear all image data to prevent continued loading
  outputImages.value = []
  sourceImages.value = []
  currentImageIndex.value = 0
  isLoadingImages.value = false
  isLoadingSourceImages.value = false
  isSubmittingSource.value = false
  isDeletingImage.value = false
}

const previousImage = () => {
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

const nextImage = () => {
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
  // Only handle arrow keys when modal is open and has images
  if (!isOpen.value || sourceImages.value.length === 0) return
  
  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      previousImage()
      break
    case 'ArrowRight':
      event.preventDefault()
      nextImage()
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
    
    // Close the modal
    closeModal()
    
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
    
    // Close the modal
    closeModal()
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
  
  const url = `/api/media/${image.uuid}/image?size=${size}`
  console.log('🔗 [SourceImageModal] Generated image URL:', url, 'for image:', image.uuid)
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
    currentImageIndex.value = 0
    loadImagesForJob(newJob)
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
</script>