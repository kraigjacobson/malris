<template>
  <div class="container mx-auto p-3 sm:p-6 max-w-4xl">
    <div class="mb-4 sm:mb-8">
      <h1 class="text-md sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
        Submit Job
      </h1>
    </div>

    <UCard class="w-full">
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
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Step 1: Select Subject</h3>
          
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
              :has-searched="subjectHasSearched"
              :error="subjectError"
              :selection-mode="true"
              :display-images="displayImages"
              @subject-click="handleSubjectGridSelection"
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
              :has-searched="videoHasSearched"
              :selection-mode="true"
              :multi-select="true"
              :selected-items="selectedVideos"
              @media-click="toggleVideoSelection"
            />
          </div>

          <!-- Video Pagination -->
          <div v-if="videoHasSearched && videos.length > 0" class="flex justify-center mt-4">
            <UPagination
              v-model:page="videoCurrentPage"
              :items-per-page="videoLimit"
              :total="videoTotalEstimate"
              show-last
              show-first
              @update:page="handleVideoPageChange"
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
              :has-searched="videoHasSearched"
              :selection-mode="true"
              :multi-select="false"
              :selected-items="selectedVideo ? [selectedVideo] : []"
              @media-click="handleVideoSelection"
            />
          </div>

          <!-- Video Pagination -->
          <div v-if="videoHasSearched && videos.length > 0" class="flex justify-center mt-4">
            <UPagination
              v-model:page="videoCurrentPage"
              :items-per-page="videoLimit"
              :total="videoTotalEstimate"
              show-last
              show-first
              @update:page="handleVideoPageChange"
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

      <!-- Footer with Back Button -->
      <template v-if="workflowMode" #footer>
        <div class="flex justify-center">
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
      </template>
    </UCard>


    <!-- Subject Selection Modal (for video-first workflow only) -->
    <SubjectSelectionModal
      v-if="workflowMode === 'video-first'"
      v-model="showSubjectModal"
      :initial-tags="videoHairTags"
      :selected-video="selectedVideo"
      @select="handleSubjectSelection"
    />

  </div>
</template>

<script setup>
import { useTags } from '~/composables/useTags'
import { useSettings } from '~/composables/useSettings'
import { useSearchStore } from '~/stores/search'
import { useSubjectsStore } from '~/stores/subjects'
import VideoSearchFilters from '~/components/VideoSearchFilters.vue'
import SubjectSearchFilters from '~/components/SubjectSearchFilters.vue'

// Page metadata
definePageMeta({
  title: 'Submit Job'
})

// Use composables
const { setSubjectTags, setVideoTags, getVideoHairTags, clearTags } = useTags()
const { displayImages } = useSettings()
const searchStore = useSearchStore()
const subjectsStore = useSubjectsStore()

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
const videoError = ref(null)
const videoCurrentPage = ref(1)
const videoHasSearched = ref(false)
const videoLimit = computed(() => {
  return typeof searchStore.videoSearch.limitOptions === 'object' ? searchStore.videoSearch.limitOptions.value : searchStore.videoSearch.limitOptions
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

// Modal state
const showSubjectModal = ref(false)

// Job type options
const jobTypeOptions = [
  { label: 'Face Swap', value: 'vid_faceswap' }
]

// Cross-modal tag synchronization
const videoHairTags = computed(() => getVideoHairTags())

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
  videoTotalEstimate.value = 0
  
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
  } else {
    setSubjectTags([])
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
}

const clearSelectedVideo = () => {
  selectedVideo.value = null
  setVideoTags([])
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

// Search methods (to be implemented with filter components)
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
  loadSubjects()
}

const clearSubjectFilters = () => {
  searchStore.resetSubjectFilters()
  subjects.value = []
  subjectHasSearched.value = false
  subjectCurrentPage.value = 1
  subjectError.value = null
}


// Load videos function with pagination
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
    const limit = videoLimit.value
    params.append('limit', limit.toString())
    params.append('offset', ((videoCurrentPage.value - 1) * limit).toString())
    
    // Handle dynamic sorting
    const sortValue = typeof searchStore.videoSearch.sortOptions === 'object' ? searchStore.videoSearch.sortOptions.value : searchStore.videoSearch.sortOptions
    
    console.log('🔍 submit-job.vue sort value:', sortValue, 'type:', typeof sortValue)
    
    // Check if random sorting is selected
    if (sortValue === 'random') {
      params.append('sort_by', 'random')
      params.append('sort_order', 'asc') // Order doesn't matter for random, but API expects it
      console.log('✅ Using random sorting in submit-job.vue')
    } else {
      // Parse sort value properly for API format
      let sortBy, sortOrder
      if (sortValue && sortValue.endsWith('_desc')) {
        sortBy = sortValue.slice(0, -5) // Remove '_desc'
        sortOrder = 'desc'
      } else if (sortValue && sortValue.endsWith('_asc')) {
        sortBy = sortValue.slice(0, -4) // Remove '_asc'
        sortOrder = 'asc'
      } else {
        // This should never happen if the UI is working correctly
        console.error('❌ SUBMIT-JOB FALLBACK USED: Unknown sort value from searchStore:', sortValue, 'searchStore.videoSearch.sortOptions:', searchStore.videoSearch.sortOptions)
        console.error('❌ This indicates a bug in the search filter UI or store')
        sortBy = 'random'
        sortOrder = 'asc'
      }
      
      params.append('sort_by', sortBy)
      params.append('sort_order', sortOrder)
      console.log('✅ Using sort in submit-job.vue:', sortBy, sortOrder)
    }

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
    
    // Estimate total for pagination based on whether we got a full page
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

// Load subjects function - use cached subjects from store
const loadSubjects = async () => {
  subjectLoading.value = true
  subjects.value = []
  subjectCurrentPage.value = 1
  
  subjectError.value = null
  subjectHasSearched.value = true

  try {
    // Check if we have cached subjects first
    const cachedSubjects = subjectsStore.getCachedFullSubjects(searchStore.subjectSearch.selectedTags)
    
    if (cachedSubjects) {
      console.log('✅ Using cached subjects:', cachedSubjects.length)
      subjects.value = cachedSubjects
    } else {
      console.log('🔄 Loading subjects from API...')
      const loadedSubjects = await subjectsStore.loadFullSubjects(searchStore.subjectSearch.selectedTags)
      subjects.value = loadedSubjects
    }
    
    // No pagination needed since we load all subjects at once

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

    // Reset workflow after successful creation
    if (successCount > 0) {
      resetWorkflow()
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

// Page head
useHead({
  title: 'Submit Job - Media Server Job System',
  meta: [
    { name: 'description', content: 'Submit video processing jobs to the media server' }
  ]
})
</script>