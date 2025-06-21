<template>
  <div class="container mx-auto p-6 max-w-2xl">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Submit Job
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        Submit a test or video processing job
      </p>
    </div>

    <UCard class="w-full">
      <template #header>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
          Job Configuration
        </h2>
      </template>

      <form @submit.prevent="submitJob" class="space-y-6">
        <!-- Job Type Selection -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Job Type <span class="text-red-500">*</span>
          </label>
          <USelectMenu
            v-model="form.jobtype"
            :items="jobTypeOptions"
            placeholder="Select job type..."
            class="w-full"
          />
          <p class="text-xs text-gray-500">Choose between 'test' for preview or 'vid' for full processing</p>
        </div>

        <!-- Source Name -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Source Name <span class="text-red-500">*</span>
          </label>
          <UInput
            v-model="form.source_name"
            placeholder="e.g., asmrmadi"
            :disabled="isSubmitting"
            class="w-full"
          />
          <p class="text-xs text-gray-500">Name of the source person/character</p>
        </div>

        <!-- Video Filename -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Video Filename <span class="text-red-500">*</span>
          </label>
          <UInput
            v-model="form.video_filename"
            placeholder="e.g., 058"
            :disabled="isSubmitting"
            class="w-full"
          />
          <p class="text-xs text-gray-500">Video file name without extension</p>
        </div>

        <!-- Source Index (only for vid mode) -->
        <div v-if="form.jobtype === 'vid'" class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Source Index <span class="text-red-500">*</span>
          </label>
          <UInput
            v-model.number="form.source_index"
            type="number"
            placeholder="0"
            :disabled="isSubmitting"
            min="0"
            class="w-full"
          />
          <p class="text-xs text-gray-500">Index of the source image to use</p>
        </div>

        <!-- Skip Seconds -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Skip Seconds <span class="text-red-500">*</span>
          </label>
          <UInput
            v-model.number="form.skip_seconds"
            type="number"
            placeholder="0"
            :disabled="isSubmitting"
            min="0"
            class="w-full"
          />
          <p class="text-xs text-gray-500">Number of seconds to skip from the beginning</p>
        </div>

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
        :color="message.type === 'success' ? 'green' : 'red'"
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
          <span>{{ form.jobtype }}</span>
        </div>
        <div class="flex justify-between">
          <span class="font-medium">Source Name:</span>
          <span>{{ form.source_name }}</span>
        </div>
        <div class="flex justify-between">
          <span class="font-medium">Video Filename:</span>
          <span>{{ form.video_filename }}</span>
        </div>
        <div v-if="form.jobtype === 'vid'" class="flex justify-between">
          <span class="font-medium">Source Index:</span>
          <span>{{ form.source_index }}</span>
        </div>
        <div class="flex justify-between">
          <span class="font-medium">Skip Seconds:</span>
          <span>{{ form.skip_seconds }}</span>
        </div>
      </div>

      <template #footer>
        <div class="text-sm text-gray-500">
          <strong>API Endpoint:</strong> /api/submit-job → http://localhost:8001/runsync
        </div>
      </template>
    </UCard>

  </div>
</template>

<script setup>
// Page metadata
definePageMeta({
  title: 'Submit Job'
})

// Reactive form data
const form = ref({
  jobtype: '',
  source_name: '',
  video_filename: '',
  source_index: 0,
  skip_seconds: 0
})

// Job type options
const jobTypeOptions = ['test', 'vid']

// UI state
const isSubmitting = ref(false)
const message = ref(null)

// Computed properties
const isFormValid = computed(() => {
  const baseValid = form.value.jobtype && 
                   form.value.source_name && 
                   form.value.video_filename

  if (form.value.jobtype === 'vid') {
    return baseValid && form.value.source_index !== null && form.value.source_index !== undefined
  }
  
  return baseValid
})

// Methods
const submitJob = async () => {
  if (!isFormValid.value) return

  isSubmitting.value = true
  message.value = null

  try {
    // Prepare the payload based on job type
    const payload = {
      input: {
        jobtype: form.value.jobtype,
        source_name: form.value.source_name,
        video_filename: form.value.video_filename,
        skip_seconds: form.value.skip_seconds
      }
    }

    // Add source_index for vid mode
    if (form.value.jobtype === 'vid') {
      payload.input.source_index = form.value.source_index
    }

    // Submit the job via our server API
    const response = await $fetch('/api/submit-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: payload
    })

    message.value = {
      type: 'success',
      text: `Job submitted successfully! ${form.value.jobtype === 'test' ? 'Quick preview' : 'Full processing'} job started.`
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
    jobtype: '',
    source_name: '',
    video_filename: '',
    source_index: 0,
    skip_seconds: 0
  }
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

// Page head
useHead({
  title: 'Submit Job - AI Job Tracking System',
  meta: [
    { name: 'description', content: 'Submit test or video processing jobs' }
  ]
})
</script>