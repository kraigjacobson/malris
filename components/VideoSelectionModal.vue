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
            v-model="selectedTags"
            placeholder="Add tags (e.g., 1girl, long_hair, anime)"
            class="w-full"
            enterkeyhint="enter"
            @update:model-value="debouncedSearch"
          />
        </div>
        
        <!-- Tag Search Options -->
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Search Mode
          </label>
          <USelectMenu
            v-model="tagSearchMode"
            :items="tagSearchModeOptions"
            class="w-full"
            size="sm"
            @update:model-value="debouncedSearch"
          />
        </div>
        
        <!-- Completion Filters -->
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Min Completions
            </label>
            <UInput
              v-model.number="completionFilters.min_completions"
              type="number"
              placeholder="0"
              min="0"
              class="w-full"
              size="sm"
              @update:model-value="debouncedSearch"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Max Completions
            </label>
            <UInput
              v-model.number="completionFilters.max_completions"
              type="number"
              placeholder="No limit"
              min="0"
              class="w-full"
              size="sm"
              @update:model-value="debouncedSearch"
            />
          </div>
        </div>
        
        <!-- Duration Filters -->
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Min Duration (seconds)
            </label>
            <UInput
              v-model.number="durationFilters.min_duration"
              type="number"
              placeholder="0"
              min="0"
              class="w-full"
              size="sm"
              @update:model-value="debouncedSearch"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Max Duration (seconds)
            </label>
            <UInput
              v-model.number="durationFilters.max_duration"
              type="number"
              placeholder="No limit"
              min="0"
              class="w-full"
              size="sm"
              @update:model-value="debouncedSearch"
            />
          </div>
        </div>
        
        <!-- Sort Options -->
        <div>
          <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Sort By
          </label>
          <USelectMenu
            v-model="sortOptions"
            :items="sortOptionsItems"
            class="w-full"
            size="sm"
            @update:model-value="debouncedSearch"
          />
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
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  initialTags: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'select'])

// Modal state
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Search and pagination state
const selectedTags = ref([])
const tagSearchMode = ref({ label: 'Partial Match', value: 'partial' })
const completionFilters = ref({
  min_completions: 0,
  max_completions: null
})
const durationFilters = ref({
  min_duration: 0,
  max_duration: null
})
const sortOptions = ref({ label: 'Created Date (Newest)', value: 'created_at_desc' })
const videos = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref(null)
const hasMore = ref(true)
const currentPage = ref(1)
const hasSearched = ref(false)
const limit = 24

// Tag search mode options
const tagSearchModeOptions = [
  { label: 'Partial Match', value: 'partial' },
  { label: 'Exact Match', value: 'exact' }
]

// Sort options
const sortOptionsItems = [
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

// Debounced search
let searchTimeout = null
const debouncedSearch = () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    hasMore.value = true
    loadVideos(true)
  }, 300)
}

// Load videos function
const loadVideos = async (reset = false) => {
  if (reset) {
    loading.value = true
    videos.value = []
    currentPage.value = 1
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
    const sortValue = typeof sortOptions.value === 'object' ? sortOptions.value.value : sortOptions.value
    
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
    

    // Add selected tags from UInputTags component
    if (selectedTags.value.length > 0) {
      params.append('tags', selectedTags.value.join(','))
      
      // Use the selected tag match mode
      const searchMode = typeof tagSearchMode.value === 'object' ? tagSearchMode.value.value : tagSearchMode.value
      params.append('tag_match_mode', searchMode)
    }

    // Add completion filters only if they have meaningful values
    if (completionFilters.value.min_completions != null && completionFilters.value.min_completions > 0) {
      params.append('min_completions', completionFilters.value.min_completions.toString())
    }
    if (completionFilters.value.max_completions != null && completionFilters.value.max_completions > 0) {
      params.append('max_completions', completionFilters.value.max_completions.toString())
    }

    // Add duration filters only if they have meaningful values
    if (durationFilters.value.min_duration != null && durationFilters.value.min_duration > 0) {
      params.append('min_duration', durationFilters.value.min_duration.toString())
    }
    if (durationFilters.value.max_duration != null && durationFilters.value.max_duration > 0) {
      params.append('max_duration', durationFilters.value.max_duration.toString())
    }

    params.append('include_thumbnails', 'true')

    const response = await useApiFetch(`media/search?${params.toString()}`)

    if (reset) {
      videos.value = response.results || []
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

// Load more videos
const loadMore = () => {
  if (hasMore.value && !loadingMore.value) {
    currentPage.value++
    loadVideos(false)
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
    // Set initial tags when modal opens
    selectedTags.value = [...(props.initialTags || [])]
    
    if (videos.value.length === 0) {
      loadVideos(true)
    }
  } else if (!newValue && mediaGrid.value) {
    // Clean up videos when modal closes
    mediaGrid.value.cleanupVideos()
    // Reset tags when modal closes
    selectedTags.value = []
  }
})

// Watch for tag changes
watch(selectedTags, () => {
  if (isOpen.value) {
    debouncedSearch()
  }
}, { deep: true })

// Watch for tag search mode changes
watch(tagSearchMode, () => {
  if (isOpen.value && selectedTags.value.length > 0) {
    debouncedSearch()
  }
})

// Watch for completion filter changes
watch(completionFilters, () => {
  if (isOpen.value) {
    debouncedSearch()
  }
}, { deep: true })

// Watch for duration filter changes
watch(durationFilters, () => {
  if (isOpen.value) {
    debouncedSearch()
  }
}, { deep: true })

// Watch for sort option changes
watch(sortOptions, () => {
  if (isOpen.value) {
    debouncedSearch()
  }
})
</script>