<template>
  <div class="container mx-auto p-3 sm:p-6 max-w-2xl">
    <div class="mb-4 sm:mb-8">
      <h1 class="text-md sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
        Submit Job
      </h1>
    </div>

    <UCard class="w-full">

      <form @submit.prevent="submitJob" class="space-y-4 sm:space-y-6">
        <!-- Job Type Selection -->
        <div class="space-y-2">
          <USelectMenu
            v-model="form.job_type"
            :items="jobTypeOptions"
            placeholder="Select job type..."
            class="w-full"
          />
          <p class="text-xs text-gray-500 hidden sm:block">Choose the type of processing job</p>
        </div>

        <!-- Subject Selection (for vid_faceswap) -->
        <div v-if="form.job_type?.value === 'vid_faceswap' || form.job_type === 'vid_faceswap'" class="space-y-2">
          
          <!-- Subject Selection Options -->
          <div class="space-y-2">
            <!-- Subject Search and Select Button Row -->
            <div class="flex flex-row items-center gap-2">
              <!-- Subject Name Search with Dropdown -->
              <div class="flex-1 w-full">
                <SubjectSearch
                  v-model="selectedSubject"
                  placeholder="Search by subject name..."
                  :disabled="isSubmitting"
                  @select="handleSubjectSelection"
                />
              </div>
              
              <!-- Subject Selection Button -->
              <UButton
                variant="outline"
                icon="i-heroicons-user-20-solid"
                @click="showSubjectModal = true"
                :disabled="isSubmitting"
                size="sm"
                class="shrink-0"
              >
                <span class="hidden sm:inline">{{ selectedSubject ? 'Change Subject' : 'Select from List' }}</span>
                <span class="sm:hidden">{{ selectedSubject ? 'Change' : 'Select from List' }}</span>
              </UButton>
            </div>
            
            <!-- Selected Subject Preview -->
            <div v-if="selectedSubject" class="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shrink-0">
                <UIcon name="i-heroicons-user-20-solid" class="w-5 h-5 text-white" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ selectedSubject.label }}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                  {{ selectedSubject.value }}
                </p>
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
          </div>
          
        </div>

        <!-- Destination Video Selection (for vid_faceswap) -->
        <div v-if="form.job_type?.value === 'vid_faceswap' || form.job_type === 'vid_faceswap'" class="space-y-2">
          
          <!-- Video Selection Button and Preview -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <UButton
              variant="outline"
              icon="i-heroicons-film-20-solid"
              @click="showVideoModal = true"
              :disabled="isSubmitting"
              size="sm"
              class="shrink-0 w-full sm:w-auto"
            >
              <span class="hidden sm:inline">{{ selectedVideo ? 'Change Video' : 'Select Destination Video' }}</span>
              <span class="sm:hidden">{{ selectedVideo ? 'Change' : 'Select Video' }}</span>
            </UButton>
            
            <!-- Selected Video Preview -->
            <div v-if="selectedVideo" class="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg flex-1">
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
                  {{ selectedVideo.filename }}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                  {{ selectedVideo.uuid }}
                </p>
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
          </div>
          
        </div>

        <!-- Additional Parameters -->
        <!-- <UAccordion :items="additionalParametersItems">
          <template #additional-parameters>
            <div class="space-y-2">
              <UTextarea
                v-model="form.parameters_json"
                placeholder='{"skip_seconds": 0, "quality": "high"}'
                :disabled="isSubmitting"
                class="w-full"
                rows="3"
              />
              <p class="text-xs text-gray-500">Optional JSON parameters for the job</p>
            </div>
          </template>
        </UAccordion> -->

        <!-- Submit Buttons -->
        <div class="flex gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
          <UButton
            type="submit"
            :loading="isSubmitting"
            :disabled="!isFormValid"
            size="sm"
            color="primary"
          >
            {{ isSubmitting ? 'Submitting...' : 'Submit Job' }}
          </UButton>
          
          <UButton
            variant="outline"
            @click="resetForm"
            :disabled="isSubmitting"
            size="sm"
            color="primary"
          >
            Reset
          </UButton>
        </div>
      </form>
    </UCard>

    <!-- Video Selection Modal -->
    <VideoSelectionModal
      v-model="showVideoModal"
      :initial-tags="subjectHairTags"
      @select="handleVideoSelection"
    />

    <!-- Subject Selection Modal -->
    <SubjectSelectionModal
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

// Page metadata
definePageMeta({
  title: 'Submit Job'
})

// Use the tags composable
const { setSubjectTags, setVideoTags, getSubjectHairTags, getVideoHairTags, clearTags } = useTags()

// Use the settings composable
const { displayImages } = useSettings()

// Reactive form data
const form = ref({
  job_type: { label: 'Face Swap', value: 'vid_faceswap' },
  dest_media_uuid: '',
  subject_uuid: '',
  parameters_json: ''
})

// Video selection data
const selectedVideo = ref(null)
const showVideoModal = ref(false)

// Subject selection data
const selectedSubject = ref(null)
const showSubjectModal = ref(false)

// Subject selection is now handled by SubjectSearch component

// Cross-modal tag synchronization using computed properties from the composable
const subjectHairTags = computed(() => getSubjectHairTags())
const videoHairTags = computed(() => getVideoHairTags())

// Helper function to store subject tags when subject is selected
const storeSubjectTags = (subject) => {
  
  if (subject && subject.tags && subject.tags.tags) {
    setSubjectTags(subject.tags.tags)
  } else {
    setSubjectTags([])
  }
}

// Helper function to store video tags when video is selected
const storeVideoTags = (video) => {
  if (video && video.tags && video.tags.tags) {
    setVideoTags(video.tags.tags)
  } else {
    setVideoTags([])
  }
}

// Job type options
const jobTypeOptions = [
  { label: 'Face Swap', value: 'vid_faceswap' }
]

// UI state
const isSubmitting = ref(false)

// Computed properties
const isFormValid = computed(() => {
  const jobType = form.value.job_type?.value || form.value.job_type
  
  if (jobType === 'vid_faceswap') {
    return jobType && form.value.dest_media_uuid && form.value.subject_uuid
  }
  
  return false
})

// const additionalParametersItems = computed(() => [
//   {
//     label: 'Additional Parameters (JSON)',
//     slot: 'additional-parameters',
//     defaultOpen: false
//   }
// ])

// Video selection handlers
const handleVideoSelection = (video) => {
  selectedVideo.value = video
  form.value.dest_media_uuid = video.uuid
  
  // Store video tags in the composable
  storeVideoTags(video)
}

const clearSelectedVideo = () => {
  selectedVideo.value = null
  form.value.dest_media_uuid = ''
  setVideoTags([])
}

// Subject selection handlers
const handleSubjectSelection = (selected) => {
  selectedSubject.value = selected
  form.value.subject_uuid = selected ? selected.value : ''
  
  // Store subject tags in the composable
  if (selected) {
    storeSubjectTags(selected)
  } else {
    setSubjectTags([])
  }
}

const clearSelectedSubject = () => {
  selectedSubject.value = null
  form.value.subject_uuid = ''
  setSubjectTags([])
}


// Methods
const submitJob = async () => {
  if (!isFormValid.value) return

  isSubmitting.value = true

  try {
    // Parse parameters JSON if provided
    let parameters = {}
    if (form.value.parameters_json) {
      try {
        parameters = JSON.parse(form.value.parameters_json)
      } catch (parseError) {
        throw new Error(`Invalid JSON in parameters field: ${parseError.message}`)
      }
    }

    // Get the actual job type value
    const jobTypeValue = form.value.job_type?.value || form.value.job_type

    // Prepare the payload for the new API format
    const payload = {
      job_type: jobTypeValue,
      parameters: parameters
    }

    // Add required fields based on job type
    if (jobTypeValue === 'vid_faceswap') {
      payload.dest_media_uuid = form.value.dest_media_uuid
      payload.subject_uuid = form.value.subject_uuid
    }

    // Submit the job via our server API
    const response = await useApiFetch('submit-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: payload
    })

    // Show success toast
    const toast = useToast()
    toast.add({
      title: 'Success',
      description: `Job submitted successfully! Job ID: ${response.job_id}. Status: ${response.status}`,
      color: 'green'
    })

    // Reset video selection after successful job submission
    clearSelectedVideo()

    console.log('Job response:', response)

  } catch (error) {
    console.error('Job submission error:', error)
    // Show error toast
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: `Failed to submit job: ${error.message || 'Unknown error occurred'}`,
      color: 'red'
    })
  } finally {
    isSubmitting.value = false
  }
}

const resetForm = () => {
  form.value = {
    job_type: { label: 'Face Swap', value: 'vid_faceswap' },
    dest_media_uuid: '',
    subject_uuid: '',
    parameters_json: ''
  }
  selectedVideo.value = null
  selectedSubject.value = null
  clearTags()
}


// Watch for job type changes to clear selections when switching job types
watch(() => form.value.job_type, (newJobType) => {
  const jobTypeValue = newJobType?.value || newJobType
  if (jobTypeValue !== 'vid_faceswap') {
    // Clear selections when switching away from vid_faceswap
    selectedSubject.value = null
    form.value.subject_uuid = ''
    selectedVideo.value = null
    form.value.dest_media_uuid = ''
    clearTags()
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