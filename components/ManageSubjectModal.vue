<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-semibold">
          {{ isEditMode ? `Manage Subject: ${subjectData.name}` : 'Add New Subject' }}
        </h3>
        <div v-if="hasMultipleSubjects && currentSubjectInfo" class="text-sm text-gray-600 dark:text-gray-400 font-medium">
          Subject {{ currentSubjectInfo.current }} of {{ currentSubjectInfo.total }}
        </div>
        <UButton
          variant="ghost"
          size="lg"
          icon="i-heroicons-x-mark"
          @click="closeModal"
          :disabled="isUploading || isSaving"
          class="ml-4"
        />
      </div>
    </template>

    <template #body>
      <div
        class="space-y-6 h-[600px] overflow-y-auto custom-scrollbar"
        @touchstart="handleSubjectSwipeTouchStart"
        @touchmove="handleSubjectSwipeTouchMove"
        @touchend="handleSubjectSwipeTouchEnd"
      >
        
        <!-- Subject Form -->
        <div class="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <!-- Name Field -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Subject Name *
            </label>
            <UInput
              v-model="subjectData.name"
              placeholder="Enter subject name..."
              :disabled="isUploading || isSaving"
              class="w-full"
            />
          </div>

          <!-- Tags Field -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tags
            </label>
            <UInputTags
              v-model="subjectData.tags"
              placeholder="Add tags (e.g., portrait, landscape, anime)"
              :disabled="isUploading || isSaving"
              class="w-full"
              :ui="{ trailing: 'pe-1' }"
            >
              <template v-if="subjectData.tags?.length" #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  icon="i-lucide-circle-x"
                  aria-label="Clear all tags"
                  @click="subjectData.tags = []"
                />
              </template>
            </UInputTags>
          </div>
        </div>

        <!-- Current Images Display -->
        <div v-if="subjectImages.length > 0" class="space-y-4">
          <h4 class="text-sm font-semibold text-purple-700 dark:text-purple-400">Current Images</h4>
          
          <!-- Main Image Display -->
          <div v-if="currentImage" class="text-center">
            <div v-if="settingsStore.displayImages" class="relative w-full group">
              <div ref="imageContainer"
                class="relative overflow-hidden rounded-lg shadow-lg w-full bg-gray-100 dark:bg-gray-800"
                style="height: 384px; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;"
                @wheel.prevent="handleWheel" @mousedown.prevent="handleMouseDown" @touchstart.prevent="handleTouchStart"
                @touchmove.prevent="handleTouchMove" @touchend.prevent="handleTouchEnd" @gesturestart.prevent
                @gesturechange.prevent @gestureend.prevent>
                
                <img ref="zoomableImage"
                  v-if="currentImage"
                  :src="getImageUrl(currentImage)"
                  :alt="currentImage.filename"
                  class="absolute inset-0 w-full h-full object-cover object-top transition-all duration-200 ease-out select-none"
                  :style="imageTransformStyle"
                  :key="currentImage.uuid"
                  @dragstart.prevent />
              </div>

              <!-- Left Arrow Overlay -->
              <div v-if="subjectImages.length > 1"
                class="absolute left-0 top-0 w-1/2 h-full flex items-center justify-start pl-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                @click="goToPreviousImage">
                <UIcon name="i-heroicons-chevron-left"
                  class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
              </div>

              <!-- Right Arrow Overlay -->
              <div v-if="subjectImages.length > 1"
                class="absolute right-0 top-0 w-1/2 h-full flex items-center justify-end pr-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                @click="goToNextImage">
                <UIcon name="i-heroicons-chevron-right"
                  class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
              </div>

              <!-- Image Counter -->
              <div v-if="subjectImages.length > 1" class="absolute top-2 left-2">
                <div class="bg-black bg-opacity-70 text-white text-sm font-medium px-2 py-1 rounded">
                  {{ currentImageIndex + 1 }}/{{ subjectImages.length }}
                </div>
              </div>

              <!-- Delete Button -->
              <div class="absolute top-2 right-2">
                <UButton
                  color="error"
                  variant="solid"
                  size="sm"
                  icon="i-heroicons-trash"
                  :loading="isDeletingImage"
                  @click="confirmDeleteImage"
                  class="opacity-80 hover:opacity-100 transition-opacity" />
              </div>
            </div>

            <!-- Image Placeholder (when images are hidden) -->
            <div v-else class="text-center py-8">
              <UIcon name="i-heroicons-photo" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p class="text-gray-600 dark:text-gray-400 mb-2">Image display is disabled</p>
              <p class="text-sm text-gray-500 dark:text-gray-500">{{ currentImage.filename }}</p>
              <div v-if="subjectImages.length > 1" class="mt-4 flex justify-center gap-4">
                <UButton variant="outline" size="sm" icon="i-heroicons-chevron-left" @click="goToPreviousImage"
                  :disabled="subjectImages.length <= 1">
                  Previous
                </UButton>
                <span class="flex items-center text-sm text-gray-500">
                  {{ currentImageIndex + 1 }} of {{ subjectImages.length }}
                </span>
                <UButton variant="outline" size="sm" icon="i-heroicons-chevron-right" @click="goToNextImage"
                  :disabled="subjectImages.length <= 1">
                  Next
                </UButton>
              </div>
            </div>

            <!-- Thumbnail Strip -->
            <div v-if="settingsStore.displayImages && subjectImages.length > 0" class="mt-4">
              <div ref="thumbnailStrip" class="flex gap-2 overflow-x-auto py-2 scroll-smooth">
                <div v-for="(image, index) in subjectImages" :key="image.uuid"
                  :ref="el => { if (el) thumbnailRefs[index] = el }"
                  class="shrink-0 w-16 h-16 rounded cursor-pointer border-2 transition-colors"
                  :class="index === currentImageIndex ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
                  @click="currentImageIndex = index">
                  <img :src="getThumbnailUrl(image)" :alt="image.filename"
                    class="w-full h-full object-cover object-top rounded" />
                </div>
              </div>
            </div>

            <!-- Image Information Panel -->
            <div class="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <div class="space-y-2 text-left">
                <h4 class="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2">Image Details</h4>
                <div class="space-y-1 text-sm">
                  <div>
                    <span class="font-medium text-gray-600 dark:text-gray-400">UUID:</span>
                    <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ currentImage.uuid }}</div>
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
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- No Images State -->
        <div v-else-if="!isLoadingImages" class="text-center py-8">
          <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-600 dark:text-gray-400">
            {{ isEditMode ? 'No images found for this subject.' : 'Upload images to get started.' }}
          </p>
        </div>

        

        <!-- Image Upload Section -->
        <div class="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h4 class="text-sm font-semibold text-green-700 dark:text-green-400">Subject Images</h4>
          
          <!-- File Upload -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Upload Images
            </label>
            <input
              ref="fileInput"
              type="file"
              multiple
              accept="image/*"
              @change="handleFileSelection"
              :disabled="isUploading || isSaving || !canUpload"
              class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p class="text-xs text-gray-500 mt-1">
              {{ isEditMode ? 'Select images to add to this subject' : 'Select images for the new subject (you can add more later)' }}
            </p>
          </div>

          <!-- Upload Progress -->
          <div v-if="isUploading" class="space-y-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
              <span class="text-sm">Uploading images...</span>
            </div>
            <UProgress :value="uploadProgress" />
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoadingImages" class="text-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl mb-4" />
          <p class="text-gray-600 dark:text-gray-400">Loading images...</p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between items-center w-full">
        <div class="flex gap-2">
          <UButton variant="outline" @click="closeModal" :disabled="isUploading || isSaving">
            Cancel
          </UButton>
          <!-- Subject Navigation Buttons -->
          <div v-if="hasMultipleSubjects" class="flex gap-2">
            <UButton
              variant="outline"
              size="lg"
              :disabled="isUploading || isSaving"
              @click="goToPreviousSubject"
              square
              class="w-12 h-12 flex items-center justify-center"
            >
              <UIcon name="i-heroicons-chevron-left" class="w-6 h-6" />
            </UButton>
            <UButton
              variant="outline"
              size="lg"
              :disabled="isUploading || isSaving"
              @click="goToNextSubject"
              square
              class="w-12 h-12 flex items-center justify-center"
            >
              <UIcon name="i-heroicons-chevron-right" class="w-6 h-6" />
            </UButton>
          </div>
        </div>
        <div class="flex gap-2">
          <UButton 
            v-if="!isEditMode"
            color="primary" 
            :loading="isSaving" 
            @click="createSubject" 
            :disabled="!subjectData.name.trim() || isUploading"
          >
            Create Subject
          </UButton>
          <UButton 
            v-else
            color="primary" 
            :loading="isSaving" 
            @click="updateSubject" 
            :disabled="!subjectData.name.trim() || isUploading"
          >
            Save Changes
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { useGesture } from '~/composables/useGesture'

// Use Nuxt's device detection
const { isMobile } = useDevice()

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  subject: {
    type: Object,
    default: null
  },
  subjects: {
    type: Array,
    default: () => []
  },
  currentSubjectIndex: {
    type: Number,
    default: 0
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'subjectCreated', 'subjectUpdated', 'subjectChanged'])

// Initialize settings store
const settingsStore = useSettingsStore()

// Reactive data
const subjectData = ref({
  name: '',
  tags: [],
  note: ''
})

const subjectImages = ref([])
const currentImageIndex = ref(0)
const isLoadingImages = ref(false)
const isUploading = ref(false)
const isSaving = ref(false)
const isDeletingImage = ref(false)
const uploadProgress = ref(0)
const fileInput = ref(null)
const thumbnailStrip = ref(null)
const thumbnailRefs = ref({})
const createdSubject = ref(null)

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

// Computed
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const isEditMode = computed(() => !!props.subject)

const currentSubject = computed(() => props.subject || createdSubject.value)

const canUpload = computed(() => {
  return isEditMode.value || subjectData.value.name.trim()
})

const currentImage = computed(() => {
  return subjectImages.value[currentImageIndex.value] || null
})

const imageTransformStyle = computed(() => {
  const state = sharedZoomState.value
  return {
    transform: `scale(${state.scale}) translate(${state.translateX}px, ${state.translateY}px)`,
    transformOrigin: 'center center'
  }
})

// Subject navigation computed properties
const hasMultipleSubjects = computed(() => props.subjects.length > 1)

const currentSubjectInfo = computed(() => {
  if (props.subjects.length === 0) return null
  return {
    current: props.currentSubjectIndex + 1,
    total: props.subjects.length
  }
})

// Methods
const closeModal = () => {
  if (isUploading.value || isSaving.value) return
  
  isOpen.value = false
  resetForm()
  resetZoom()
}

const resetForm = () => {
  subjectData.value = {
    name: '',
    tags: [],
    note: ''
  }
  subjectImages.value = []
  currentImageIndex.value = 0
  uploadProgress.value = 0
  createdSubject.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const loadSubjectData = () => {
  if (props.subject) {
    subjectData.value = {
      name: props.subject.name || '',
      tags: props.subject.tags?.tags || [],
      note: props.subject.note || ''
    }
    loadSubjectImages()
  }
}

const loadSubjectImages = async () => {
  if (!currentSubject.value?.id) return

  isLoadingImages.value = true
  try {
    const response = await useApiFetch('media/search', {
      query: {
        subject_uuid: currentSubject.value.id,
        purpose: 'source',
        media_type: 'image',
        limit: 1000,
        sort_by: 'created_at',
        sort_order: 'asc'
      }
    })

    subjectImages.value = response.results || []
    currentImageIndex.value = 0
  } catch (error) {
    console.error('Failed to load subject images:', error)
    subjectImages.value = []
  } finally {
    isLoadingImages.value = false
  }
}

const handleFileSelection = async (event) => {
  const files = Array.from(event.target.files || [])
  if (files.length === 0) return

  if (!canUpload.value) {
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: 'Please enter a subject name before uploading images',
      color: 'red',
      timeout: 3000
    })
    return
  }

  // If we're creating a new subject, create it first
  if (!isEditMode.value) {
    const created = await createSubject(false)
    if (!created) return
    
    // Wait a moment for the subject to be fully created
    await nextTick()
  }

  await uploadImages(files)
}

const uploadImages = async (files) => {
  if (!currentSubject.value?.id) return

  isUploading.value = true
  uploadProgress.value = 0

  try {
    const formData = new FormData()
    formData.append('subject_uuid', currentSubject.value.id)
    
    files.forEach(file => {
      formData.append('images', file)
    })

    const response = await $fetch('/api/media/upload-subject-images', {
      method: 'POST',
      body: formData,
      onUploadProgress: (progress) => {
        uploadProgress.value = Math.round((progress.loaded / progress.total) * 100)
      }
    })

    if (response.success) {
      const toast = useToast()
      toast.add({
        title: 'Success',
        description: response.message,
        color: 'green',
        timeout: 3000
      })

      // Reload images
      await loadSubjectImages()
      
      // Clear file input
      if (fileInput.value) {
        fileInput.value.value = ''
      }
    }
  } catch (error) {
    console.error('Upload failed:', error)
    const toast = useToast()
    toast.add({
      title: 'Upload Failed',
      description: error.data?.message || 'Failed to upload images',
      color: 'red',
      timeout: 5000
    })
  } finally {
    isUploading.value = false
    uploadProgress.value = 0
  }
}

const createSubject = async (closeAfter = true) => {
  if (!subjectData.value.name.trim()) return false

  isSaving.value = true
  try {
    const response = await useApiFetch('subjects/create', {
      method: 'POST',
      body: {
        name: subjectData.value.name.trim(),
        tags: subjectData.value.tags,
        note: subjectData.value.note.trim() || null
      }
    })

    if (response.id) {
      // Create a temporary subject object for subsequent operations
      const newSubject = {
        id: response.id,
        name: response.name || subjectData.value.name,
        created_at: response.created_at
      }
      
      // Update the component's subject reference for image uploads
      createdSubject.value = newSubject
      
      // Emit the created subject
      emit('subjectCreated', newSubject)

      const toast = useToast()
      toast.add({
        title: 'Success',
        description: 'Subject created successfully',
        color: 'green',
        timeout: 3000
      })

      if (closeAfter) {
        closeModal()
      }
      return newSubject
    }
  } catch (error) {
    console.error('Failed to create subject:', error)
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to create subject',
      color: 'red',
      timeout: 5000
    })
    return false
  } finally {
    isSaving.value = false
  }
}

const updateSubject = async () => {
  if (!currentSubject.value?.id || !subjectData.value.name.trim()) return

  isSaving.value = true
  try {
    // Update subject tags
    await useApiFetch(`subjects/${currentSubject.value.id}/tags`, {
      method: 'PUT',
      body: {
        tags: subjectData.value.tags
      }
    })

    emit('subjectUpdated', {
      ...currentSubject.value,
      tags: { tags: subjectData.value.tags }
    })

    const toast = useToast()
    toast.add({
      title: 'Success',
      description: 'Subject updated successfully',
      color: 'green',
      timeout: 3000
    })

    closeModal()
  } catch (error) {
    console.error('Failed to update subject:', error)
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to update subject',
      color: 'red',
      timeout: 5000
    })
  } finally {
    isSaving.value = false
  }
}

const confirmDeleteImage = async () => {
  if (!currentImage.value) return

  const confirmed = confirm(`Are you sure you want to delete "${currentImage.value.filename}"? This action cannot be undone.`)
  
  if (!confirmed) return

  await deleteCurrentImage()
}

const deleteCurrentImage = async () => {
  if (!currentImage.value) return

  isDeletingImage.value = true
  try {
    await useApiFetch(`media/${currentImage.value.uuid}/delete`, {
      method: 'DELETE'
    })

    // Remove from local array
    subjectImages.value.splice(currentImageIndex.value, 1)

    // Adjust current index if necessary
    if (subjectImages.value.length === 0) {
      currentImageIndex.value = 0
    } else if (currentImageIndex.value >= subjectImages.value.length) {
      currentImageIndex.value = subjectImages.value.length - 1
    }

    const toast = useToast()
    toast.add({
      title: 'Success',
      description: 'Image deleted successfully',
      color: 'green',
      timeout: 3000
    })
  } catch (error) {
    console.error('Failed to delete image:', error)
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: 'Failed to delete image',
      color: 'red',
      timeout: 5000
    })
  } finally {
    isDeletingImage.value = false
  }
}

const goToPreviousImage = () => {
  if (subjectImages.value.length > 1) {
    if (currentImageIndex.value > 0) {
      currentImageIndex.value--
    } else {
      currentImageIndex.value = subjectImages.value.length - 1
    }
    scrollToCurrentThumbnail()
  }
}

const goToNextImage = () => {
  if (subjectImages.value.length > 1) {
    if (currentImageIndex.value < subjectImages.value.length - 1) {
      currentImageIndex.value++
    } else {
      currentImageIndex.value = 0
    }
    scrollToCurrentThumbnail()
  }
}

const scrollToCurrentThumbnail = () => {
  nextTick(() => {
    if (thumbnailStrip.value && thumbnailRefs.value[currentImageIndex.value]) {
      const selectedThumbnail = thumbnailRefs.value[currentImageIndex.value]
      const stripContainer = thumbnailStrip.value

      const thumbnailLeft = selectedThumbnail.offsetLeft
      const thumbnailWidth = selectedThumbnail.offsetWidth
      const stripWidth = stripContainer.clientWidth

      const scrollPosition = thumbnailLeft - (stripWidth / 2) + (thumbnailWidth / 2)

      stripContainer.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      })
    }
  })
}

const formatFileSize = (bytes) => {
  if (!bytes) return 'Unknown'
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

const getImageUrl = (image, size = 'md') => {
  if (!image || !image.uuid) return ''
  return `/api/media/${image.uuid}/image?size=${size}`
}

const getThumbnailUrl = (image) => {
  if (!image || !image.uuid) return ''
  return `/api/media/${image.uuid}/image?size=thumbnail`
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

  const scaledWidth = imageRect.width * scale
  const scaledHeight = imageRect.height * scale

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

  event.preventDefault()
  event.stopPropagation()

  if (event.touches.length === 1) {
    if (sharedZoomState.value.scale > 1) {
      isDragging.value = true
      const touch = event.touches[0]
      dragStart.value = { x: touch.clientX, y: touch.clientY }
    }
  } else if (event.touches.length === 2) {
    isZooming.value = true
    isDragging.value = false
    lastTouchDistance.value = getTouchDistance(event.touches)
  }
}

const handleTouchMove = (event) => {
  if (!currentImage.value) return

  event.preventDefault()
  event.stopPropagation()

  if (event.touches.length === 1 && isDragging.value) {
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
    const currentDistance = getTouchDistance(event.touches)
    const distanceRatio = currentDistance / lastTouchDistance.value

    const currentState = sharedZoomState.value
    const newScale = Math.max(0.5, Math.min(5, currentState.scale * distanceRatio))

    updateSharedZoom({ scale: newScale })
    lastTouchDistance.value = currentDistance
  }
}

const handleTouchEnd = (event) => {
  event.preventDefault()
  event.stopPropagation()

  if (event.touches.length === 0) {
    isDragging.value = false
    isZooming.value = false
  } else if (event.touches.length === 1) {
    isZooming.value = false
    if (sharedZoomState.value.scale > 1) {
      isDragging.value = true
      const touch = event.touches[0]
      dragStart.value = { x: touch.clientX, y: touch.clientY }
    }
  }
}

// Subject navigation gesture handling
const {
  handleTouchStart: originalSubjectSwipeTouchStart,
  handleTouchMove: originalSubjectSwipeTouchMove,
  handleTouchEnd: originalSubjectSwipeTouchEnd
} = useGesture({
  minSwipeDistance: 50,
  onSwipeLeft: () => {
    console.log('🔥 [GESTURE DEBUG] onSwipeLeft callback triggered', {
      hasMultipleSubjects: hasMultipleSubjects.value,
      subjects: props.subjects,
      currentIndex: props.currentSubjectIndex
    })
    if (hasMultipleSubjects.value) {
      console.log('🔥 [GESTURE DEBUG] Calling goToNextSubject')
      goToNextSubject()
    } else {
      console.log('🔥 [GESTURE DEBUG] Not calling goToNextSubject - hasMultipleSubjects is false')
    }
  },
  onSwipeRight: () => {
    console.log('🔥 [GESTURE DEBUG] onSwipeRight callback triggered', {
      hasMultipleSubjects: hasMultipleSubjects.value,
      subjects: props.subjects,
      currentIndex: props.currentSubjectIndex
    })
    if (hasMultipleSubjects.value) {
      console.log('🔥 [GESTURE DEBUG] Calling goToPreviousSubject')
      goToPreviousSubject()
    } else {
      console.log('🔥 [GESTURE DEBUG] Not calling goToPreviousSubject - hasMultipleSubjects is false')
    }
  },
  debug: true
})

// Wrapper functions that check for image container interference
const handleSubjectSwipeTouchStart = (event) => {
  console.log('🔥 [SUBJECT SWIPE DEBUG] handleSubjectSwipeTouchStart called', {
    target: event.target,
    imageContainer: imageContainer.value,
    contains: imageContainer.value?.contains(event.target),
    targetClasses: event.target?.className
  })
  
  // Check if the touch is within the image container or its children
  if (imageContainer.value && imageContainer.value.contains(event.target)) {
    console.log('🔥 [SUBJECT SWIPE DEBUG] Touch started within image container, ignoring for subject swipe')
    return
  }
  
  console.log('🔥 [SUBJECT SWIPE DEBUG] Calling original touch start handler')
  originalSubjectSwipeTouchStart(event)
}

const handleSubjectSwipeTouchMove = (event) => {
  console.log('🔥 [SUBJECT SWIPE DEBUG] handleSubjectSwipeTouchMove called')
  
  // Check if the touch is within the image container or its children
  if (imageContainer.value && imageContainer.value.contains(event.target)) {
    console.log('🔥 [SUBJECT SWIPE DEBUG] Touch moved within image container, ignoring for subject swipe')
    return
  }
  
  console.log('🔥 [SUBJECT SWIPE DEBUG] Calling original touch move handler')
  originalSubjectSwipeTouchMove(event)
}

const handleSubjectSwipeTouchEnd = (event) => {
  console.log('🔥 [SUBJECT SWIPE DEBUG] handleSubjectSwipeTouchEnd called')
  
  // Check if the touch is within the image container or its children
  if (imageContainer.value && imageContainer.value.contains(event.target)) {
    console.log('🔥 [SUBJECT SWIPE DEBUG] Touch ended within image container, ignoring for subject swipe')
    return
  }
  
  console.log('🔥 [SUBJECT SWIPE DEBUG] Calling original touch end handler')
  originalSubjectSwipeTouchEnd(event)
}

// Subject navigation methods
const goToPreviousSubject = () => {
  console.log('🔥 [SUBJECT NAV DEBUG] goToPreviousSubject called', {
    hasMultipleSubjects: hasMultipleSubjects.value,
    currentIndex: props.currentSubjectIndex,
    totalSubjects: props.subjects.length,
    subjects: props.subjects
  })
  
  if (hasMultipleSubjects.value) {
    let newIndex
    if (props.currentSubjectIndex > 0) {
      newIndex = props.currentSubjectIndex - 1
    } else {
      // Wrap to last subject
      newIndex = props.subjects.length - 1
    }
    const newSubject = props.subjects[newIndex]
    console.log('🔥 [SUBJECT NAV DEBUG] Emitting subjectChanged', { newSubject, newIndex })
    emit('subjectChanged', { subject: newSubject, index: newIndex })
  } else {
    console.log('🔥 [SUBJECT NAV DEBUG] Cannot navigate - no multiple subjects')
  }
}

const goToNextSubject = () => {
  console.log('🔥 [SUBJECT NAV DEBUG] goToNextSubject called', {
    hasMultipleSubjects: hasMultipleSubjects.value,
    currentIndex: props.currentSubjectIndex,
    totalSubjects: props.subjects.length,
    subjects: props.subjects
  })
  
  if (hasMultipleSubjects.value) {
    let newIndex
    if (props.currentSubjectIndex < props.subjects.length - 1) {
      newIndex = props.currentSubjectIndex + 1
    } else {
      // Wrap to first subject
      newIndex = 0
    }
    const newSubject = props.subjects[newIndex]
    console.log('🔥 [SUBJECT NAV DEBUG] Emitting subjectChanged', { newSubject, newIndex })
    emit('subjectChanged', { subject: newSubject, index: newIndex })
  } else {
    console.log('🔥 [SUBJECT NAV DEBUG] Cannot navigate - no multiple subjects')
  }
}

// Watch for modal opening/closing
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    console.log('🔥 [MODAL DEBUG] Modal opened with props:', {
      subject: props.subject,
      subjects: props.subjects,
      currentSubjectIndex: props.currentSubjectIndex,
      hasMultipleSubjects: hasMultipleSubjects.value,
      currentSubjectInfo: currentSubjectInfo.value
    })
    loadSubjectData()
    resetZoom()
  } else {
    resetForm()
    resetZoom()
  }
})

// Watch for subject prop changes to reload data when navigating between subjects
watch(() => props.subject, (newSubject, oldSubject) => {
  if (newSubject && oldSubject && newSubject.id !== oldSubject.id) {
    console.log('🔥 [SUBJECT CHANGE DEBUG] Subject prop changed, reloading data', {
      oldSubject: oldSubject?.name,
      newSubject: newSubject?.name
    })
    loadSubjectData()
    resetZoom()
  }
}, { deep: true })

// Watch for currentImageIndex changes to auto-scroll thumbnail strip
watch(() => currentImageIndex.value, () => {
  scrollToCurrentThumbnail()
})

// Keyboard navigation handler
const handleKeydown = (event) => {
  // Only handle keys when modal is open
  if (!isOpen.value) return

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd + Left Arrow: Previous subject
        if (hasMultipleSubjects.value) {
          goToPreviousSubject()
        }
      } else if (subjectImages.value.length > 0) {
        // Left Arrow: Previous image
        goToPreviousImage()
      }
      break
    case 'ArrowRight':
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd + Right Arrow: Next subject
        if (hasMultipleSubjects.value) {
          goToNextSubject()
        }
      } else if (subjectImages.value.length > 0) {
        // Right Arrow: Next image
        goToNextImage()
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

// Initialize settings on mount
onMounted(async () => {
  await settingsStore.initializeSettings()
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
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