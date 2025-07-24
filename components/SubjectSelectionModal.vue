<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'max-w-4xl' }">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
          Select Subject
        </h3>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-heroicons-x-mark-20-solid"
          class="-my-1 ml-auto"
          @click="isOpen = false"
        />
      </div>
    </template>

    <template #body>
      <!-- Search Bar -->
      <div class="p-3 sm:p-4 space-y-3" :class="{ 'border-b border-gray-200 dark:border-gray-700': hasSearched || loading || error }">
        <!-- Tags Search -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search by Tags
          </label>
          <div class="space-y-2">
            <UInputTags
              v-model="searchStore.subjectSearch.selectedTags"
              placeholder="Add tags (e.g., portrait, landscape)"
              class="w-full"
              enterkeyhint="enter"
            />
            
          </div>
        </div>
        
        <!-- Search and Clear Buttons -->
        <div class="flex justify-center gap-3 mt-3">
          <UButton
            color="primary"
            size="sm"
            icon="i-heroicons-magnifying-glass"
            @click="performSearch"
          >
            Search Subjects
          </UButton>
          <UButton
            v-if="hasSearched || searchQuery || searchStore.subjectSearch.selectedTags.length > 0"
            color="gray"
            variant="outline"
            size="sm"
            icon="i-heroicons-x-mark"
            @click="clearAll"
          >
            Clear
          </UButton>
        </div>
      </div>

      <!-- Selected Video Preview (if video is selected and images are enabled) -->
      <div v-if="selectedVideo && displayImages" class="p-6 border-b border-gray-200 dark:border-gray-700">
        <div class="flex justify-center">
          <div
            class="relative w-80 h-60 bg-gray-200 dark:bg-gray-700 overflow-hidden group cursor-pointer"
            :data-video-uuid="selectedVideo.uuid"
            @mouseenter="handleVideoHover(selectedVideo.uuid, true)"
            @mouseleave="handleVideoHover(selectedVideo.uuid, false)"
          >
            <!-- Video element with poster -->
            <video
              ref="videoElement"
              :poster="selectedVideo.thumbnail_uuid ? `/api/media/${selectedVideo.thumbnail_uuid}/image?size=sm` : undefined"
              class="w-full h-full object-cover object-top"
              muted
              loop
              preload="none"
              playsinline
              webkit-playsinline
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </div>

      <!-- Subject Grid -->
      <div class="p-3 sm:p-4 max-h-[60vh] overflow-y-auto">
        <SubjectGrid
          :subjects="subjects"
          :loading="loading"
          :loading-more="loadingMore"
          :has-searched="hasSearched"
          :has-more="hasMore"
          :error="error"
          :selection-mode="true"
          :display-images="displayImages"
          @subject-click="selectSubject"
          @load-more="loadMore"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { nextTick } from 'vue'
import { useSearchStore } from '~/stores/search'
import { useTags } from '~/composables/useTags'
import { useSettings } from '~/composables/useSettings'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  initialTags: {
    type: Array,
    default: () => []
  },
  selectedVideo: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'select'])

// Use the search store, tags composable, and settings
const searchStore = useSearchStore()
const { filterHairTags } = useTags()
const { displayImages } = useSettings()

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

// Search and pagination state for grid
const searchQuery = ref('')
const subjects = ref([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref(null)
const hasMore = ref(true)
const currentPage = ref(1)
const hasSearched = ref(false)
const isClearing = ref(false)
const limit = 24


// Video hover functionality (similar to MediaGrid)
const hoveredVideoId = ref(null)
const videoElement = ref(null)

// Video functionality - autoplay and loop
const startVideoAutoplay = async () => {
  await nextTick()
  if (props.selectedVideo && videoElement.value) {
    try {
      // Clear any existing play promise to avoid conflicts
      if (videoElement.value._playPromise) {
        await videoElement.value._playPromise.catch(() => {})
      }
      
      // Set the video source dynamically using Nuxt streaming endpoint
      const videoSrc = `/api/stream/${props.selectedVideo.uuid}`

      // Ensure video is properly configured for autoplay and loop
      videoElement.value.muted = true
      videoElement.value.playsInline = true
      videoElement.value.autoplay = true
      videoElement.value.loop = true
      
      // Set the source
      videoElement.value.src = videoSrc
      
      // Load the video first
      videoElement.value.load()
      
      // Wait for the video to be ready and then play
      const playVideo = async () => {
        try {
          videoElement.value._playPromise = videoElement.value.play()
          await videoElement.value._playPromise
        } catch (error) {
          console.error('Video autoplay failed:', error)
        }
      }
      
      // Try to play when video can start playing
      videoElement.value.addEventListener('canplay', playVideo, { once: true })
      
      // Also try to play immediately in case video loads quickly
      if (videoElement.value.readyState >= 3) { // HAVE_FUTURE_DATA
        playVideo()
      }
      
    } catch (error) {
      console.error('Video setup failed:', error)
    }
  }
}

// Simplified hover handler (no longer needed but keeping for template compatibility)
const handleVideoHover = () => {
  // Video is always playing now
}




// Load subjects function
const loadSubjects = async (reset = false) => {
  if (reset) {
    loading.value = true
    subjects.value = []
    currentPage.value = 1
  } else {
    loadingMore.value = true
  }
  
  error.value = null
  hasSearched.value = true

  try {
    const params = new URLSearchParams()
    
    params.append('limit', limit.toString())
    params.append('page', currentPage.value.toString())
    params.append('include_images', 'true')
    params.append('image_size', 'thumb')
    params.append('sort_by', 'name')
    params.append('sort_order', 'asc')
    
    // Add search query if provided
    if (searchQuery.value.trim()) {
      params.append('name_pattern', searchQuery.value.trim())
    }
    
    // Add selected tags if provided
    if (searchStore.subjectSearch.selectedTags.length > 0) {
      params.append('tags', searchStore.subjectSearch.selectedTags.join(','))
      // Always use partial match mode
      params.append('tag_match_mode', 'partial')
    }

    const response = await useApiFetch(`subjects/search?${params.toString()}`)

    if (reset) {
      subjects.value = response.subjects || []
    } else {
      subjects.value.push(...(response.subjects || []))
    }

    // Check if there are more results based on pagination
    hasMore.value = response.pagination?.has_more || false

  } catch (err) {
    console.error('Error loading subjects:', err)
    error.value = err.message || 'Failed to load subjects'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

// Load more subjects
const loadMore = () => {
  if (hasMore.value && !loadingMore.value) {
    currentPage.value++
    loadSubjects(false)
  }
}

// Select subject
const selectSubject = (subject) => {
  emit('select', {
    value: subject.id,
    label: subject.name,
    tags: subject.tags // Include the full tags data
  })
  
  // Close mobile keyboard
  nextTick(() => {
    const searchInput = document.querySelector('input[placeholder*="Search for a subject"]')
    if (searchInput) {
      searchInput.blur()
    }
  })
  
  isOpen.value = false
}


// Perform manual search
const performSearch = () => {
  currentPage.value = 1
  hasMore.value = true
  loadSubjects(true)
  
  // Close mobile keyboard
  nextTick(() => {
    const searchInput = document.querySelector('input[placeholder*="Search for a subject"]')
    if (searchInput) {
      searchInput.blur()
    }
  })
}

// Clear all search criteria and results
const clearAll = () => {
  // Set clearing flag to prevent watcher from triggering
  isClearing.value = true
  
  // Clear all fields and reset state
  searchQuery.value = ''
  searchStore.resetSubjectFilters()
  subjects.value = []
  hasSearched.value = false
  currentPage.value = 1
  hasMore.value = true
  error.value = null
  
  
  // Reset clearing flag after a short delay
  nextTick(() => {
    isClearing.value = false
    
    // Close mobile keyboard
    const searchInput = document.querySelector('input[placeholder*="Search for a subject"]')
    if (searchInput) {
      searchInput.blur()
    }
  })
}

// Cleanup function to stop videos
const cleanupVideos = () => {
  hoveredVideoId.value = null
  if (videoElement.value && videoElement.value.src) {
    videoElement.value.pause()
    videoElement.value.currentTime = 0
    videoElement.value.removeAttribute('src')
    videoElement.value.load()
    videoElement.value._playPromise = null
  }
}

// Watch for modal opening to reset state only
watch(isOpen, (newValue) => {
  if (newValue) {
    // Reset state when opening
    searchQuery.value = ''
    
    // Only set initial tags if they're provided AND the store is empty
    // Filter to only include hair-related tags
    if (props.initialTags && props.initialTags.length > 0 && searchStore.subjectSearch.selectedTags.length === 0) {
      const hairTags = filterHairTags(props.initialTags)
      searchStore.subjectSearch.selectedTags = [...hairTags]
    }
    
    subjects.value = []
    hasSearched.value = false
    currentPage.value = 1
    hasMore.value = true
    error.value = null
    
    
    // Start video autoplay if video is selected
    if (props.selectedVideo) {
      startVideoAutoplay()
    }
  } else {
    cleanupVideos()
  }
})

// Watch for selectedVideo changes to start autoplay
watch(() => props.selectedVideo, (newVideo) => {
  if (newVideo && isOpen.value) {
    startVideoAutoplay()
  }
}, { immediate: true })

// Watch for search query changes - only reload all subjects when cleared (but not during manual clear)
watch(searchQuery, (newValue) => {
  if (isOpen.value && !newValue.trim() && !isClearing.value) {
    // If search is cleared naturally (not via clear button), load all subjects
    currentPage.value = 1
    hasMore.value = true
    loadSubjects(true)
  }
})
</script>