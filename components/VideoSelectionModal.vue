<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-4xl max-h-[90vh] overflow-y-auto' }">
    <template #content>
      <UCard class="w-full mx-auto" :ui="{ ring: '', divide: 'divide-y divide-gray-200 dark:divide-gray-700', body: { padding: '' } }">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
              Select Video
            </h3>
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark-20-solid"
              class="-my-1"
              @click="isOpen = false"
            />
          </div>
        </template>

        <!-- Search Bar -->
        <div class="p-2 border-b border-gray-200 dark:border-gray-700">
          <UInput
            v-model="searchQuery"
            placeholder="Search videos by tags..."
            icon="i-heroicons-tag-20-solid"
            class="w-full"
            @input="debouncedSearch"
          />
        </div>

        <!-- Video Grid -->
        <div class="p-2">
          <div v-if="error" class="text-center py-12">
            <UAlert
              color="red"
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
      </UCard>
    </template>
  </UModal>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'select'])

// Modal state
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Search and pagination state
const searchQuery = ref('')
const videos = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref(null)
const hasMore = ref(true)
const currentPage = ref(1)
const hasSearched = ref(false)
const limit = 24

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
    const params = {
      media_type: 'video',
      limit: limit,
      page: currentPage.value,
      sort_by: 'created_at',
      sort_order: 'desc'
    }

    if (searchQuery.value.trim()) {
      params.tags = searchQuery.value.trim()
    }

    const response = await useApiFetch('media/search', {
      query: params
    })

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
  if (newValue && videos.value.length === 0) {
    loadVideos(true)
  } else if (!newValue && mediaGrid.value) {
    // Clean up videos when modal closes
    mediaGrid.value.cleanupVideos()
  }
})

// Watch search query changes
watch(searchQuery, () => {
  if (isOpen.value) {
    debouncedSearch()
  }
})
</script>