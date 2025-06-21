<template>
  <div class="container mx-auto p-6">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Media Gallery
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        Browse encrypted media storage
      </p>
    </div>

    <!-- Search Filters -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
          Search Filters
        </h2>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Media Type Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Media Type
          </label>
          <USelectMenu
            v-model="filters.media_type"
            :items="mediaTypeOptions"
            placeholder="All types"
            class="w-full"
          />
        </div>

        <!-- Purpose Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Purpose
          </label>
          <USelectMenu
            v-model="filters.purpose"
            :items="purposeOptions"
            placeholder="All purposes"
            class="w-full"
          />
        </div>

        <!-- Tags Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tags
          </label>
          <UInput
            v-model="filters.tags"
            placeholder="e.g., portrait, landscape"
            class="w-full"
          />
        </div>
      </div>

      <div class="flex gap-4 mt-4">
        <UButton @click="searchMedia" :loading="isLoading" color="primary">
          Search
        </UButton>
        <UButton @click="clearFilters" variant="outline">
          Clear
        </UButton>
      </div>
    </UCard>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
    </div>


    <!-- Results -->
    <div v-else-if="mediaResults.length > 0">
      <!-- Results Header -->
      <div class="flex justify-between items-center mb-4">
        <p class="text-gray-600 dark:text-gray-400">
          Found {{ mediaResults.length }} media files
        </p>
        <div class="flex gap-2">
          <UButton
            @click="viewMode = 'grid'"
            :variant="viewMode === 'grid' ? 'solid' : 'outline'"
            size="sm"
          >
            <UIcon name="i-heroicons-squares-2x2" />
          </UButton>
          <UButton
            @click="viewMode = 'list'"
            :variant="viewMode === 'list' ? 'solid' : 'outline'"
            size="sm"
          >
            <UIcon name="i-heroicons-list-bullet" />
          </UButton>
        </div>
      </div>

      <!-- Grid View -->
      <div v-if="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div
          v-for="media in mediaResults"
          :key="media.uuid"
          class="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow group"
        >
          <!-- Image Preview -->
          <div
            v-if="media.type === 'image'"
            class="aspect-square bg-gray-100 dark:bg-gray-700 relative cursor-pointer"
            @click="openModal(media)"
          >
            <NuxtImg
              :src="`http://localhost:8000/media/${media.uuid}/download?size=sm`"
              :alt="media.filename"
              class="w-full h-full object-cover"
              loading="lazy"
              @error="handleImageError"
            />
            <!-- Delete Button - Top Right Corner -->
            <div class="absolute top-2 right-2 z-10">
              <UButton
                icon="i-heroicons-trash"
                color="red"
                variant="solid"
                size="sm"
                class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg"
                @click.stop="confirmDelete(media)"
                :loading="deletingIds.includes(media.uuid)"
              />
            </div>
          </div>
          
          <!-- Video Preview -->
          <div
            v-else-if="media.type === 'video'"
            class="aspect-square bg-gray-100 dark:bg-gray-700 flex items-center justify-center relative cursor-pointer"
            @click="openModal(media)"
          >
            <UIcon name="i-heroicons-play-circle" class="text-4xl text-gray-400" />
            <!-- Delete Button - Top Right Corner -->
            <div class="absolute top-2 right-2 z-10">
              <UButton
                icon="i-heroicons-trash"
                color="red"
                variant="solid"
                size="sm"
                class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg"
                @click.stop="confirmDelete(media)"
                :loading="deletingIds.includes(media.uuid)"
              />
            </div>
          </div>

          <!-- Media Info -->
          <div class="p-3 cursor-pointer" @click="openModal(media)">
            <h3 class="font-medium text-sm text-gray-900 dark:text-white truncate">
              {{ media.filename }}
            </h3>
            <p class="text-xs text-gray-500 mt-1">
              {{ media.type }} • {{ media.purpose }}
            </p>
            <div v-if="media.tags && media.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
              <span
                v-for="tag in media.tags.slice(0, 3)"
                :key="tag"
                class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- List View -->
      <div v-else class="space-y-2">
        <div
          v-for="media in mediaResults"
          :key="media.uuid"
          class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow group"
        >
          <div class="flex items-center gap-4">
            <!-- Thumbnail -->
            <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded flex-shrink-0 cursor-pointer" @click="openModal(media)">
              <NuxtImg
                v-if="media.type === 'image'"
                :src="`http://localhost:8000/media/${media.uuid}/download?size=thumb`"
                :alt="media.filename"
                class="w-full h-full object-cover rounded"
                loading="lazy"
                @error="handleImageError"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-play-circle" class="text-2xl text-gray-400" />
              </div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 cursor-pointer" @click="openModal(media)">
              <h3 class="font-medium text-gray-900 dark:text-white truncate">
                {{ media.filename }}
              </h3>
              <p class="text-sm text-gray-500">
                {{ media.type }} • {{ media.purpose }} • {{ formatDate(media.created_at) }}
              </p>
              <div v-if="media.tags && media.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="tag in media.tags"
                  :key="tag"
                  class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex-shrink-0 flex items-center gap-2">
              <UButton
                icon="i-heroicons-trash"
                color="red"
                variant="outline"
                size="sm"
                @click.stop="confirmDelete(media)"
                :loading="deletingIds.includes(media.uuid)"
              />
              <UIcon name="i-heroicons-chevron-right" class="text-gray-400" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- No Results -->
    <div v-else-if="!isLoading && hasSearched" class="text-center py-8">
      <UIcon name="i-heroicons-photo" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">No media found matching your criteria</p>
    </div>

    <!-- Initial State -->
    <div v-else class="text-center py-8">
      <UIcon name="i-heroicons-magnifying-glass" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">Use the search filters above to find media</p>
    </div>

    <!-- Media Detail Modal -->
    <UModal v-model:open="isModalOpen">
      <template #content>
        <div v-if="selectedMedia" class="p-6">
          <!-- Header -->
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-lg font-semibold">{{ selectedMedia.filename }}</h3>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500">{{ currentImageIndex + 1 }} / {{ imageResults.length }}</span>
              <UButton
                variant="ghost"
                icon="i-heroicons-trash"
                color="red"
                @click="confirmDelete(selectedMedia)"
                :loading="deletingIds.includes(selectedMedia.uuid)"
              />
              <UButton
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="isModalOpen = false"
              />
            </div>
          </div>

          <div class="space-y-4">
            <!-- Image Display -->
            <div v-if="selectedMedia.type === 'image'" class="max-w-full relative">
              <!-- Previous Button -->
              <UButton
                v-if="currentImageIndex > 0"
                variant="solid"
                color="white"
                icon="i-heroicons-chevron-left"
                class="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg"
                @click="navigateImage(-1)"
              />
              
              <NuxtImg
                :src="`http://localhost:8000/media/${selectedMedia.uuid}/download?size=lg`"
                :alt="selectedMedia.filename"
                class="w-full h-auto max-h-[80vh] object-contain rounded"
                @error="handleImageError"
              />
              
              <!-- Next Button -->
              <UButton
                v-if="currentImageIndex < imageResults.length - 1"
                variant="solid"
                color="white"
                icon="i-heroicons-chevron-right"
                class="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg"
                @click="navigateImage(1)"
              />
            </div>

            <!-- Media Details -->
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="font-medium">Type:</span>
                <span class="ml-2">{{ selectedMedia.type }}</span>
              </div>
              <div>
                <span class="font-medium">Purpose:</span>
                <span class="ml-2">{{ selectedMedia.purpose }}</span>
              </div>
              <div>
                <span class="font-medium">Status:</span>
                <span class="ml-2">{{ selectedMedia.status }}</span>
              </div>
              <div>
                <span class="font-medium">Created:</span>
                <span class="ml-2">{{ formatDate(selectedMedia.created_at) }}</span>
              </div>
            </div>

            <!-- Tags -->
            <div v-if="selectedMedia.tags && selectedMedia.tags.length > 0">
              <span class="font-medium text-sm">Tags:</span>
              <div class="flex flex-wrap gap-2 mt-2">
                <span
                  v-for="tag in selectedMedia.tags"
                  :key="tag"
                  class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-sm rounded"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- UUID -->
            <div class="text-xs text-gray-500">
              <span class="font-medium">UUID:</span>
              <span class="ml-2 font-mono">{{ selectedMedia.uuid }}</span>
            </div>
          </div>
        </div>
      </template>
    </UModal>

  </div>
</template>

<script setup>
// Page metadata
definePageMeta({
  title: 'Media Gallery'
})

// Reactive data
const filters = ref({
  media_type: '',
  purpose: '',
  tags: ''
})

const mediaResults = ref([])
const isLoading = ref(false)
const hasSearched = ref(false)
const viewMode = ref('grid')
const selectedMedia = ref(null)
const deletingIds = ref([])
const isModalOpen = ref(false)

// Computed properties for navigation
const imageResults = computed(() => {
  return mediaResults.value.filter(media => media.type === 'image')
})

const currentImageIndex = computed(() => {
  if (!selectedMedia.value) return -1
  return imageResults.value.findIndex(media => media.uuid === selectedMedia.value.uuid)
})

// Filter options
const mediaTypeOptions = [
  { label: 'All Types', value: '' },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' }
]

const purposeOptions = [
  { label: 'All Purposes', value: '' },
  { label: 'Source', value: 'source' },
  { label: 'Destination', value: 'dest' }
]


// Methods
const searchMedia = async () => {
  isLoading.value = true
  hasSearched.value = true

  try {
    const params = new URLSearchParams()
    
    // Extract values from objects if needed
    const mediaType = typeof filters.value.media_type === 'object' ? filters.value.media_type.value : filters.value.media_type
    const purpose = typeof filters.value.purpose === 'object' ? filters.value.purpose.value : filters.value.purpose
    
    if (mediaType) params.append('media_type', mediaType)
    if (purpose) params.append('purpose', purpose)
    if (filters.value.tags) params.append('tags', filters.value.tags)
    
    params.append('limit', '50')

    const response = await $fetch(`/api/media/search?${params.toString()}`)
    mediaResults.value = response.results || []
    
  } catch (err) {
    console.error('Search error:', err)
    const toast = useToast()
    
    let errorMessage = 'Failed to search media'
    if (err.statusCode === 503) {
      errorMessage = 'Media API is not available. Please ensure the service is running on localhost:8000'
    } else if (err.data?.message) {
      errorMessage = err.data.message
    }
    
    toast.add({
      title: 'Media Search Error',
      description: errorMessage,
      color: 'red',
      timeout: 5000
    })
    
    mediaResults.value = []
  } finally {
    isLoading.value = false
  }
}

const clearFilters = () => {
  filters.value = {
    media_type: '',
    purpose: '',
    tags: ''
  }
  mediaResults.value = []
  hasSearched.value = false
}

const handleImageError = (event) => {
  event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkVycm9yPC90ZXh0Pjwvc3ZnPg=='
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

const confirmDelete = (media) => {
  console.log('confirmDelete called for:', media.filename)
  const toast = useToast()
  
  // Test if toast appears at all
  toast.add({
    title: 'Delete Media',
    description: `Click to delete "${media.filename}"`,
    color: 'error',
    duration: 5000,
    click: () => {
      console.log('Toast clicked, calling deleteMedia')
      deleteMedia(media.uuid)
    }
  })
}

const deleteMedia = async (uuid) => {
  console.log('deleteMedia called for uuid:', uuid)
  const toast = useToast()
  
  try {
    // Add to deleting list
    deletingIds.value.push(uuid)
    
    // Call delete API
    await $fetch(`/api/media/${uuid}/delete`, {
      method: 'DELETE'
    })
    
    // Handle modal navigation if deleting current image
    if (isModalOpen.value && selectedMedia.value?.uuid === uuid) {
      const currentIndex = currentImageIndex.value
      const images = imageResults.value
      
      if (images.length > 1) {
        // Navigate to next image, or previous if at end
        const nextIndex = currentIndex < images.length - 1 ? currentIndex : currentIndex - 1
        const nextImage = images.filter(img => img.uuid !== uuid)[nextIndex]
        if (nextImage) {
          selectedMedia.value = nextImage
        } else {
          isModalOpen.value = false
        }
      } else {
        // Close modal if no more images
        isModalOpen.value = false
      }
    }
    
    // Remove from results
    mediaResults.value = mediaResults.value.filter(media => media.uuid !== uuid)
    
    // Show success toast
    toast.add({
      title: 'Media Deleted',
      description: 'Media file has been successfully deleted.',
      color: 'green',
      timeout: 3000
    })
    
  } catch (error) {
    console.error('Delete error:', error)
    
    let errorMessage = 'Failed to delete media'
    if (error.statusCode === 503) {
      errorMessage = 'Media API is not available'
    } else if (error.data?.message) {
      errorMessage = error.data.message
    }
    
    toast.add({
      title: 'Delete Failed',
      description: errorMessage,
      color: 'red',
      timeout: 5000
    })
    
  } finally {
    // Remove from deleting list
    deletingIds.value = deletingIds.value.filter(id => id !== uuid)
  }
}

const openModal = (media) => {
  console.log('Opening modal for:', media.filename)
  selectedMedia.value = media
  isModalOpen.value = true
}

const navigateImage = (direction) => {
  const newIndex = currentImageIndex.value + direction
  if (newIndex >= 0 && newIndex < imageResults.value.length) {
    selectedMedia.value = imageResults.value[newIndex]
  }
}

// Keyboard shortcuts
defineShortcuts({
  arrowleft: () => {
    if (isModalOpen.value) navigateImage(-1)
  },
  arrowright: () => {
    if (isModalOpen.value) navigateImage(1)
  },
  escape: () => {
    if (isModalOpen.value) isModalOpen.value = false
  }
})

// Auto-search on mount
onMounted(() => {
  searchMedia()
})

// Page head
useHead({
  title: 'Media Gallery - AI Job Tracking System',
  meta: [
    { name: 'description', content: 'Browse encrypted media storage' }
  ]
})
</script>