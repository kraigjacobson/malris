<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile" :ui="{ content: 'fixed bg-default divide-y divide-default flex flex-col focus:outline-none w-full h-full sm:w-[95vw] sm:h-auto sm:max-w-7xl lg:w-[90vw]' }">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-semibold">Submit Job</h3>
        <UButton
          variant="ghost"
          size="lg"
          icon="i-heroicons-x-mark"
          @click="closeModal"
          :disabled="isSubmitting"
          class="ml-4"
        />
      </div>
    </template>

    <template #body>
      <div class="flex flex-col h-[75vh] min-h-[600px]">
        <!-- Initial Selection Mode (when no workflow is active) -->
        <div v-if="!workflowMode" class="flex-shrink-0">
          <div class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Choose your workflow to create batch Face Swap jobs:
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <!-- Subject First Workflow -->
              <UButton
                variant="outline"
                size="sm"
                class="h-12 flex flex-col items-center justify-center space-y-1"
                @click="startSubjectFirstWorkflow"
              >
                <UIcon name="i-heroicons-user-20-solid" class="w-4 h-4" />
                <span class="text-xs font-medium">Select Subject First</span>
              </UButton>
              
              <!-- Video First Workflow -->
              <UButton
                variant="outline"
                size="sm"
                class="h-12 flex flex-col items-center justify-center space-y-1"
                @click="startVideoFirstWorkflow"
              >
                <UIcon name="i-heroicons-film-20-solid" class="w-4 h-4" />
                <span class="text-xs font-medium">Select Video First</span>
              </UButton>
            </div>
          </div>
        </div>

        <!-- Subject First Workflow -->
        <div v-if="workflowMode === 'subject-first'" class="flex flex-col flex-1 min-h-0">
          <!-- Step 1: Subject Selection -->
          <div v-if="!selectedSubject" class="flex flex-col flex-1 min-h-0">
            <!-- Subject Search Filters - Compact -->
            <div class="flex-shrink-0 mb-2">
              <SubjectSearchFilters
                :selected-subject="selectedSubject"
                @search="searchSubjects"
                @clear="clearSubjectFilters"
                @subject-select="handleSubjectSelection"
                :loading="subjectLoading"
              />
            </div>
            
            <!-- Subject Grid - Scrollable -->
            <div v-if="subjectHasSearched || subjectLoading" class="flex-1 min-h-0 overflow-y-auto">
              <SubjectGrid
                :subjects="subjects"
                :loading="subjectLoading"
                :has-searched="subjectHasSearched"
                :error="subjectError"
                :selection-mode="true"
                :display-images="displayImages"
                @subject-click="handleSubjectGridSelection"
              />
            </div>
          </div>

          <!-- Step 2: Video Selection (after subject is selected) -->
          <div v-if="selectedSubject" class="flex flex-col flex-1 min-h-0">
            <!-- Selected Subject Preview - Compact -->
            <div class="flex-shrink-0 mb-2 flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shrink-0">
                  <UIcon name="i-heroicons-user-20-solid" class="w-4 h-4 text-white" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {{ selectedSubject.label }}
                  </p>
                </div>
              </div>
              <UButton
                variant="ghost"
                color="error"
                icon="i-heroicons-x-mark-20-solid"
                size="xs"
                @click="clearSelectedSubject"
                :disabled="isSubmitting"
              />
            </div>
            
            <!-- Video Search Filters - Compact -->
            <div class="flex-shrink-0 mb-2">
              <VideoSearchFilters
                ref="videoSearchFilters"
                @search="searchVideos"
                @clear="clearVideoFilters"
                :loading="videoLoading"
              />
            </div>

            <!-- Selected Videos Count -->
            <div v-if="selectedVideos.length > 0" class="flex-shrink-0 mb-2 flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span class="text-sm font-medium text-blue-900 dark:text-blue-100">
                {{ selectedVideos.length }} video{{ selectedVideos.length !== 1 ? 's' : '' }} selected
              </span>
              <UButton
                variant="ghost"
                color="error"
                size="xs"
                @click="clearSelectedVideos"
              >
                Clear All
              </UButton>
            </div>

            <!-- Video Grid - Scrollable -->
            <div class="flex-1 min-h-0 overflow-y-auto">
              <div v-if="videoError" class="text-center py-12">
                <UAlert
                  color="error"
                  title="Error"
                  :description="videoError"
                  variant="subtle"
                />
              </div>

              <MediaGrid
                v-else
                ref="mediaGrid"
                :media-results="videos"
                :loading="videoLoading"
                :has-searched="videoHasSearched"
                :selection-mode="true"
                :multi-select="true"
                :selected-items="selectedVideos"
                @media-click="toggleVideoSelection"
              />
            </div>
          </div>
        </div>

        <!-- Video First Workflow -->
        <div v-if="workflowMode === 'video-first'" class="flex flex-col flex-1 min-h-0">
          <!-- Step 1: Video Selection -->
          <div v-if="!selectedVideo" class="flex flex-col flex-1 min-h-0">
            <!-- Video Search Filters - Compact -->
            <div class="flex-shrink-0 mb-2">
              <VideoSearchFilters
                ref="videoSearchFiltersVideoFirst"
                @search="searchVideos"
                @clear="clearVideoFilters"
                :loading="videoLoading"
              />
            </div>

            <!-- Video Grid - Scrollable -->
            <div class="flex-1 min-h-0 overflow-y-auto">
              <div v-if="videoError" class="text-center py-12">
                <UAlert
                  color="error"
                  title="Error"
                  :description="videoError"
                  variant="subtle"
                />
              </div>

              <MediaGrid
                v-else
                ref="mediaGrid"
                :media-results="videos"
                :loading="videoLoading"
                :has-searched="videoHasSearched"
                :selection-mode="true"
                :multi-select="false"
                :selected-items="selectedVideo ? [selectedVideo] : []"
                @media-click="handleVideoSelection"
              />
            </div>
          </div>

          <!-- Step 2: Subject Selection (after video is selected) -->
          <div v-if="selectedVideo" class="flex flex-col flex-1 min-h-0">
            <!-- Selected Video Preview - Compact -->
            <div class="flex-shrink-0 mb-2 flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex items-center gap-2">
                <div v-if="displayImages" class="w-12 h-9 bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0 relative">
                  <!-- Thumbnail Skeleton -->
                  <USkeleton
                    v-if="selectedVideo.thumbnail_uuid && !selectedVideoThumbnailLoaded"
                    class="absolute inset-0 w-full h-full rounded-none"
                  />
                  
                  <!-- Actual Thumbnail -->
                  <img
                    v-if="selectedVideo.thumbnail_uuid"
                    :src="`/api/media/${selectedVideo.thumbnail_uuid}/image?size=md`"
                    :alt="selectedVideo.filename"
                    class="w-full h-full object-cover object-top transition-opacity duration-300"
                    :class="{ 'opacity-0': !selectedVideoThumbnailLoaded }"
                    @load="selectedVideoThumbnailLoaded = true"
                    @error="selectedVideoThumbnailLoaded = true"
                  />
                  
                  <!-- Fallback for videos without thumbnails -->
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <UIcon name="i-heroicons-film-20-solid" class="w-3 h-3 text-gray-400" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {{ selectedVideo.filename }}
                  </p>
                </div>
              </div>
              <UButton
                variant="ghost"
                color="error"
                icon="i-heroicons-x-mark-20-solid"
                size="xs"
                @click="clearSelectedVideo"
                :disabled="isSubmitting"
              />
            </div>
            
            <!-- Subject Search Filters - Compact -->
            <div class="flex-shrink-0 mb-2">
              <SubjectSearchFilters
                :selected-subject="selectedSubject"
                @search="searchSubjects"
                @clear="clearSubjectFilters"
                @subject-select="handleSubjectSelection"
                :loading="subjectLoading"
              />
            </div>

            <!-- Selected Subjects Count -->
            <div v-if="selectedSubjects.length > 0" class="flex-shrink-0 mb-2 flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span class="text-sm font-medium text-blue-900 dark:text-blue-100">
                {{ selectedSubjects.length }} subject{{ selectedSubjects.length !== 1 ? 's' : '' }} selected
              </span>
              <UButton
                variant="ghost"
                color="error"
                size="xs"
                @click="clearSelectedSubjects"
              >
                Clear All
              </UButton>
            </div>

            <!-- Subject Grid - Scrollable -->
            <div class="flex-1 min-h-0 overflow-y-auto">
              <SubjectGrid
                :subjects="subjects"
                :loading="subjectLoading"
                :has-searched="subjectHasSearched"
                :error="subjectError"
                :selection-mode="true"
                :multi-select="true"
                :selected-items="selectedSubjects"
                :display-images="displayImages"
                @subject-click="toggleSubjectSelection"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex flex-col gap-3 w-full">
        <!-- Pagination Row (only show for video selection) -->
        <div v-if="(workflowMode === 'subject-first' && selectedSubject) || (workflowMode === 'video-first' && !selectedVideo)" class="flex justify-center">
          <UPagination
            v-model:page="videoCurrentPage"
            :items-per-page="videoLimit"
            :total="videoTotalEstimate"
            show-last
            show-first
            @update:page="handleVideoPageChange"
          />
        </div>
        
        <!-- Controls Row -->
        <div class="flex justify-between items-center w-full">
          <!-- Left side: Close and Back buttons -->
          <div class="flex gap-2">
            <UButton variant="outline" @click="closeModal" :disabled="isSubmitting">
              Close
            </UButton>
            <UButton
              v-if="workflowMode"
              variant="outline"
              @click="resetWorkflow"
              :disabled="isSubmitting"
              size="sm"
              color="primary"
            >
              Back
            </UButton>
          </div>
          
          <!-- Right side: Search Actions and Create Jobs -->
          <div class="flex gap-2">
          <!-- Search Actions for Subject First workflow -->
          <template v-if="workflowMode === 'subject-first' && !selectedSubject">
            <UButton
              v-if="subjectHasSearched || searchStore.subjectSearch.selectedTags.length > 0"
              color="gray"
              variant="outline"
              size="sm"
              icon="i-heroicons-x-mark"
              @click="clearSubjectFilters"
              :disabled="isSubmitting"
            >
              Clear
            </UButton>
            <UButton
              color="primary"
              size="sm"
              icon="i-heroicons-magnifying-glass"
              @click="searchSubjects"
              :disabled="isSubmitting"
            >
              Search Subjects
            </UButton>
          </template>
          
          <!-- Search Actions for Video First workflow (video selection) -->
          <template v-else-if="workflowMode === 'video-first' && !selectedVideo">
            <UButton
              v-if="videoHasSearched || searchStore.videoSearch.selectedTags.length > 0"
              color="gray"
              variant="outline"
              size="sm"
              icon="i-heroicons-x-mark"
              @click="clearVideoFilters"
              :disabled="isSubmitting"
            >
              Clear
            </UButton>
            <UButton
              color="primary"
              size="sm"
              icon="i-heroicons-magnifying-glass"
              @click="searchVideos"
              :disabled="isSubmitting"
            >
              Search Videos
            </UButton>
          </template>
          
          <!-- Search Actions for Subject First workflow (video selection) -->
          <template v-else-if="workflowMode === 'subject-first' && selectedSubject">
            <UButton
              v-if="videoHasSearched || searchStore.videoSearch.selectedTags.length > 0"
              color="gray"
              variant="outline"
              size="sm"
              icon="i-heroicons-x-mark"
              @click="clearVideoFilters"
              :disabled="isSubmitting"
            >
              Clear
            </UButton>
            <UButton
              color="primary"
              size="sm"
              icon="i-heroicons-magnifying-glass"
              @click="searchVideos"
              :disabled="isSubmitting"
            >
              Search Videos
            </UButton>
          </template>
          
          <!-- Search Actions for Video First workflow (subject selection) -->
          <template v-else-if="workflowMode === 'video-first' && selectedVideo">
            <UButton
              v-if="subjectHasSearched || searchStore.subjectSearch.selectedTags.length > 0"
              color="gray"
              variant="outline"
              size="sm"
              icon="i-heroicons-x-mark"
              @click="clearSubjectFilters"
              :disabled="isSubmitting"
            >
              Clear
            </UButton>
            <UButton
              color="primary"
              size="sm"
              icon="i-heroicons-magnifying-glass"
              @click="searchSubjects"
              :disabled="isSubmitting"
            >
              Search Subjects
            </UButton>
          </template>
          
          <!-- Create Jobs Action -->
          <UButton
            v-if="workflowMode && canCreateJobs"
            type="button"
            :loading="isSubmitting"
            :disabled="!canCreateJobs"
            size="sm"
            color="primary"
            @click="createBatchJobs"
          >
            {{ isSubmitting ? 'Creating Jobs...' : `Create Jobs (${jobCount})` }}
          </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useTags } from '~/composables/useTags'
import { useSettings } from '~/composables/useSettings'
import { useSearchStore } from '~/stores/search'
import VideoSearchFilters from '~/components/VideoSearchFilters.vue'
import SubjectSearchFilters from '~/components/SubjectSearchFilters.vue'

// Use our responsive breakpoints composable
const { isMobile } = useBreakpoints()

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'jobsCreated'])

// Use composables
const { setSubjectTags, setVideoTags, getSubjectHairTags, getVideoHairTags, clearTags } = useTags()
const { displayImages } = useSettings()
const searchStore = useSearchStore()

// Computed
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Hardcoded job type - Face Swap only
const form = ref({
  job_type: 'vid_faceswap'
})

// Workflow state
const workflowMode = ref(null) // 'subject-first' | 'video-first' | null
const isSubmitting = ref(false)

// Thumbnail loading states
const selectedVideoThumbnailLoaded = ref(false)

// Component refs
const videoSearchFilters = ref(null)
const videoSearchFiltersVideoFirst = ref(null)

// Subject-first workflow state
const selectedSubject = ref(null)
const selectedVideos = ref([])
const videos = ref([])
const videoLoading = ref(false)
const videoError = ref(null)
const videoCurrentPage = ref(1)
const videoHasSearched = ref(false)
const videoLimit = computed(() => {
  return typeof searchStore.videoSearch.limitOptions === 'object' ? searchStore.videoSearch.limitOptions.value : searchStore.videoSearch.limitOptions || 50
})
const videoTotalEstimate = ref(0)

// Video-first workflow state
const selectedVideo = ref(null)
const selectedSubjects = ref([])
const subjects = ref([])
const subjectLoading = ref(false)
const subjectError = ref(null)
const subjectCurrentPage = ref(1)
const subjectHasSearched = ref(false)


// Computed properties
const canCreateJobs = computed(() => {
  if (workflowMode.value === 'subject-first') {
    return selectedSubject.value && selectedVideos.value.length > 0
  } else if (workflowMode.value === 'video-first') {
    return selectedVideo.value && selectedSubjects.value.length > 0
  }
  return false
})

const jobCount = computed(() => {
  if (workflowMode.value === 'subject-first') {
    return selectedVideos.value.length
  } else if (workflowMode.value === 'video-first') {
    return selectedSubjects.value.length
  }
  return 0
})


// Modal methods
const closeModal = () => {
  isOpen.value = false
  resetWorkflow()
}

// Workflow methods
const startSubjectFirstWorkflow = () => {
  workflowMode.value = 'subject-first'
  resetSelections()
  // Auto-load all subjects when starting this workflow
  nextTick(() => {
    searchSubjects()
  })
}

const startVideoFirstWorkflow = () => {
  workflowMode.value = 'video-first'
  resetSelections()
  // Auto-load videos when starting this workflow
  nextTick(() => {
    searchVideos()
  })
}

const resetWorkflow = () => {
  workflowMode.value = null
  resetSelections()
  clearTags()
}

const resetSelections = () => {
  // Clear subject-first workflow
  selectedSubject.value = null
  selectedVideos.value = []
  videos.value = []
  videoHasSearched.value = false
  
  // Clear video-first workflow
  selectedVideo.value = null
  selectedSubjects.value = []
  subjects.value = []
  subjectHasSearched.value = false
}

// Subject selection handlers
const handleSubjectSelection = (selected) => {
  selectedSubject.value = selected
  
  if (selected) {
    storeSubjectTags(selected)
    
    // Auto-fill video search filters with subject's hair tags (replace existing tags)
    const subjectHairTags = getSubjectHairTags()
    searchStore.videoSearch.selectedTags = subjectHairTags
  } else {
    setSubjectTags([])
    // Clear video search tags when no subject is selected
    searchStore.videoSearch.selectedTags = []
  }
}

const handleSubjectGridSelection = (subject) => {
  const selected = {
    value: subject.id,
    label: subject.name,
    tags: subject.tags
  }
  handleSubjectSelection(selected)
}

const clearSelectedSubject = () => {
  selectedSubject.value = null
  setSubjectTags([])
}

const toggleSubjectSelection = (subject) => {
  const subjectData = {
    id: subject.id,
    name: subject.name,
    tags: subject.tags
  }
  
  const index = selectedSubjects.value.findIndex(s => s.id === subject.id)
  if (index > -1) {
    selectedSubjects.value.splice(index, 1)
  } else {
    selectedSubjects.value.push(subjectData)
  }
}

const clearSelectedSubjects = () => {
  selectedSubjects.value = []
}

// Video selection handlers
const handleVideoSelection = (video) => {
  selectedVideo.value = video
  selectedVideoThumbnailLoaded.value = false
  storeVideoTags(video)
  
  // Auto-fill subject search filters with video's hair tags (replace existing tags)
  const videoHairTags = getVideoHairTags()
  searchStore.subjectSearch.selectedTags = videoHairTags
}

const clearSelectedVideo = () => {
  selectedVideo.value = null
  selectedVideoThumbnailLoaded.value = false
  setVideoTags([])
  // Clear subject search tags when no video is selected
  searchStore.subjectSearch.selectedTags = []
}

const toggleVideoSelection = (video) => {
  const index = selectedVideos.value.findIndex(v => v.uuid === video.uuid)
  if (index > -1) {
    selectedVideos.value.splice(index, 1)
  } else {
    selectedVideos.value.push(video)
  }
}

const clearSelectedVideos = () => {
  selectedVideos.value = []
}

// Helper functions for tag storage
const storeSubjectTags = (subject) => {
  if (subject && subject.tags && subject.tags.tags) {
    setSubjectTags(subject.tags.tags)
  } else {
    setSubjectTags([])
  }
}

const storeVideoTags = (video) => {
  if (video && video.tags && video.tags.tags) {
    setVideoTags(video.tags.tags)
  } else {
    setVideoTags([])
  }
}

// Search methods
const searchVideos = () => {
  videoCurrentPage.value = 1
  loadVideos(true)
}

const clearVideoFilters = () => {
  searchStore.resetVideoFilters()
  videos.value = []
  videoHasSearched.value = false
  videoTotalEstimate.value = 0
}


const searchSubjects = () => {
  subjectCurrentPage.value = 1
  loadSubjects()
}

const clearSubjectFilters = () => {
  searchStore.resetSubjectFilters()
  subjects.value = []
  subjectHasSearched.value = false
  subjectCurrentPage.value = 1
  subjectError.value = null
}


// Load videos function with simple pagination
const loadVideos = async (reset = false) => {
  videoLoading.value = true
  
  if (reset) {
    videos.value = []
    videoCurrentPage.value = 1
  }
  
  videoError.value = null
  videoHasSearched.value = true

  try {
    const params = new URLSearchParams()
    
    params.append('media_type', 'video')
    params.append('purpose', 'dest')
    
    // Use limit from search store
    const limit = typeof searchStore.videoSearch.limitOptions === 'object' ? searchStore.videoSearch.limitOptions.value : searchStore.videoSearch.limitOptions || 50
    params.append('limit', limit.toString())
    params.append('offset', ((videoCurrentPage.value - 1) * limit).toString())
    
    // Handle dynamic sorting with proper random support
    const sortValue = typeof searchStore.videoSearch.sortOptions === 'object' ? searchStore.videoSearch.sortOptions.value : searchStore.videoSearch.sortOptions
    
    let sortBy, sortOrder
    if (sortValue === 'random') {
      sortBy = 'random'
      sortOrder = 'asc'
    } else if (sortValue && sortValue.endsWith('_desc')) {
      sortBy = sortValue.slice(0, -5)
      sortOrder = 'desc'
    } else if (sortValue && sortValue.endsWith('_asc')) {
      sortBy = sortValue.slice(0, -4)
      sortOrder = 'asc'
    } else {
      sortBy = 'random'
      sortOrder = 'asc'
    }
    
    params.append('sort_by', sortBy)
    params.append('sort_order', sortOrder)

    // Add selected tags
    if (searchStore.videoSearch.selectedTags.length > 0) {
      params.append('tags', searchStore.videoSearch.selectedTags.join(','))
    }

    // Add duration filters
    if (searchStore.videoSearch.durationFilters.min_duration != null && searchStore.videoSearch.durationFilters.min_duration > 0) {
      params.append('min_duration', searchStore.videoSearch.durationFilters.min_duration.toString())
    }
    if (searchStore.videoSearch.durationFilters.max_duration != null && searchStore.videoSearch.durationFilters.max_duration > 0) {
      params.append('max_duration', searchStore.videoSearch.durationFilters.max_duration.toString())
    }

    // Filter out videos already assigned to the selected subject UUID
    if (selectedSubject.value && selectedSubject.value.value) {
      params.append('exclude_subject_uuid', selectedSubject.value.value)
    }

    params.append('include_thumbnails', 'true')

    const response = await useApiFetch(`media/search?${params.toString()}`)
    videos.value = response.results || []
    
    // Estimate total for pagination
    const gotFullPage = (response.results || []).length === limit
    if (gotFullPage) {
      videoTotalEstimate.value = (videoCurrentPage.value * limit) + 1
    } else {
      videoTotalEstimate.value = ((videoCurrentPage.value - 1) * limit) + videos.value.length
    }

  } catch (err) {
    console.error('Error loading videos:', err)
    videoError.value = err.message || 'Failed to load videos'
  } finally {
    videoLoading.value = false
  }
}

// Handle pagination page changes
const handleVideoPageChange = (page) => {
  videoCurrentPage.value = page
  loadVideos(false)
}

// Load subjects function - uses cached data with local filtering only
const loadSubjects = async () => {
  subjectLoading.value = true
  subjects.value = []
  subjectCurrentPage.value = 1
  
  subjectError.value = null
  subjectHasSearched.value = true

  try {
    // Get subjects from cache ONLY - no API calls
    const { store } = useSubjects()
    const cachedSubjects = store.getCachedFullSubjects([]) || []
    
    if (cachedSubjects.length === 0) {
      // If no cache, show error instead of making API call
      throw new Error('Subjects cache not loaded. Please refresh the page.')
    }
    
    // Apply LOCAL filtering to cached data (no API calls)
    let filteredSubjects = [...cachedSubjects]
    
    // Apply name category filters locally
    filteredSubjects = filteredSubjects.filter(subject => {
      const name = subject.name.toLowerCase()
      const isCeleb = name.includes('celeb')
      const isAsmr = name.includes('asmr')
      
      // If celeb filter is on and this is a celeb subject, include it
      if (searchStore.subjectSearch.nameFilters.celeb && isCeleb) {
        return true
      }
      
      // If asmr filter is on and this is an asmr subject, include it
      if (searchStore.subjectSearch.nameFilters.asmr && isAsmr) {
        return true
      }
      
      // If real filter is on and this is NOT celeb or asmr, include it
      if (searchStore.subjectSearch.nameFilters.real && !isCeleb && !isAsmr) {
        return true
      }
      
      // If none of the filters match, exclude this subject
      return false
    })
    
    // Apply tag filtering locally (only if tags are selected)
    if (searchStore.subjectSearch.selectedTags.length > 0) {
      filteredSubjects = filteredSubjects.filter(subject => {
        if (!subject.tags || !subject.tags.tags) return false
        
        const subjectTags = subject.tags.tags.map(tag => tag.toLowerCase())
        return searchStore.subjectSearch.selectedTags.some(selectedTag =>
          subjectTags.some(subjectTag =>
            subjectTag.includes(selectedTag.toLowerCase())
          )
        )
      })
    }
    
    // Apply local sorting
    const sortValue = typeof searchStore.subjectSearch.sortOptions === 'object'
      ? searchStore.subjectSearch.sortOptions.value
      : searchStore.subjectSearch.sortOptions
    
    // Fix parsing - split on last underscore, not first
    let sortBy, sortOrder
    if (sortValue.includes('_')) {
      const lastUnderscoreIndex = sortValue.lastIndexOf('_')
      sortBy = sortValue.substring(0, lastUnderscoreIndex)
      sortOrder = sortValue.substring(lastUnderscoreIndex + 1)
    } else {
      sortBy = 'total_jobs'
      sortOrder = 'desc'
    }
    
    filteredSubjects.sort((a, b) => {
      let aVal, bVal
      
      switch (sortBy) {
        case 'name':
          aVal = a.name || ''
          bVal = b.name || ''
          break
        case 'created_at':
          aVal = new Date(a.created_at || 0)
          bVal = new Date(b.created_at || 0)
          break
        case 'updated_at':
          aVal = new Date(a.updated_at || 0)
          bVal = new Date(b.updated_at || 0)
          break
        case 'total_jobs':
        default:
          // Use the correct field name from cached subjects
          aVal = Number(a.total_job_count) || 0
          bVal = Number(b.total_job_count) || 0
          break
      }
      
      if (sortOrder === 'desc') {
        if (sortBy === 'total_jobs') {
          // For numeric values, use proper numeric comparison
          return bVal - aVal
        } else {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
        }
      } else {
        if (sortBy === 'total_jobs') {
          // For numeric values, use proper numeric comparison
          return aVal - bVal
        } else {
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        }
      }
    })
    
    subjects.value = filteredSubjects
    
  } catch (err) {
    console.error('Error loading subjects:', err)
    subjectError.value = err.message || 'Failed to load subjects'
  } finally {
    subjectLoading.value = false
  }
}

// Batch job creation
const createBatchJobs = async () => {
  if (!canCreateJobs.value) return

  isSubmitting.value = true
  const toast = useToast()
  let successCount = 0
  let errorCount = 0
  const errors = []

  try {
    const jobTypeValue = form.value.job_type?.value || form.value.job_type

    if (workflowMode.value === 'subject-first') {
      // Create jobs for each selected video with the selected subject
      for (const video of selectedVideos.value) {
        try {
          const payload = {
            job_type: jobTypeValue,
            dest_media_uuid: video.uuid,
            subject_uuid: selectedSubject.value.value,
            parameters: {}
          }

          await useApiFetch('submit-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          })

          successCount++
        } catch (error) {
          errorCount++
          errors.push(`${video.filename}: ${error.message}`)
        }
      }
    } else if (workflowMode.value === 'video-first') {
      // Create jobs for each selected subject with the selected video
      for (const subject of selectedSubjects.value) {
        try {
          const payload = {
            job_type: jobTypeValue,
            dest_media_uuid: selectedVideo.value.uuid,
            subject_uuid: subject.id,
            parameters: {}
          }

          await useApiFetch('submit-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          })

          successCount++
        } catch (error) {
          errorCount++
          errors.push(`${subject.name}: ${error.message}`)
        }
      }
    }

    // Show results
    if (successCount > 0) {
      toast.add({
        title: 'Success',
        description: `Successfully created ${successCount} job${successCount !== 1 ? 's' : ''}!`,
        color: 'green'
      })
    }

    if (errorCount > 0) {
      toast.add({
        title: 'Partial Success',
        description: `${errorCount} job${errorCount !== 1 ? 's' : ''} failed to create. Check console for details.`,
        color: 'orange'
      })
      console.error('Job creation errors:', errors)
    }

    // Emit success event and close modal
    if (successCount > 0) {
      emit('jobsCreated', { successCount, errorCount })
      closeModal()
    }

  } catch (error) {
    console.error('Batch job creation error:', error)
    toast.add({
      title: 'Error',
      description: `Failed to create jobs: ${error.message || 'Unknown error occurred'}`,
      color: 'red'
    })
  } finally {
    isSubmitting.value = false
  }
}

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


// Watch for modal opening/closing
watch(() => props.modelValue, (isOpen) => {
  if (!isOpen) {
    resetWorkflow()
  }
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