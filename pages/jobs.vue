<template>
  <div class="container mx-auto p-6">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Job Queue
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        Monitor and manage processing jobs
      </p>
    </div>

    <!-- Queue Status Card -->
    <UCard class="mb-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
            Queue Status
          </h2>
          <UButton :loading="isLoading" size="sm" variant="outline" @click="refreshData">
            <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" />
            Refresh
          </UButton>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div
          class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border-2"
          :class="{ 'border-blue-500 ring-2 ring-blue-200': filters.status === '' }"
          @click="filterByStatus('')"
        >
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ queueStatus?.queue?.total || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Jobs</div>
        </div>
        <div
          class="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors border-2"
          :class="{ 'border-yellow-500 ring-2 ring-yellow-200': filters.status === 'queued' }"
          @click="filterByStatus('queued')"
        >
          <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {{ queueStatus?.queue?.queued || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Queued</div>
        </div>
        <div
          class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors border-2"
          :class="{ 'border-green-500 ring-2 ring-green-200': filters.status === 'active' }"
          @click="filterByStatus('active')"
        >
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ queueStatus?.queue?.active || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Active</div>
        </div>
        <div
          class="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors border-2"
          :class="{ 'border-purple-500 ring-2 ring-purple-200': filters.status === 'completed' }"
          @click="filterByStatus('completed')"
        >
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ queueStatus?.queue?.completed || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Completed</div>
        </div>
        <div
          class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border-2"
          :class="{ 'border-red-500 ring-2 ring-red-200': filters.status === 'failed' }"
          @click="filterByStatus('failed')"
        >
          <div class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ queueStatus?.queue?.failed || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Failed</div>
        </div>
      </div>

      <div v-if="queueStatus?.queue?.is_paused" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div class="flex items-center">
          <UIcon name="i-heroicons-pause-circle" class="w-5 h-5 text-red-500 mr-2" />
          <span class="text-red-700 dark:text-red-300 font-medium">Queue is paused</span>
        </div>
      </div>
    </UCard>

    <!-- Search and Filters -->
    <UCard class="mb-6">
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Search & Filter
        </h3>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Job ID
          </label>
          <UInput
            v-model="filters.jobId"
            placeholder="Search by job ID..."
            @input="debouncedSearch"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Status
          </label>
          <USelectMenu
            v-model="filters.status"
            :items="statusOptions"
            placeholder="All statuses"
            @change="applyFilters"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Job Type
          </label>
          <USelectMenu
            v-model="filters.jobType"
            :items="jobTypeOptions"
            placeholder="All types"
            @change="applyFilters"
          />
        </div>
      </div>

      <div class="mt-4 flex gap-2">
        <UButton variant="outline" size="sm" @click="clearFilters">
          Clear Filters
        </UButton>
        <UButton :loading="isLoading" size="sm" @click="refreshData">
          Apply Filters
        </UButton>
      </div>
    </UCard>

    <!-- Jobs List -->
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Jobs ({{ filteredJobs.length }})
        </h3>
      </template>

      <div v-if="isLoading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
      </div>

      <div v-else-if="filteredJobs.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
        No jobs found
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="job in paginatedJobs"
          :key="job.id"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center space-x-3">
              <UBadge
                :color="getStatusColor(job.status)"
                variant="subtle"
                size="sm"
              >
                {{ job.status }}
              </UBadge>
              <span class="font-mono text-sm text-gray-600 dark:text-gray-400">
                {{ job.id }}
              </span>
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              {{ formatDate(job.created_at) }}
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span class="font-medium text-gray-700 dark:text-gray-300">Type:</span>
              <span class="ml-2 text-gray-600 dark:text-gray-400">{{ job.job_type }}</span>
            </div>
            <div>
              <span class="font-medium text-gray-700 dark:text-gray-300">Progress:</span>
              <span class="ml-2 text-gray-600 dark:text-gray-400">{{ job.progress || 0 }}%</span>
            </div>
            <div>
              <span class="font-medium text-gray-700 dark:text-gray-300">Source UUID:</span>
              <span class="ml-2 font-mono text-xs text-gray-600 dark:text-gray-400">{{ job.source_media_uuid }}</span>
            </div>
            <div v-if="job.output_uuid">
              <span class="font-medium text-gray-700 dark:text-gray-300">Output UUID:</span>
              <span class="ml-2 font-mono text-xs text-gray-600 dark:text-gray-400">{{ job.output_uuid }}</span>
            </div>
          </div>

          <div v-if="job.error_message" class="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
            <strong>Error:</strong> {{ job.error_message }}
          </div>

          <div v-if="job.progress && job.progress > 0 && job.progress < 100" class="mt-3">
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                :style="{ width: `${job.progress}%` }"
              />
            </div>
          </div>

          <div class="mt-3 flex gap-2">
            <UButton size="xs" variant="outline" @click="viewJobDetails(job.id)">
              View Details
            </UButton>
            <UButton
              v-if="job.output_uuid"
              size="xs"
              color="green"
              variant="outline"
              @click="viewOutput(job.output_uuid)"
            >
              View Output
            </UButton>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-6 flex justify-center">
        <UPagination
          v-model="currentPage"
          :page-count="itemsPerPage"
          :total="filteredJobs.length"
          :max="5"
        />
      </div>
    </UCard>

    <!-- Job Details Modal -->
    <UModal v-model="showJobModal">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Job Details</h3>
          </template>

          <div v-if="selectedJob" class="space-y-4">
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="font-medium">ID:</span>
                <span class="ml-2 font-mono">{{ selectedJob.id }}</span>
              </div>
              <div>
                <span class="font-medium">Status:</span>
                <UBadge :color="getStatusColor(selectedJob.status)" class="ml-2">
                  {{ selectedJob.status }}
                </UBadge>
              </div>
              <div>
                <span class="font-medium">Type:</span>
                <span class="ml-2">{{ selectedJob.job_type }}</span>
              </div>
              <div>
                <span class="font-medium">Progress:</span>
                <span class="ml-2">{{ selectedJob.progress || 0 }}%</span>
              </div>
              <div class="col-span-2">
                <span class="font-medium">Source UUID:</span>
                <span class="ml-2 font-mono text-xs">{{ selectedJob.source_media_uuid }}</span>
              </div>
              <div v-if="selectedJob.output_uuid" class="col-span-2">
                <span class="font-medium">Output UUID:</span>
                <span class="ml-2 font-mono text-xs">{{ selectedJob.output_uuid }}</span>
              </div>
              <div class="col-span-2">
                <span class="font-medium">Created:</span>
                <span class="ml-2">{{ formatDate(selectedJob.created_at) }}</span>
              </div>
              <div v-if="selectedJob.completed_at" class="col-span-2">
                <span class="font-medium">Completed:</span>
                <span class="ml-2">{{ formatDate(selectedJob.completed_at) }}</span>
              </div>
            </div>

            <div v-if="selectedJob.parameters" class="mt-4">
              <span class="font-medium">Parameters:</span>
              <pre class="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">{{ JSON.stringify(selectedJob.parameters, null, 2) }}</pre>
            </div>

            <div v-if="selectedJob.error_message" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
              <span class="font-medium text-red-700 dark:text-red-300">Error:</span>
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{{ selectedJob.error_message }}</p>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end">
              <UButton variant="outline" @click="showJobModal = false">
                Close
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup>
// Page metadata
definePageMeta({
  title: 'Jobs'
})

// Reactive data
const queueStatus = ref(null)
const jobs = ref([])
const isLoading = ref(false)
const showJobModal = ref(false)
const selectedJob = ref(null)

// Filters
const filters = ref({
  jobId: '',
  status: '',
  jobType: ''
})

// Pagination
const currentPage = ref(1)
const itemsPerPage = 10

// Filter options
const statusOptions = [
  { label: 'All Statuses', value: '' },
  { label: 'Queued', value: 'queued' },
  { label: 'Running', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' }
]

const jobTypeOptions = [
  { label: 'All Types', value: '' },
  { label: 'Video Processing', value: 'video_processing' },
  { label: 'Face Swap', value: 'vid_faceswap' },
  { label: 'Face Swap Test', value: 'vid_faceswap_test_source' }
]

// Computed properties
const filteredJobs = computed(() => {
  // Since we're doing server-side filtering, just return the jobs
  return jobs.value
})

const totalPages = computed(() => Math.ceil(filteredJobs.value.length / itemsPerPage))

const paginatedJobs = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return filteredJobs.value.slice(start, end)
})

// Methods
const fetchAllData = async () => {
  try {
    console.log('🚀 Starting fetchAllData...')
    const startTime = Date.now()
    
    // First get queue status for the status cards
    console.log('📊 Fetching queue status...')
    const queueStartTime = Date.now()
    const queueResponse = await $fetch('/api/jobs')
    console.log(`✅ Queue status fetched in ${Date.now() - queueStartTime}ms`)
    queueStatus.value = queueResponse
    
    // Then get job details with any filters applied
    console.log('🔍 Fetching jobs search...')
    const searchStartTime = Date.now()
    const searchParams = new URLSearchParams()
    if (filters.value.status) searchParams.append('status', filters.value.status)
    if (filters.value.jobType) searchParams.append('job_type', filters.value.jobType)
    if (filters.value.jobId) searchParams.append('source_media_uuid', filters.value.jobId)
    searchParams.append('limit', '100') // Get more jobs for better filtering
    
    console.log(`🌐 Calling: /api/jobs/search?${searchParams.toString()}`)
    const jobsResponse = await $fetch(`/api/jobs/search?${searchParams.toString()}`)
    console.log(`✅ Jobs search fetched in ${Date.now() - searchStartTime}ms`)
    
    // Handle different response formats from the new API
    console.log('🔄 Processing response...')
    const processStartTime = Date.now()
    if (jobsResponse.results) {
      jobs.value = jobsResponse.results
    } else if (jobsResponse.jobs) {
      jobs.value = jobsResponse.jobs
    } else if (Array.isArray(jobsResponse)) {
      jobs.value = jobsResponse
    } else {
      jobs.value = []
    }
    console.log(`✅ Response processed in ${Date.now() - processStartTime}ms`)
    console.log(`🎉 Total fetchAllData completed in ${Date.now() - startTime}ms`)
  } catch (error) {
    console.error('❌ Failed to fetch data:', error)
    // Initialize with empty data on error
    queueStatus.value = {
      queue: {
        total: 0,
        queued: 0,
        active: 0,
        completed: 0,
        failed: 0,
        is_paused: false
      }
    }
    jobs.value = []
  }
}

const refreshData = async () => {
  isLoading.value = true
  try {
    await fetchAllData()
  } finally {
    isLoading.value = false
  }
}

const applyFilters = async () => {
  currentPage.value = 1
  isLoading.value = true
  try {
    // Only fetch jobs when applying filters, keep existing queue status
    const searchParams = new URLSearchParams()
    if (filters.value.status) searchParams.append('status', filters.value.status)
    if (filters.value.jobType) searchParams.append('job_type', filters.value.jobType)
    if (filters.value.jobId) searchParams.append('source_media_uuid', filters.value.jobId)
    searchParams.append('limit', '100')
    
    const response = await $fetch(`/api/jobs/search?${searchParams.toString()}`)
    
    if (response.results) {
      jobs.value = response.results
    } else if (response.jobs) {
      jobs.value = response.jobs
    } else if (Array.isArray(response)) {
      jobs.value = response
    } else {
      jobs.value = []
    }
  } catch (error) {
    console.error('Failed to fetch jobs:', error)
    jobs.value = []
  } finally {
    isLoading.value = false
  }
}

const clearFilters = async () => {
  filters.value = {
    jobId: '',
    status: '',
    jobType: ''
  }
  currentPage.value = 1
  await applyFilters()
}

const debouncedSearch = debounce(() => {
  applyFilters()
}, 300)

// Debounce function
function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

const viewJobDetails = async (jobId) => {
  try {
    const response = await $fetch(`/api/jobs/${jobId}`)
    selectedJob.value = response.job
    showJobModal.value = true
  } catch (error) {
    console.error('Failed to fetch job details:', error)
  }
}

const viewOutput = (outputUuid) => {
  // Navigate to media gallery with the output UUID
  navigateTo(`/media-gallery?uuid=${outputUuid}`)
}

const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'queued': return 'yellow'
    case 'active': return 'blue'
    case 'completed': return 'green'
    case 'failed': return 'red'
    case 'cancelled': return 'gray'
    default: return 'gray'
  }
}

const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString()
}

const filterByStatus = async (status) => {
  // Prevent double execution by checking if we're already loading
  if (isLoading.value) return
  
  filters.value.status = status
  currentPage.value = 1
  // Clear other filters when clicking status cards for cleaner filtering
  filters.value.jobId = ''
  filters.value.jobType = ''
  
  // Trigger job search with the new filter
  await applyFilters()
}

// Lifecycle
onMounted(() => {
  refreshData()
})


// Page head
useHead({
  title: 'Jobs - Media Server Job System',
  meta: [
    { name: 'description', content: 'Monitor and manage video processing jobs' }
  ]
})
</script>