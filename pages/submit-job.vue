<template>
  <div class="container mx-auto p-3 sm:p-6 max-w-2xl">
    <div class="mb-4 sm:mb-8">
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
        Submit Job
      </h1>
      <p class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
        Submit a video processing job to the media server
      </p>
    </div>

    <UCard class="w-full">
      <template #header>
        <h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
          Job Configuration
        </h2>
      </template>

      <form @submit.prevent="submitJob" class="space-y-4 sm:space-y-6">
        <!-- Job Type Selection -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Job Type <span class="text-red-500">*</span>
          </label>
          <USelectMenu
            v-model="form.job_type"
            :items="jobTypeOptions"
            placeholder="Select job type..."
            class="w-full"
          />
          <p class="text-xs text-gray-500 hidden sm:block">Choose the type of processing job</p>
        </div>

        <!-- Destination Video Selection (for vid_faceswap) -->
        <div v-if="form.job_type?.value === 'vid_faceswap' || form.job_type === 'vid_faceswap'" class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Destination Video <span class="text-red-500">*</span>
          </label>
          
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
              <div class="w-16 h-12 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden shrink-0">
                <img
                  v-if="selectedVideo.thumbnail"
                  :src="selectedVideo.thumbnail"
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
          
          <p class="text-xs text-gray-500">Select the destination video for face swapping</p>
        </div>

        <!-- Subject Selection (for vid_faceswap) -->
        <div v-if="form.job_type?.value === 'vid_faceswap' || form.job_type === 'vid_faceswap'" class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Subject <span class="text-red-500">*</span>
          </label>
          <UInputMenu
            v-model="selectedSubject"
            v-model:search-term="searchQuery"
            :items="subjectItems"
            placeholder="Search for a subject..."
            :disabled="isSubmitting"
            class="w-full"
            by="value"
            option-attribute="label"
            searchable
            @update:model-value="handleSubjectSelection"
          />
          <p class="text-xs text-gray-500">Search and select a subject for testing</p>
        </div>

        <!-- Additional Parameters -->
        <UAccordion :items="additionalParametersItems">
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
        </UAccordion>

        <!-- Submit Buttons -->
        <div class="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200 dark:border-gray-700">
          <UButton
            type="submit"
            :loading="isSubmitting"
            :disabled="!isFormValid"
            size="lg"
            class="flex-1"
            color="primary"
          >
            {{ isSubmitting ? 'Submitting...' : 'Submit Job' }}
          </UButton>
          
          <UButton
            variant="outline"
            @click="resetForm"
            :disabled="isSubmitting"
            size="lg"
            class="flex-1 sm:flex-none"
          >
            Reset
          </UButton>
        </div>
      </form>
    </UCard>

    <!-- Success/Error Messages -->
    <div v-if="message" class="mt-6">
      <UAlert
        :color="message.type === 'success' ? 'success' : 'error'"
        :title="message.type === 'success' ? 'Success' : 'Error'"
        :description="message.text"
        :close-button="{ icon: 'i-heroicons-x-mark-20-solid', color: 'gray', variant: 'link', padded: false }"
        @close="message = null"
      />
    </div>

    <!-- Job Details Preview -->
    <UCard v-if="isFormValid" class="mt-6">
      <template #header>
        <h3 class="text-lg font-semibold">Job Preview</h3>
      </template>
      
      <div class="space-y-2">
        <div class="flex justify-between">
          <span class="font-medium">Job Type:</span>
          <span>{{ form.job_type?.label || form.job_type }}</span>
        </div>
        <div v-if="form.job_type?.value === 'vid_faceswap' || form.job_type === 'vid_faceswap'" class="flex justify-between">
          <span class="font-medium">Destination Video:</span>
          <span class="font-mono text-sm">{{ form.dest_media_uuid }}</span>
        </div>
        <div v-if="form.job_type?.value === 'vid_faceswap' || form.job_type === 'vid_faceswap'" class="flex justify-between">
          <span class="font-medium">Subject:</span>
          <span class="text-sm">{{ selectedSubject?.label || 'Not selected' }}</span>
        </div>
        <div v-if="form.parameters_json" class="flex justify-between">
          <span class="font-medium">Parameters:</span>
          <span class="font-mono text-sm">{{ form.parameters_json }}</span>
        </div>
      </div>

      <template #footer>
        <div class="text-sm text-gray-500">
          <strong>API Endpoint:</strong> /api/auth/submit-job → Media Server /jobs
        </div>
      </template>
    </UCard>

    <!-- Video Selection Modal -->
    <VideoSelectionModal
      v-model="showVideoModal"
      @select="handleVideoSelection"
    />

  </div>
</template>

<script setup>
// Page metadata
definePageMeta({
  title: 'Submit Job'
})

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

// Subject search using composable
const {
  selectedSubject,
  searchQuery,
  subjectItems,
  loadSubjects,
  handleSubjectSelection: handleComposableSubjectSelection
} = useSubjects()

// Load subjects on mount
onMounted(() => loadSubjects())

// Job type options
const jobTypeOptions = [
  { label: 'Face Swap', value: 'vid_faceswap' }
]

// UI state
const isSubmitting = ref(false)
const message = ref(null)

// Computed properties
const isFormValid = computed(() => {
  const jobType = form.value.job_type?.value || form.value.job_type
  
  if (jobType === 'vid_faceswap') {
    return jobType && form.value.dest_media_uuid && form.value.subject_uuid
  }
  
  return false
})

const additionalParametersItems = computed(() => [
  {
    label: 'Additional Parameters (JSON)',
    slot: 'additional-parameters',
    defaultOpen: false
  }
])

// Video selection handlers
const handleVideoSelection = (video) => {
  selectedVideo.value = video
  form.value.dest_media_uuid = video.uuid
}

const clearSelectedVideo = () => {
  selectedVideo.value = null
  form.value.dest_media_uuid = ''
}

// Subject selection handler
const handleSubjectSelection = (selected) => {
  // Update the composable state
  handleComposableSubjectSelection(selected)
  
  // Update the form
  if (selected && selected.value) {
    form.value.subject_uuid = selected.value // Use the UUID
  } else {
    form.value.subject_uuid = ''
  }
}

// Methods
const submitJob = async () => {
  if (!isFormValid.value) return

  isSubmitting.value = true
  message.value = null

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

    message.value = {
      type: 'success',
      text: `Job submitted successfully! Job ID: ${response.job_id}. Status: ${response.status}`
    }

    console.log('Job response:', response)

  } catch (error) {
    console.error('Job submission error:', error)
    message.value = {
      type: 'error',
      text: `Failed to submit job: ${error.message || 'Unknown error occurred'}`
    }
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
  handleComposableSubjectSelection(null)
  message.value = null
}

// Auto-clear messages after 5 seconds
watch(message, (newMessage) => {
  if (newMessage) {
    setTimeout(() => {
      message.value = null
    }, 5000)
  }
})

// Watch for job type changes to clear selections when switching job types
watch(() => form.value.job_type, (newJobType) => {
  const jobTypeValue = newJobType?.value || newJobType
  if (jobTypeValue !== 'vid_faceswap') {
    // Clear selections when switching away from vid_faceswap
    handleComposableSubjectSelection(null)
    form.value.subject_uuid = ''
    selectedVideo.value = null
    form.value.dest_media_uuid = ''
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