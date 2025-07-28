<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'max-w-6xl' }">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
          Select Video
        </h3>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-heroicons-x-mark-20-solid"
          class="-my-1"
          @click="isOpen = false"
        />
      </div>
    </template>

    <template #body>
      <!-- Search Bar -->
      <div class="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search by Tags
          </label>
          <UInputTags
            v-model="searchStore.videoSearch.selectedTags"
            placeholder="Add tags (e.g., 1girl, long_hair, anime)"
            class="w-full"
            enterkeyhint="enter"
            inputmode="text"
          />
        </div>
        
        
        
        <!-- Duration Filters -->
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Min Duration (seconds)
            </label>
            <UInput
              v-model.number="searchStore.videoSearch.durationFilters.min_duration"
              type="number"
              placeholder="0"
              min="0"
              class="w-full"
              size="sm"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Max Duration (seconds)
            </label>
            <UInput
              v-model.number="searchStore.videoSearch.durationFilters.max_duration"
              type="number"
              placeholder="No limit"
              min="0"
              class="w-full"
              size="sm"
            />
          </div>
        </div>
        
        <!-- Sort Options -->
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Sort By
          </label>
          <USelectMenu
            v-model="searchStore.videoSearch.sortOptions"
            :items="sortOptionsItems"
            class="w-full"
            size="sm"
          />
        </div>
        
        <!-- Search and Clear Buttons -->
        <div class="mt-3 flex gap-2">
          <UButton
            color="primary"
            size="sm"
            @click="searchVideos"
            :loading="loading"
          >
            Search Videos
          </UButton>
          <UButton
            variant="outline"
            size="sm"
            @click="clearFilters"
          >
            Clear Filters
          </UButton>
        </div>
      </div>

      <!-- Video Grid -->
      <div class="p-3 sm:p-4 max-h-[60vh] overflow-y-auto">
        <div v-if="error" class="text-center py-12">
          <UAlert
            color="error"
            title="Error"
            :description="error"
            variant="subtle"
          />
        </div>

        <MediaGrid
          v-else
          ref="mediaGrid"
          :media-results="videos"
          :loading="loading"
          :loading-more="loadingMore"
          :has-searched="hasSearched"
          :has-more="hasMore"
          :selection-mode="true"
          @media-click="selectVideo"
          @load-more="loadMore"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSearchStore } from '~/stores/search'
import { useTags } from '~/composables/useTags'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  initialTags: {
    type: Array,
    default: () => []
  },
  excludeSubjectUuid: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'select'])

// Use the search store and tags composable
const searchStore = useSearchStore()
const { filterHairTags } = useTags()

// Initialize search store on mount
onMounted(async () => {
  try {
    if (searchStore.initializeSearch) {
      await searchStore.initializeSearch()
    }
  } catch (error) {
    console.error('Failed to initialize search store on mount:', error)
  }
})


// Modal state
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Search and pagination state
const videos = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref(null)
const hasMore = ref(true)
const currentPage = ref(1)
const hasSearched = ref(false)
const limit = 8


// Sort options
const sortOptionsItems = [
  { label: 'Random', value: 'random' },
  { label: 'Created Date (Newest)', value: 'created_at_desc' },
  { label: 'Created Date (Oldest)', value: 'created_at_asc' },
  { label: 'Updated Date (Newest)', value: 'updated_at_desc' },
  { label: 'Updated Date (Oldest)', value: 'updated_at_asc' },
  { label: 'Duration (Shortest)', value: 'duration_asc' },
  { label: 'Duration (Longest)', value: 'duration_desc' },
  { label: 'File Size (Largest)', value: 'file_size_desc' },
  { label: 'File Size (Smallest)', value: 'file_size_asc' },
  { label: 'Filename (A-Z)', value: 'filename_asc' },
  { label: 'Filename (Z-A)', value: 'filename_desc' }
]

// Reference to MediaGrid component
const mediaGrid = ref(null)

// Search method for the search button
const searchVideos = () => {
  currentPage.value = 1
  hasMore.value = true
  loadVideos(true)
}

// Clear filters method
const clearFilters = () => {
  searchStore.resetVideoFilters()
  // Also clear the current search results
  videos.value = []
  hasSearched.value = false
}

// Background preloading state
const preloadQueue = ref([])
const isPreloading = ref(false)
const preloadedPages = ref(new Set())

// Load videos function
const loadVideos = async (reset = false) => {
  if (reset) {
    loading.value = true
    videos.value = []
    currentPage.value = 1
    preloadQueue.value = []
    preloadedPages.value.clear()
  } else {
    loadingMore.value = true
  }
  
  error.value = null
  hasSearched.value = true

  try {
    const params = new URLSearchParams()
    
    params.append('media_type', 'video')
    params.append('purpose', 'dest')
    params.append('limit', limit.toString())
    params.append('offset', ((currentPage.value - 1) * limit).toString())
    
    // Handle dynamic sorting
    const sortValue = typeof searchStore.videoSearch.sortOptions === 'object' ? searchStore.videoSearch.sortOptions.value : searchStore.videoSearch.sortOptions
    
    // Check if random sorting is selected
    if (sortValue === 'random') {
      params.append('sort_by', 'random')
      params.append('sort_order', 'asc') // Order doesn't matter for random, but API expects it
    } else {
      // Parse sort value properly for API format
      let sortBy, sortOrder
      if (sortValue.endsWith('_desc')) {
        sortBy = sortValue.slice(0, -5) // Remove '_desc'
        sortOrder = 'desc'
      } else if (sortValue.endsWith('_asc')) {
        sortBy = sortValue.slice(0, -4) // Remove '_asc'
        sortOrder = 'asc'
      } else {
        // Fallback - shouldn't happen with current options
        sortBy = 'created_at'
        sortOrder = 'desc'
      }
      
      params.append('sort_by', sortBy)
      params.append('sort_order', sortOrder)
    }
    

    // Add selected tags from UInputTags component
    if (searchStore.videoSearch.selectedTags.length > 0) {
      params.append('tags', searchStore.videoSearch.selectedTags.join(','))
    }


    // Add duration filters only if they have meaningful values
    if (searchStore.videoSearch.durationFilters.min_duration != null && searchStore.videoSearch.durationFilters.min_duration > 0) {
      params.append('min_duration', searchStore.videoSearch.durationFilters.min_duration.toString())
    }
    if (searchStore.videoSearch.durationFilters.max_duration != null && searchStore.videoSearch.durationFilters.max_duration > 0) {
      params.append('max_duration', searchStore.videoSearch.durationFilters.max_duration.toString())
    }


    // Filter out videos already assigned to the specified subject UUID
    if (props.excludeSubjectUuid) {
      params.append('exclude_subject_uuid', props.excludeSubjectUuid)
    }

    params.append('include_thumbnails', 'true')

    const response = await useApiFetch(`media/search?${params.toString()}`)

    if (reset) {
      videos.value = response.results || []
      // Start background preloading after first batch loads
      startBackgroundPreloading()
    } else {
      videos.value.push(...(response.results || []))
    }

    // Check if there are more results
    hasMore.value = (response.results || []).length === limit

  } catch (err) {
    console.error('Error loading videos:', err)
    error.value = err.message || 'Failed to load videos'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

// Background preloading function
const startBackgroundPreloading = async () => {
  if (isPreloading.value) return
  isPreloading.value = true
  
  // Calculate how many pages we need to preload to stay ahead
  const currentDisplayedPages = Math.ceil(videos.value.length / limit)
  const targetPreloadPages = currentDisplayedPages + 20 // Always stay 20 pages (160 videos) ahead
  
  // Preload from current position to target
  for (let i = currentDisplayedPages + 1; i <= targetPreloadPages; i++) {
    if (preloadedPages.value.has(i)) continue
    
    try {
      const params = new URLSearchParams()
      params.append('media_type', 'video')
      params.append('purpose', 'dest')
      params.append('limit', limit.toString())
      params.append('offset', ((i - 1) * limit).toString())
      
      // Add all the same filters as the main search
      const sortValue = typeof searchStore.videoSearch.sortOptions === 'object' ? searchStore.videoSearch.sortOptions.value : searchStore.videoSearch.sortOptions
      
      if (sortValue === 'random') {
        params.append('sort_by', 'random')
        params.append('sort_order', 'asc')
      } else {
        let sortBy, sortOrder
        if (sortValue.endsWith('_desc')) {
          sortBy = sortValue.slice(0, -5)
          sortOrder = 'desc'
        } else if (sortValue.endsWith('_asc')) {
          sortBy = sortValue.slice(0, -4)
          sortOrder = 'asc'
        } else {
          sortBy = 'created_at'
          sortOrder = 'desc'
        }
        params.append('sort_by', sortBy)
        params.append('sort_order', sortOrder)
      }

      if (searchStore.videoSearch.selectedTags.length > 0) {
        params.append('tags', searchStore.videoSearch.selectedTags.join(','))
      }

      if (searchStore.videoSearch.durationFilters.min_duration != null && searchStore.videoSearch.durationFilters.min_duration > 0) {
        params.append('min_duration', searchStore.videoSearch.durationFilters.min_duration.toString())
      }
      if (searchStore.videoSearch.durationFilters.max_duration != null && searchStore.videoSearch.durationFilters.max_duration > 0) {
        params.append('max_duration', searchStore.videoSearch.durationFilters.max_duration.toString())
      }


      // Filter out videos already assigned to the specified subject UUID (for background preloading)
      if (props.excludeSubjectUuid) {
        params.append('exclude_subject_uuid', props.excludeSubjectUuid)
      }

      params.append('include_thumbnails', 'true')

      const response = await useApiFetch(`media/search?${params.toString()}`)
      
      if (response.results && response.results.length > 0) {
        preloadQueue.value.push(...response.results)
        preloadedPages.value.add(i)
      } else {
        break // No more results
      }
      
      // Smaller delay for faster preloading
      await new Promise(resolve => setTimeout(resolve, 50))
      
    } catch (error) {
      console.error('Background preload error:', error)
      break
    }
  }
  
  isPreloading.value = false
}

// Load more videos
const loadMore = () => {
  if (hasMore.value && !loadingMore.value) {
    // Check if we have preloaded content
    if (preloadQueue.value.length >= limit) {
      const nextBatch = preloadQueue.value.splice(0, limit)
      videos.value.push(...nextBatch)
      currentPage.value++
      
      // Always keep preloading to stay well ahead - trigger when we have less than 80 videos queued
      if (preloadQueue.value.length < limit * 10) {
        startBackgroundPreloading()
      }
    } else {
      // Fallback to regular loading
      currentPage.value++
      loadVideos(false)
    }
  }
}

// Select video
const selectVideo = (video) => {
  emit('select', video)
  isOpen.value = false
}

// Watch for modal opening to load initial videos
watch(isOpen, (newValue) => {
  if (newValue) {
    // Only set initial tags if they're provided AND the store is empty
    // Filter to only include hair-related tags
    if (props.initialTags && props.initialTags.length > 0 && searchStore.videoSearch.selectedTags.length === 0) {
      const hairTags = filterHairTags(props.initialTags)
      searchStore.videoSearch.selectedTags = [...hairTags]
    }
    
    // Don't auto-search when modal opens - user needs to manually search
  } else if (!newValue && mediaGrid.value) {
    // Clean up videos when modal closes
    mediaGrid.value.cleanupVideos()
    // Reset videos when modal closes
    videos.value = []
    hasSearched.value = false
  }
})
</script>