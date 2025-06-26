<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'max-w-4xl' }">
    <template #content>
      <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            Select Source Image for Job {{ job?.id }}
          </h3>
          <UButton
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="closeModal"
          />
        </div>
      </template>

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
        <!-- Image Navigation -->
        <div class="flex items-center justify-between">
          <div class="text-sm text-gray-600 dark:text-gray-400">
            Image {{ currentImageIndex + 1 }} of {{ availableImages.length }}
          </div>
          <div class="flex gap-2">
            <UButton
              variant="outline"
              size="sm"
              icon="i-heroicons-chevron-left"
              :disabled="currentImageIndex === 0"
              @click="previousImage"
            >
              Previous
            </UButton>
            <UButton
              variant="outline"
              size="sm"
              icon="i-heroicons-chevron-right"
              :disabled="currentImageIndex === availableImages.length - 1"
              @click="nextImage"
            >
              Next
            </UButton>
          </div>
        </div>

        <!-- Current Image Display -->
        <div v-if="currentImage" class="text-center">
          <div class="relative inline-block max-w-full">
            <img
              :src="currentImage.thumbnail || `/api/media/${currentImage.uuid}/image?size=md`"
              :alt="currentImage.filename"
              class="max-w-full max-h-96 rounded-lg shadow-lg"
            />
          </div>
          
          <!-- Image Info -->
          <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span class="font-medium text-gray-700 dark:text-gray-300">Filename:</span>
                <span class="ml-2 text-gray-600 dark:text-gray-400">{{ currentImage.filename }}</span>
              </div>
              <div>
                <span class="font-medium text-gray-700 dark:text-gray-300">UUID:</span>
                <span class="ml-2 font-mono text-xs text-gray-600 dark:text-gray-400">{{ currentImage.uuid }}</span>
              </div>
              <div v-if="currentImage.width && currentImage.height">
                <span class="font-medium text-gray-700 dark:text-gray-300">Dimensions:</span>
                <span class="ml-2 text-gray-600 dark:text-gray-400">{{ currentImage.width }} × {{ currentImage.height }}</span>
              </div>
              <div v-if="currentImage.file_size">
                <span class="font-medium text-gray-700 dark:text-gray-300">Size:</span>
                <span class="ml-2 text-gray-600 dark:text-gray-400">{{ formatFileSize(currentImage.file_size) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Thumbnail Strip -->
        <div v-if="availableImages.length > 1" class="flex gap-2 overflow-x-auto py-2">
          <div
            v-for="(image, index) in availableImages"
            :key="image.uuid"
            class="flex-shrink-0 w-16 h-16 rounded cursor-pointer border-2 transition-colors"
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

// Computed
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const currentImage = computed(() => {
  return availableImages.value[currentImageIndex.value] || null
})

// Methods
const loadImagesForJob = async (jobId) => {
  if (!jobId) return
  
  isLoadingImages.value = true
  try {
    // Search for images that match this job_id
    const response = await useApiFetch('media/search', {
      query: {
        media_type: 'image',
        job_id: jobId,
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
    await useAuthFetch(`jobs/${props.job.id}/add-source`, {
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
    loadImagesForJob(newJob.id)
  }
}, { immediate: true })

// Watch for modal opening to load images
watch(() => props.modelValue, (isOpen) => {
  if (isOpen && props.job) {
    loadImagesForJob(props.job.id)
  }
})
</script>