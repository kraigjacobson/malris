<template>
  <div class="container mx-auto p-6 pb-24">
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

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        <!-- Subject Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Subject
          </label>
          <UInputMenu
            v-model="selectedSubject"
            v-model:search-term="subjectSearchQuery"
            :items="subjectItems"
            placeholder="Search for a subject..."
            class="w-full"
            by="value"
            option-attribute="label"
            searchable
            @update:model-value="handleSubjectSelection"
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

      <!-- Sort Options and Limit -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Sort By
          </label>
          <USelectMenu
            v-model="sortOptions.sort_by"
            :items="sortByOptions"
            placeholder="Sort by..."
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Sort Order
          </label>
          <USelectMenu
            v-model="sortOptions.sort_order"
            :items="sortOrderOptions"
            placeholder="Sort order..."
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Results Per Page
          </label>
          <USelectMenu
            v-model="pagination.limit"
            :items="limitOptions"
            placeholder="Results per page..."
            class="w-full"
          />
        </div>
      </div>

      <div class="flex gap-4 mt-4">
        <UButton
          v-if="!isLoading"
          color="primary"
          @click="searchMedia"
        >
          Search
        </UButton>
        <UButton
          v-else
          color="red"
          variant="outline"
          @click="cancelSearch"
        >
          <UIcon name="i-heroicons-x-mark" class="mr-2" />
          Cancel Search
        </UButton>
        <UButton variant="outline" @click="clearFilters">
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
            :variant="viewMode === 'grid' ? 'solid' : 'outline'"
            size="sm"
            @click="viewMode = 'grid'"
          >
            <UIcon name="i-heroicons-squares-2x2" />
          </UButton>
          <UButton
            :variant="viewMode === 'list' ? 'solid' : 'outline'"
            size="sm"
            @click="viewMode = 'list'"
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
          class="bg-neutral-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow group"
        >
          <!-- Image Preview -->
          <div
            v-if="media.type === 'image'"
            class="aspect-square relative cursor-pointer"
            @click="openModal(media)"
          >
            <img
              v-if="settingsStore.displayImages"
              :src="`/api/media/${media.uuid}/image?size=sm`"
              :alt="media.filename"
              class="w-full h-full object-cover"
              loading="lazy"
              @error="handleImageError"
            >
            <ImagePlaceholder v-else />
            <!-- Delete Button - Top Right Corner -->
            <div class="absolute top-2 right-2 z-10">
              <UButton
                icon="i-heroicons-trash"
                color="error"
                variant="solid"
                size="lg"
                class="opacity-0 group-hover:opacity-25 transition-opacity duration-200 shadow-lg"
                :loading="deletingIds.includes(media.uuid)"
                @click.stop="confirmDelete(media)"
              />
            </div>
          </div>
          
          <!-- Video Preview -->
          <div
            v-else-if="media.type === 'video'"
            class="aspect-square relative cursor-pointer"
            :data-video-uuid="media.uuid"
            @click="openModal(media)"
            @mouseenter="handleVideoHover(media.uuid, true)"
            @mouseleave="handleVideoHover(media.uuid, false)"
          >
            <!-- Video element -->
            <video
              :ref="`video-${media.uuid}`"
              :poster="media.thumbnail"
              class="w-full h-full object-cover"
              muted
              loop
              preload="none"
              playsinline
              webkit-playsinline
            >
              Your browser does not support the video tag.
            </video>
            
            <!-- Delete Button - Top Right Corner -->
            <div class="absolute top-2 right-2 z-10">
              <UButton
                icon="i-heroicons-trash"
                color="error"
                variant="solid"
                size="lg"
                class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg"
                :loading="deletingIds.includes(media.uuid)"
                @click.stop="confirmDelete(media)"
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
                class="px-2 py-1 text-xs rounded"
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
          class="bg-neutral-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow group"
        >
          <div class="flex items-center gap-4">
            <!-- Thumbnail -->
            <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded flex-shrink-0 cursor-pointer" @click="openModal(media)">
              <img
                v-if="media.type === 'image' && settingsStore.displayImages"
                :src="`/api/media/${media.uuid}/image?size=sm`"
                :alt="media.filename"
                class="w-full h-full object-cover rounded"
                loading="lazy"
                @error="handleImageError"
              >
              <ImagePlaceholder v-else-if="media.type === 'image'" />
              <div
                v-else-if="media.type === 'video'"
                class="w-full h-full relative"
                :data-video-uuid="media.uuid"
                @mouseenter="handleVideoHover(media.uuid, true)"
                @mouseleave="handleVideoHover(media.uuid, false)"
              >
                <!-- Video element -->
                <video
                  :ref="`video-list-${media.uuid}`"
                  :poster="media.thumbnail"
                  class="w-full h-full object-cover rounded"
                  muted
                  loop
                  preload="none"
                  playsinline
                  webkit-playsinline
                >
                  Your browser does not support the video tag.
                </video>
              </div>
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-document" class="text-2xl text-gray-400" />
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
                color="error"
                variant="solid"
                size="lg"
                :loading="deletingIds.includes(media.uuid)"
                @click.stop="confirmDelete(media)"
              />
              <UIcon name="i-heroicons-chevron-right" class="text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="pagination.total > (typeof pagination.limit === 'object' ? pagination.limit.value : pagination.limit)" class="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-gray-200 dark:border-gray-700 p-4 z-50">
        <div class="flex justify-center">
          <UPagination
            v-model:page="currentPage"
            :items-per-page="typeof pagination.limit === 'object' ? pagination.limit.value : pagination.limit"
            :total="pagination.total"
            show-last
            show-first
          />
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
              <span class="text-sm text-gray-500">{{ currentMediaIndex + 1 }} / {{ allMediaResults.length }}</span>
              <UButton
                variant="solid"
                icon="i-heroicons-trash"
                color="error"
                size="lg"
                :loading="deletingIds.includes(selectedMedia.uuid)"
                @click="confirmDelete(selectedMedia)"
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
                v-if="currentMediaIndex > 0"
                variant="solid"
                color="white"
                icon="i-heroicons-chevron-left"
                class="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg"
                @click="navigateMedia(-1)"
              />
              
              <img
                v-if="settingsStore.displayImages"
                :src="`/api/media/${selectedMedia.uuid}/image?size=lg`"
                :alt="selectedMedia.filename"
                class="w-full h-auto max-h-[80vh] object-contain rounded"
                @error="handleImageError"
              >
              <div v-else class="w-full h-64 flex items-center justify-center">
                <ImagePlaceholder />
              </div>
              
              <!-- Next Button -->
              <UButton
                v-if="currentMediaIndex < allMediaResults.length - 1"
                variant="solid"
                color="white"
                icon="i-heroicons-chevron-right"
                class="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg"
                @click="navigateMedia(1)"
              />
            </div>

            <!-- Video Display -->
            <div v-else-if="selectedMedia.type === 'video'" class="max-w-full">
              <video
                ref="modalVideo"
                :src="`/api/stream/${selectedMedia.uuid}`"
                :poster="selectedMedia.thumbnail"
                controls
                autoplay
                muted
                loop
                class="w-full h-auto max-h-[80vh] rounded"
                preload="metadata"
              >
                Your browser does not support the video tag.
              </video>
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
import { useSettingsStore } from '~/stores/settings'
import { nextTick } from 'vue'

// Page metadata
definePageMeta({
  title: 'Media Gallery'
})

// Initialize settings store
const settingsStore = useSettingsStore()

// Reactive data
const filters = ref({
  media_type: { label: 'Videos', value: 'video' }, // Default to videos in dropdown format
  purpose: '',
  subject_uuid: '',
  tags: ''
})

// Subject search using composable
const {
  selectedSubject,
  searchQuery: subjectSearchQuery,
  subjectItems: baseSubjectItems,
  loadSubjects: loadBaseSubjects,
  handleSubjectSelection: handleComposableSubjectSelection
} = useSubjects()

// Add "All Subjects" option to the composable items
const subjectItems = computed(() => [
  { value: '', label: 'All Subjects' },
  ...baseSubjectItems.value
])

const loadSubjects = async () => {
  await loadBaseSubjects()
}

// Load subjects on mount and when search changes
onMounted(() => loadSubjects())
watch(subjectSearchQuery, () => loadSubjects())

const sortOptions = ref({
  sort_by: 'created_at',
  sort_order: 'desc'
})

const mediaResults = ref([])
const isLoading = ref(false)
const hasSearched = ref(false)
const viewMode = ref('grid')
const selectedMedia = ref(null)
const deletingIds = ref([])
const isModalOpen = ref(false)
const currentPage = ref(1)
const pagination = ref({
  total: 0,
  limit: 16,
  offset: 0,
  has_more: false
})

// Video hover state
const hoveredVideoId = ref(null)

// Computed properties for navigation
const imageResults = computed(() => {
  return mediaResults.value.filter(media => media.type === 'image')
})

const allMediaResults = computed(() => {
  return mediaResults.value
})

const currentImageIndex = computed(() => {
  if (!selectedMedia.value) return -1
  return imageResults.value.findIndex(media => media.uuid === selectedMedia.value.uuid)
})

const currentMediaIndex = computed(() => {
  if (!selectedMedia.value) return -1
  return allMediaResults.value.findIndex(media => media.uuid === selectedMedia.value.uuid)
})

// Filter options
const mediaTypeOptions = [
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' }
]

const purposeOptions = [
  { label: 'All Purposes', value: '' },
  { label: 'Source', value: 'source' },
  { label: 'Destination', value: 'dest' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Backup', value: 'backup' },
  { label: 'Output', value: 'output' },
  { label: 'Thumbnail', value: 'thumbnail' }
]

const sortByOptions = [
  { label: 'Created Date', value: 'created_at' },
  { label: 'Updated Date', value: 'updated_at' },
  { label: 'Filename', value: 'filename' },
  { label: 'File Size', value: 'file_size' },
  { label: 'Type', value: 'type' },
  { label: 'Purpose', value: 'purpose' },
  { label: 'Status', value: 'status' },
  { label: 'Width', value: 'width' },
  { label: 'Height', value: 'height' },
  { label: 'Duration', value: 'duration' },
  { label: 'Last Accessed', value: 'last_accessed' },
  { label: 'Access Count', value: 'access_count' }
]

const sortOrderOptions = [
  { label: 'Ascending', value: 'asc' },
  { label: 'Descending', value: 'desc' }
]

const limitOptions = [
  { label: '16 per page', value: 16 },
  { label: '32 per page', value: 32 },
  { label: '48 per page', value: 48 }
]


// Search cancellation
const searchController = ref(null)

// Methods
const searchMedia = async () => {
  isLoading.value = true
  hasSearched.value = true

  // Create new AbortController for this search
  searchController.value = new AbortController()

  try {
    const params = new URLSearchParams()
    
    // Extract values from objects if needed
    const mediaType = typeof filters.value.media_type === 'object' ? filters.value.media_type.value : filters.value.media_type
    const purpose = typeof filters.value.purpose === 'object' ? filters.value.purpose.value : filters.value.purpose
    
    if (mediaType) params.append('media_type', mediaType)
    if (purpose) params.append('purpose', purpose)
    if (filters.value.subject_uuid) params.append('subject_uuid', filters.value.subject_uuid)
    if (filters.value.tags) params.append('tags', filters.value.tags)
    
    // Handle limit - extract value if it's an object
    const limit = typeof pagination.value.limit === 'object' ? pagination.value.limit.value : pagination.value.limit
    params.append('limit', limit.toString())
    params.append('page', currentPage.value.toString())
    
    // Add sort parameters
    const sortBy = typeof sortOptions.value.sort_by === 'object' ? sortOptions.value.sort_by.value : sortOptions.value.sort_by
    const sortOrder = typeof sortOptions.value.sort_order === 'object' ? sortOptions.value.sort_order.value : sortOptions.value.sort_order
    
    if (sortBy) params.append('sort_by', sortBy)
    if (sortOrder) params.append('sort_order', sortOrder)

    const response = await useApiFetch(`media/search?${params.toString()}`, {
      signal: searchController.value.signal
    })
    const allResults = response.results || []
    
    console.log('📊 Media Gallery Search Results:')
    console.log('Total results:', allResults.length)
    console.log('First result:', JSON.stringify(allResults[0], null, 2))
    
    // Filter results based on media type selection
    mediaResults.value = allResults.filter(media => {
      // If searching specifically for images, exclude thumbnails to avoid duplicates
      if (mediaType === 'image') {
        return media.type === 'image' && media.purpose !== 'thumbnail'
      }
      // If searching specifically for videos, only include videos
      if (mediaType === 'video') {
        return media.type === 'video'
      }
      // For general searches, exclude thumbnails to avoid duplicates
      return media.purpose !== 'thumbnail'
    })
    
    console.log('📹 Video filtering debug:')
    console.log('Media type filter:', mediaType)
    console.log('All results count:', allResults.length)
    console.log('Filtered results count:', mediaResults.value.length)
    console.log('Video results:', mediaResults.value.filter(m => m.type === 'video').length)
    
    // Log any videos without thumbnails but don't filter them out
    mediaResults.value.forEach(media => {
      if (media.type === 'video' && !media.thumbnail) {
        console.warn(`Video ${media.uuid} (${media.filename}) has no thumbnail data`)
      }
    })
    
    // Update pagination info if available
    if (response.pagination) {
      pagination.value = {
        total: response.pagination.total || response.count || 0,
        limit: typeof pagination.value.limit === 'object' ? pagination.value.limit.value : pagination.value.limit,
        offset: response.pagination.offset || 0,
        has_more: response.pagination.has_more || false
      }
    } else {
      // Fallback for current API structure
      pagination.value.total = response.count || mediaResults.value.length
    }
    
    
  } catch (err) {
    // Don't show error if search was cancelled
    if (err.name === 'AbortError') {
      console.log('Search was cancelled')
      return
    }
    
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
    searchController.value = null
  }
}


const cancelSearch = () => {
  if (searchController.value) {
    searchController.value.abort()
    isLoading.value = false
    searchController.value = null
    
    const toast = useToast()
    toast.add({
      title: 'Search Cancelled',
      description: 'Media search has been cancelled.',
      color: 'yellow',
      timeout: 3000
    })
  }
}

const clearFilters = () => {
  // Preserve the current media type selection
  const currentMediaType = filters.value.media_type
  
  filters.value = {
    media_type: currentMediaType, // Keep the currently selected media type
    purpose: '',
    subject_uuid: '',
    tags: ''
  }
  handleComposableSubjectSelection(null)
  sortOptions.value = {
    sort_by: { label: 'Created Date', value: 'created_at' },
    sort_order: { label: 'Descending', value: 'desc' }
  }
  pagination.value.limit = 16
  currentPage.value = 1
  mediaResults.value = []
  hasSearched.value = false
}

// Subject selection handler
const handleSubjectSelection = (selected) => {
  // Update the composable state
  handleComposableSubjectSelection(selected)
  
  // Update filters
  if (selected && selected.value) {
    filters.value.subject_uuid = selected.value // Use the UUID
  } else {
    filters.value.subject_uuid = ''
  }
}

const handleImageError = (event) => {
  console.error('❌ Image failed to load:', {
    src: event.target.src,
    displayImages: settingsStore.displayImages,
    error: event
  })
  
  // Hide the broken image and show placeholder instead
  event.target.style.display = 'none'
  
  // Find the parent container and add a placeholder
  const container = event.target.parentElement
  if (container && !container.querySelector('.image-error-placeholder')) {
    const placeholder = document.createElement('div')
    placeholder.className = 'image-error-placeholder w-full h-full bg-muted flex items-center justify-center'
    placeholder.innerHTML = '<div class="text-center"><svg class="w-8 h-8 text-muted-foreground mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>'
    container.appendChild(placeholder)
  }
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

const confirmDelete = async (media) => {
  const { confirm } = useConfirmDialog()
  
  const result = await confirm({
    title: 'Delete Media',
    message: `Are you sure you want to delete "${media.filename}"? This action cannot be undone.`,
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    variant: 'error'
  })
  
  if (result) {
    deleteMedia(media.uuid)
  }
}

const deleteMedia = async (uuid) => {
  const toast = useToast()
  
  try {
    // Add to deleting list
    deletingIds.value.push(uuid)
    
    // Call delete API
    await useApiFetch(`media/${uuid}/delete`, {
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

const openModal = async (media) => {
  selectedMedia.value = media
  isModalOpen.value = true
  
  // If it's a video, ensure it loads and plays
  if (media.type === 'video') {
    await nextTick()
    // Wait a bit for the modal to fully render
    setTimeout(() => {
      const modalVideo = $refs.modalVideo || document.querySelector('video[controls]')
      
      if (modalVideo) {
        // The src is already set in the template, just load and play
        modalVideo.load()
        modalVideo.play().catch(error => {
          console.error('Modal video autoplay failed:', error)
        })
      }
    }, 200)
  }
}

const navigateMedia = (direction) => {
  const newIndex = currentMediaIndex.value + direction
  if (newIndex >= 0 && newIndex < allMediaResults.value.length) {
    selectedMedia.value = allMediaResults.value[newIndex]
  }
}

const handleVideoHover = async (videoId, isHovering) => {
  if (isHovering) {
    hoveredVideoId.value = videoId
    await nextTick()
    
    // Find the video container using the data attribute
    const videoContainer = document.querySelector(`[data-video-uuid="${videoId}"]`)
    
    if (videoContainer) {
      // Find the video element within this container
      const targetVideo = videoContainer.querySelector('video')
      
      if (targetVideo) {
        try {
          // Clear any existing play promise to avoid conflicts
          if (targetVideo._playPromise) {
            await targetVideo._playPromise.catch(() => {})
          }
          
          // Set the video source dynamically using Nuxt streaming endpoint
          const videoSrc = `/api/stream/${videoId}`

          // Ensure video is properly configured for autoplay
          targetVideo.muted = true
          targetVideo.playsInline = true
          targetVideo.autoplay = true
          
          // Set the source
          targetVideo.src = videoSrc
          
          // Load the video first
          targetVideo.load()
          
          // Wait for the video to be ready and then play
          const playVideo = async () => {
            try {
              // Check again if we're still hovering
              if (hoveredVideoId.value !== videoId) return
              
              targetVideo._playPromise = targetVideo.play()
              await targetVideo._playPromise
            } catch (error) {
              console.error('Video autoplay failed:', error)
            }
          }
          
          // Try to play when video can start playing
          targetVideo.addEventListener('canplay', playVideo, { once: true })
          
          // Also try to play immediately in case video loads quickly
          if (targetVideo.readyState >= 3) { // HAVE_FUTURE_DATA
            playVideo()
          }
          
        } catch (error) {
          console.error('Video setup failed:', error)
        }
      }
    }
  } else {
    // Only clear hoveredVideoId if this video was the one being hovered
    if (hoveredVideoId.value === videoId) {
      hoveredVideoId.value = null
    }
    
    // Find and pause the specific video immediately
    const videoContainer = document.querySelector(`[data-video-uuid="${videoId}"]`)
    if (videoContainer) {
      const targetVideo = videoContainer.querySelector('video')
      if (targetVideo && targetVideo.src) {
        // Wait for any pending play promise before pausing
        if (targetVideo._playPromise) {
          targetVideo._playPromise.then(() => {
            targetVideo.pause()
            targetVideo.currentTime = 0
          }).catch(() => {
            // Play was rejected, safe to pause
            targetVideo.pause()
            targetVideo.currentTime = 0
          })
        } else {
          targetVideo.pause()
          targetVideo.currentTime = 0
        }
        
        // Remove the src to stop downloading
        targetVideo.removeAttribute('src')
        targetVideo.load()
        targetVideo._playPromise = null
      }
    }
  }
}

// Keyboard shortcuts
defineShortcuts({
  arrowleft: () => {
    if (isModalOpen.value) navigateMedia(-1)
  },
  arrowright: () => {
    if (isModalOpen.value) navigateMedia(1)
  },
  escape: () => {
    if (isModalOpen.value) isModalOpen.value = false
  }
})

// Watch for page changes
watch(currentPage, (newPage, oldPage) => {
  if (newPage !== oldPage && hasSearched.value) {
    searchMedia()
  }
})

// Watch for modal close to clean up video sources
watch(isModalOpen, (isOpen) => {
  if (!isOpen) {
    // Clean up modal video when modal closes
    const modalVideo = document.querySelector('.max-w-full video[controls]')
    if (modalVideo) {
      modalVideo.pause()
      modalVideo.currentTime = 0
      // Don't remove src since it's bound to the template, just pause
    }
  }
})

// Initialize settings on mount (but don't auto-search)
onMounted(async () => {
  await settingsStore.initializeSettings()
})


// Page head
useHead({
  title: 'Media Gallery - AI Job Tracking System',
  meta: [
    { name: 'description', content: 'Browse encrypted media storage' }
  ]
})
</script>