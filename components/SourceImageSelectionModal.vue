<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'max-w-4xl' }">
    <template #content>
      <UCard>
        <!-- Close button in top right -->
        <div class="absolute top-4 right-4 z-10">
          <UButton
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="closeModal"
          />
        </div>

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
              <img
                :src="currentImage.thumbnail || `/api/media/${currentImage.uuid}/image?size=md`"
                :alt="currentImage.filename"
                class="max-w-full max-h-96 rounded-lg shadow-lg"
              />
              
              <!-- Left Arrow Overlay -->
              <div
                v-if="currentImageIndex > 0"
                class="absolute left-0 top-0 w-1/2 h-full flex items-center justify-start pl-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                @click="previousImage"
              >
                <UIcon name="i-heroicons-chevron-left" class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
              </div>
              
              <!-- Right Arrow Overlay -->
              <div
                v-if="currentImageIndex < availableImages.length - 1"
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
          <div v-if="availableImages.length > 1" class="flex gap-2 overflow-x-auto py-2">
            <div
              v-for="(image, index) in availableImages"
              :key="image.uuid"
              class="shrink-0 w-16 h-16 rounded cursor-pointer border-2 transition-colors"
              :class="index === currentImageIndex ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
              @click="currentImageIndex = index"
            >
              <img
                :src="image.thumbnail || `/api/media/${image.uuid}/image?size=thumb`"
                :alt="image.filename"
                class="w-full h-full object-cover rounded"
              />
            </div>
          </div>
        </div>

      <template #footer>
        <div class="flex justify-between">
          <UButton
            variant="outline"
            @click="closeModal"
            :disabled="isSubmittingSource"
          >
            Cancel
          </UButton>
          <UButton
            v-if="currentImage"
            color="primary"
            :loading="isSubmittingSource"
            @click="selectCurrentImage"
          >
            Select This Image
          </UButton>
        </div>
      </template>
      </UCard>
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
const emit = defineEmits(['update:modelValue', 'imageSelected'])

// Reactive data
const availableImages = ref([])
const currentImageIndex = ref(0)
const isLoadingImages = ref(false)
const isSubmittingSource = ref(false)
const isDeletingImage = ref(false)

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

// Methods
const loadImagesForJob = async (job) => {
  if (!job || !job.dest_media_uuid) return
  
  isLoadingImages.value = true
  try {
    // Search for output images based on the destination video
    const response = await useApiFetch('media/search', {
      query: {
        media_type: 'image',
        purpose: 'output',
        dest_media_uuid_ref: job.dest_media_uuid,
        job_id: job.id,
        limit: 100,
        include_thumbnails: true
      }
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
  availableImages.value = []
  currentImageIndex.value = 0
}

const previousImage = () => {
  if (currentImageIndex.value > 0) {
    currentImageIndex.value--
  }
}

const nextImage = () => {
  if (currentImageIndex.value < availableImages.value.length - 1) {
    currentImageIndex.value++
  }
}

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

const formatFileSize = (bytes) => {
  if (!bytes) return 'Unknown'
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
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
  }
})
</script>