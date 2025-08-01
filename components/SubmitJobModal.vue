<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile">
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
      <div class="space-y-4 h-[600px] overflow-y-auto custom-scrollbar">
        <!-- Job Type Selection -->
        <div class="space-y-2 mb-6">
          <USelectMenu
            v-model="form.job_type"
            :items="jobTypeOptions"
            placeholder="Select job type..."
            class="w-full"
          />
          <p class="text-xs text-gray-500 hidden sm:block">Choose the type of processing job</p>
        </div>

        <!-- Initial Selection Mode (when no workflow is active) -->
        <div v-if="!workflowMode && (form.job_type?.value === 'vid_faceswap' || form.job_type === 'vid_faceswap')" class="space-y-4">
          <div class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose your workflow to create batch jobs:
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Subject First Workflow -->
              <UButton
                variant="outline"
                size="lg"
                class="h-24 flex flex-col items-center justify-center space-y-2"
                @click="startSubjectFirstWorkflow"
              >
                <UIcon name="i-heroicons-user-20-solid" class="w-6 h-6" />
                <span class="text-sm font-medium">Select Subject First</span>
                <span class="text-xs text-gray-500">Choose subject, then select multiple videos</span>
              </UButton>
              
              <!-- Video First Workflow -->
              <UButton
                variant="outline"
                size="lg"
                class="h-24 flex flex-col items-center justify-center space-y-2"
                @click="startVideoFirstWorkflow"
              >
                <UIcon name="i-heroicons-film-20-solid" class="w-6 h-6" />
                <span class="text-sm font-medium">Select Video First</span>
                <span class="text-xs text-gray-500">Choose video, then select multiple subjects</span>
              </UButton>
            </div>
          </div>
        </div>

        <!-- Subject First Workflow -->
        <div v-if="workflowMode === 'subject-first'" class="space-y-6">
          <!-- Step 1: Subject Selection -->
          <div v-if="!selectedSubject" class="space-y-4">
            <!-- Subject Search -->
            <div class="w-full">
              <SubjectSearch
                v-model="selectedSubject"
                placeholder="Search by subject name..."
                :disabled="isSubmitting"
                @select="handleSubjectSelection"
              />
            </div>
            
            <!-- Subject Search Filters -->
            <div class="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Search by Tags
                </label>
                <UInputTags
                  v-model="searchStore.subjectSearch.selectedTags"
                  placeholder="Add tags (e.g., portrait, landscape)"
                  class="w-full"
                  enterkeyhint="enter"
                />
              </div>
              
              <!-- Search and Clear Buttons -->
              <div class="flex justify-center gap-3">
                <UButton
                  color="primary"
                  size="sm"
                  icon="i-heroicons-magnifying-glass"
                  @click="searchSubjects"
                >
                  Search Subjects
                </UButton>
                <UButton
                  v-if="subjectHasSearched || searchStore.subjectSearch.selectedTags.length > 0"
                  color="gray"
                  variant="outline"
                  size="sm"
                  icon="i-heroicons-x-mark"
                  @click="clearSubjectFilters"
                >
                  Clear
                </UButton>
              </div>
            </div>
            
            <!-- Subject Grid -->
            <div v-if="subjectHasSearched || subjectLoading" class="max-h-[60vh] overflow-y-auto">
              <SubjectGrid
                :subjects="subjects"
                :loading="subjectLoading"
                :loading-more="subjectLoadingMore"
                :has-searched="subjectHasSearched"
                :has-more="subjectHasMore"
                :error="subjectError"
                :selection-mode="true"
                :display-images="displayImages"
                @subject-click="handleSubjectGridSelection"
                @load-more="loadMoreSubjects"
              />
            </div>
          </div>

          <!-- Step 2: Video Selection (after subject is selected) -->
          <div v-if="selectedSubject" class="space-y-4">
            <!-- Selected Subject Preview -->
            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shrink-0">
                  <UIcon name="i-heroicons-user-20-solid" class="w-5 h-5 text-white" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    Selected Subject: {{ selectedSubject.label }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                    {{ selectedSubject.value }}
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

            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Step 2: Select Videos</h3>
            
            <!-- Video Search Filters -->
            <VideoSearchFilters 
              @search="searchVideos"
              @clear="clearVideoFilters"
              :loading="videoLoading"
            />

            <!-- Selected Videos Count -->
            <div v-if="selectedVideos.length > 0" class="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
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

            <!-- Video Grid -->
            <div class="max-h-[60vh] overflow-y-auto">
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
                :loading-more="videoLoadingMore"
                :has-searched="videoHasSearched"
                :has-more="videoHasMore"
                :selection-mode="true"
                :multi-select="true"
                :selected-items="selectedVideos"
                @media-click="toggleVideoSelection"
                @load-more="loadMoreVideos"
              />
            </div>
          </div>
        </div>

        <!-- Video First Workflow -->
        <div v-if="workflowMode === 'video-first'" class="space-y-6">
          <!-- Step 1: Video Selection -->
          <div v-if="!selectedVideo" class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Step 1: Select Video</h3>
            
            <!-- Video Search Filters -->
            <VideoSearchFilters 
              @search="searchVideos"
              @clear="clearVideoFilters"
              :loading="videoLoading"
            />

            <!-- Video Grid -->
            <div class="max-h-[60vh] overflow-y-auto">
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
                :loading-more="videoLoadingMore"
                :has-searched="videoHasSearched"
                :has-more="videoHasMore"
                :selection-mode="true"
                :multi-select="false"
                :selected-items="selectedVideo ? [selectedVideo] : []"
                @media-click="handleVideoSelection"
                @load-more="loadMoreVideos"
              />
            </div>
          </div>

          <!-- Step 2: Subject Selection (after video is selected) -->
          <div v-if="selectedVideo" class="space-y-4">
            <!-- Selected Video Preview -->
            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex items-center gap-3">
                <div v-if="displayImages" class="w-16 h-12 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden shrink-0">
                  <img
                    v-if="selectedVideo.thumbnail_uuid"
                    :src="`/api/media/${selectedVideo.thumbnail_uuid}/image?size=sm`"
                    :alt="selectedVideo.filename"
                    class="w-full h-full object-cover object-top"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <UIcon name="i-heroicons-film-20-solid" class="w-4 h-4 text-gray-400" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    Selected Video: {{ selectedVideo.filename }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                    {{ selectedVideo.uuid }}
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

            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Step 2: Select Subjects</h3>
            
            <!-- Subject Search Filters -->
            <SubjectSearchFilters 
              @search="searchSubjects"
              @clear="clearSubjectFilters"
              :loading="subjectLoading"
            />

            <!-- Selected Subjects Count -->
            <div v-if="selectedSubjects.length > 0" class="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
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

            <!-- Subject Grid -->
            <div class="max-h-[60vh] overflow-y-auto">
              <SubjectGrid
                :subjects="subjects"
                :loading="subjectLoading"
                :loading-more="subjectLoadingMore"
                :has-searched="subjectHasSearched"
                :has-more="subjectHasMore"
                :error="subjectError"
                :selection-mode="true"
                :multi-select="true"
                :selected-items="selectedSubjects"
                :display-images="displayImages"
                @subject-click="toggleSubjectSelection"
                @load-more="loadMoreSubjects"
              />
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div v-if="workflowMode && canCreateJobs" class="flex justify-center pt-6">
          <!-- Create Jobs Button -->
          <UButton
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
    </template>

    <template #footer>
      <div class="flex justify-between items-center w-full">
        <div class="flex gap-2">
          <UButton variant="outline" @click="closeModal" :disabled="isSubmitting">
            Close
          </UButton>
        </div>
        <div v-if="workflowMode" class="flex gap-2">
          <UButton
            variant="outline"
            @click="resetWorkflow"
            :disabled="isSubmitting"
            size="sm"
            color="primary"
          >
            Back
          </UButton>
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

// Use Nuxt's device detection
const { isMobile } = useDevice()

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

// Reactive form data
const form = ref({
  job_type: { label: 'Face Swap', value: 'vid_faceswap' }
})

// Workflow state
const workflowMode = ref(null) // 'subject-first' | 'video-first' | null
const isSubmitting = ref(false)

// Subject-first workflow state
const selectedSubject = ref(null)
const selectedVideos = ref([])
const videos = ref([])
const videoLoading = ref(false)
const videoLoadingMore = ref(false)
const videoError = ref(null)
const videoHasMore = ref(true)
const videoCurrentPage = ref(1)
const videoHasSearched = ref(false)

// Video-first workflow state
const selectedVideo = ref(null)
const selectedSubjects = ref([])
const subjects = ref([])
const subjectLoading = ref(false)
const subjectLoadingMore = ref(false)
const subjectError = ref(null)
const subjectHasMore = ref(true)
const subjectCurrentPage = ref(1)
const subjectHasSearched = ref(false)

// Job type options
const jobTypeOptions = [
  { label: 'Face Swap', value: 'vid_faceswap' }
]

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

// Background preloading state for videos
const videoPreloadQueue = ref([])
const isVideoPreloading = ref(false)
const videoPreloadedPages = ref(new Set())

// Modal methods
const closeModal = () => {
  isOpen.value = false
  resetWorkflow()
}

// Workflow methods
const startSubjectFirstWorkflow = () => {
  workflowMode.value = 'subject-first'
  resetSelections()
}

const startVideoFirstWorkflow = () => {
  workflowMode.value = 'video-first'
  resetSelections()
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
  storeVideoTags(video)
  
  // Auto-fill subject search filters with video's hair tags (replace existing tags)
  const videoHairTags = getVideoHairTags()
  searchStore.subjectSearch.selectedTags = videoHairTags
}

const clearSelectedVideo = () => {
  selectedVideo.value = null
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
  videoHasMore.value = true
  loadVideos(true)
}

const clearVideoFilters = () => {
  searchStore.resetVideoFilters()
  videos.value = []
  videoHasSearched.value = false
}

const searchSubjects = () => {
  subjectCurrentPage.value = 1
  subjectHasMore.value = true
  loadSubjects(true)
}

const clearSubjectFilters = () => {
  searchStore.resetSubjectFilters()
  subjects.value = []
  subjectHasSearched.value = false
  subjectCurrentPage.value = 1
  subjectHasMore.value = true
  subjectError.value = null
}

// Load videos function (simplified from VideoSelectionModal)
const loadVideos = async (reset = false) => {
  if (reset) {
    videoLoading.value = true
    videos.value = []
    videoCurrentPage.value = 1
    videoPreloadQueue.value = []
    videoPreloadedPages.value.clear()
  } else {
    videoLoadingMore.value = true
  }
  
  videoError.value = null
  videoHasSearched.value = true

  try {
    const params = new URLSearchParams()
    
    params.append('media_type', 'video')
    params.append('purpose', 'dest')
    params.append('limit', '8')
    params.append('offset', ((videoCurrentPage.value - 1) * 8).toString())
    
    // Handle dynamic sorting
    const sortValue = typeof searchStore.videoSearch.sortOptions === 'object' ? searchStore.videoSearch.sortOptions.value : searchStore.videoSearch.sortOptions
    
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

    if (reset) {
      videos.value = response.results || []
      // Start background preloading after first batch loads
      startVideoBackgroundPreloading()
    } else {
      videos.value.push(...(response.results || []))
    }

    videoHasMore.value = (response.results || []).length === 8

  } catch (err) {
    console.error('Error loading videos:', err)
    videoError.value = err.message || 'Failed to load videos'
  } finally {
    videoLoading.value = false
    videoLoadingMore.value = false
  }
}

// Background preloading function for videos
const startVideoBackgroundPreloading = async () => {
  if (isVideoPreloading.value) return
  isVideoPreloading.value = true
  
  // Calculate how many pages we need to preload to stay ahead
  const currentDisplayedPages = Math.ceil(videos.value.length / 8)
  const targetPreloadPages = currentDisplayedPages + 20 // Always stay 20 pages (160 videos) ahead
  
  // Preload from current position to target
  for (let i = currentDisplayedPages + 1; i <= targetPreloadPages; i++) {
    if (videoPreloadedPages.value.has(i)) continue
    
    try {
      const params = new URLSearchParams()
      params.append('media_type', 'video')
      params.append('purpose', 'dest')
      params.append('limit', '8')
      params.append('offset', ((i - 1) * 8).toString())
      
      // Add all the same filters as the main search
      const sortValue = typeof searchStore.videoSearch.sortOptions === 'object' ? searchStore.videoSearch.sortOptions.value : searchStore.videoSearch.sortOptions
      
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

      if (searchStore.videoSearch.selectedTags.length > 0) {
        params.append('tags', searchStore.videoSearch.selectedTags.join(','))
      }

      if (searchStore.videoSearch.durationFilters.min_duration != null && searchStore.videoSearch.durationFilters.min_duration > 0) {
        params.append('min_duration', searchStore.videoSearch.durationFilters.min_duration.toString())
      }
      if (searchStore.videoSearch.durationFilters.max_duration != null && searchStore.videoSearch.durationFilters.max_duration > 0) {
        params.append('max_duration', searchStore.videoSearch.durationFilters.max_duration.toString())
      }

      // Filter out videos already assigned to the selected subject UUID (for background preloading)
      if (selectedSubject.value && selectedSubject.value.value) {
        params.append('exclude_subject_uuid', selectedSubject.value.value)
      }

      params.append('include_thumbnails', 'true')

      const response = await useApiFetch(`media/search?${params.toString()}`)
      
      if (response.results && response.results.length > 0) {
        videoPreloadQueue.value.push(...response.results)
        videoPreloadedPages.value.add(i)
      } else {
        break // No more results
      }
      
      // Smaller delay for faster preloading
      await new Promise(resolve => setTimeout(resolve, 50))
      
    } catch (error) {
      console.error('Video background preload error:', error)
      break
    }
  }
  
  isVideoPreloading.value = false
}

const loadMoreVideos = () => {
  if (videoHasMore.value && !videoLoadingMore.value) {
    // Check if we have preloaded content
    if (videoPreloadQueue.value.length >= 8) {
      const nextBatch = videoPreloadQueue.value.splice(0, 8)
      videos.value.push(...nextBatch)
      videoCurrentPage.value++
      
      // Always keep preloading to stay well ahead - trigger when we have less than 80 videos queued
      if (videoPreloadQueue.value.length < 80) {
        startVideoBackgroundPreloading()
      }
    } else {
      // Fallback to regular loading
      videoCurrentPage.value++
      loadVideos(false)
    }
  }
}

// Load subjects function (simplified from SubjectSelectionModal)
const loadSubjects = async (reset = false) => {
  if (reset) {
    subjectLoading.value = true
    subjects.value = []
    subjectCurrentPage.value = 1
  } else {
    subjectLoadingMore.value = true
  }
  
  subjectError.value = null
  subjectHasSearched.value = true

  try {
    const params = new URLSearchParams()
    
    params.append('limit', '48')
    params.append('page', subjectCurrentPage.value.toString())
    params.append('include_images', 'true')
    params.append('image_size', 'thumb')
    params.append('sort_by', 'name')
    params.append('sort_order', 'asc')
    
    // Add selected tags if provided
    if (searchStore.subjectSearch.selectedTags.length > 0) {
      params.append('tags', searchStore.subjectSearch.selectedTags.join(','))
      params.append('tag_match_mode', 'partial')
    }

    const response = await useApiFetch(`subjects/search?${params.toString()}`)

    if (reset) {
      subjects.value = response.subjects || []
    } else {
      subjects.value.push(...(response.subjects || []))
    }

    subjectHasMore.value = response.pagination?.has_more || false

  } catch (err) {
    console.error('Error loading subjects:', err)
    subjectError.value = err.message || 'Failed to load subjects'
  } finally {
    subjectLoading.value = false
    subjectLoadingMore.value = false
  }
}

const loadMoreSubjects = () => {
  if (subjectHasMore.value && !subjectLoadingMore.value) {
    subjectCurrentPage.value++
    loadSubjects(false)
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

// Watch for job type changes
watch(() => form.value.job_type, (newJobType) => {
  const jobTypeValue = newJobType?.value || newJobType
  if (jobTypeValue !== 'vid_faceswap') {
    resetWorkflow()
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