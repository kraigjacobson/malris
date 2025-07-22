<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'max-w-4xl' }">
    <template #header>
      <h3 class="text-lg font-semibold">Select Source Image</h3>
    </template>
    
    <template #body>
      <div v-if="isLoadingImages" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
      </div>

      <div v-else-if="availableImages.length === 0" class="text-center py-8">
        <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p class="text-gray-600 dark:text-gray-400">
          No images found for this job.
        </p>
      </div>

      <div v-else class="space-y-4">
        <!-- Job Details Accordion -->
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
                  <span class="text-sm text-gray-600 dark:text-gray-400">{{ availableImages.length }} images available</span>
                </div>
                <div class="flex flex-col space-y-1">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Current Selection</span>
                  <span class="text-sm text-gray-600 dark:text-gray-400">Image {{ currentImageIndex + 1 }} of {{ availableImages.length }}</span>
                </div>
              </div>
            </template>
          </UAccordion>
        </div>

        <!-- Current Image Display with Arrow Overlays -->
        <div v-if="currentImage" class="text-center">
          <div class="relative inline-block max-w-full group">
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
                :src="currentImage.thumbnail_uuid ? `/api/media/${currentImage.thumbnail_uuid}/image?size=sm` : `/api/media/${currentImage.uuid}/image?size=sm`"
                :alt="currentImage.filename"
                class="block transition-transform duration-200 ease-out select-none"
                :style="imageTransformStyle"
                @dragstart.prevent
              />
            </div>
            
            <!-- Left Arrow Overlay -->
            <div
              v-if="availableImages.length > 1"
              class="absolute left-0 top-0 w-1/2 h-full flex items-center justify-start pl-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              @click="previousImage"
            >
              <UIcon name="i-heroicons-chevron-left" class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
            </div>
            
            <!-- Right Arrow Overlay -->
            <div
              v-if="availableImages.length > 1"
              class="absolute right-0 top-0 w-1/2 h-full flex items-center justify-end pr-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              @click="nextImage"
            >
              <UIcon name="i-heroicons-chevron-right" class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
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

        <!-- Thumbnail Strip -->
        <div v-if="availableImages.length > 1" ref="thumbnailStrip" class="flex gap-2 overflow-x-auto py-2 scroll-smooth">
          <div
            v-for="(image, index) in availableImages"
            :key="image.uuid"
            :ref="el => { if (el) thumbnailRefs[index] = el }"
            class="shrink-0 w-16 h-16 rounded cursor-pointer border-2 transition-colors"
            :class="index === currentImageIndex ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
            @click="currentImageIndex = index"
          >
            <img
              :src="image.thumbnail_uuid ? `/api/media/${image.thumbnail_uuid}/image?size=sm` : `/api/media/${image.uuid}/image?size=sm`"
              :alt="image.filename"
              class="w-full h-full object-cover rounded"
            />
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

// Reactive data
const availableImages = ref([])
const currentImageIndex = ref(0)
const isLoadingImages = ref(false)
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
  return availableImages.value[currentImageIndex.value] || null
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
  
  isLoadingImages.value = true
  try {
    // Search for output images generated by this specific job
    // For "needs input" jobs, these are the test images generated during the test workflow
    const searchParams = {
      media_type: 'image',
      purpose: 'output',
      job_id: job.id,
      limit: 100,
      include_thumbnails: true,
      sort_by: 'created_at',
      sort_order: 'desc'
    }
    
    // Include dest_media_uuid_ref if available, as the media server seems to expect it
    if (job.dest_media_uuid) {
      searchParams.dest_media_uuid_ref = job.dest_media_uuid
    }
    
    const response = await useApiFetch('media/search', {
      query: searchParams
    })
    
    if (response.results && Array.isArray(response.results)) {
      availableImages.value = response.results
    } else {
      availableImages.value = []
    }
  } catch (error) {
    console.error('Failed to load images for job:', error)
    availableImages.value = []
  } finally {
    isLoadingImages.value = false
  }
}

const closeModal = () => {
  isOpen.value = false
  // Clear all image data to prevent continued loading
  availableImages.value = []
  currentImageIndex.value = 0
  isLoadingImages.value = false
  isSubmittingSource.value = false
  isDeletingImage.value = false
}

const previousImage = () => {
  if (availableImages.value.length > 1) {
    if (currentImageIndex.value > 0) {
      currentImageIndex.value--
    } else {
      // Wrap to last image
      currentImageIndex.value = availableImages.value.length - 1
    }
    scrollToCurrentThumbnail()
  }
}

const nextImage = () => {
  if (availableImages.value.length > 1) {
    if (currentImageIndex.value < availableImages.value.length - 1) {
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
  if (!isOpen.value || availableImages.value.length === 0) return
  
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
  
  isSubmittingSource.value = true
  try {
    await useApiFetch(`jobs/${props.job.id}/add-source`, {
      method: 'POST',
      body: {
        source_media_uuid: currentImage.value.uuid
      }
    })
    
    // Emit success event
    emit('imageSelected', {
      job: props.job,
      selectedImage: currentImage.value
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
    
    // Remove the deleted image from the available images array
    const deletedIndex = currentImageIndex.value
    availableImages.value.splice(deletedIndex, 1)
    
    // Adjust current index if necessary
    if (availableImages.value.length === 0) {
      // No images left, close modal
      closeModal()
    } else if (deletedIndex >= availableImages.value.length) {
      // If we deleted the last image, go to the previous one
      currentImageIndex.value = availableImages.value.length - 1
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
    currentImageIndex.value = 0
    loadImagesForJob(newJob)
  }
}, { immediate: true })

// Watch for modal opening to load images
watch(() => props.modelValue, (isOpen) => {
  if (isOpen && props.job) {
    loadImagesForJob(props.job)
  } else if (!isOpen) {
    // Clean up when modal closes
    availableImages.value = []
    currentImageIndex.value = 0
    isLoadingImages.value = false
    isSubmittingSource.value = false
    isDeletingImage.value = false
  }
})

// Watch for currentImageIndex changes to auto-scroll thumbnail strip
watch(() => currentImageIndex.value, () => {
  scrollToCurrentThumbnail()
})
</script>