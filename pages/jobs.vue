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
          <div class="flex items-center gap-2">
            <USwitch
              v-model="jobsStore.autoRefreshEnabled"
              :disabled="jobsStore.isLoading"
              @update:model-value="jobsStore.toggleAutoRefresh"
            />
            <span class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
              Auto-refresh {{ jobsStore.autoRefreshEnabled ? 'ON' : 'OFF' }}
            </span>
            <UButton 
              type="button" 
              size="sm" 
              variant="outline" 
              @click.prevent="() => jobsStore.refreshJobs(true)"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-2" :class="{ 'animate-spin': jobsStore.isLoading }" />
              Refresh
            </UButton>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-7 gap-4">
        <div
          class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          :class="{ 'border-2 border-blue-500': jobsStore.filters.status === '' }"
          @click="filterByStatus('')"
        >
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ jobsStore.queueStatus?.queue?.total || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Jobs</div>
        </div>
        <div
          class="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
          :class="{ 'border-2 border-yellow-500': jobsStore.filters.status === 'queued' }"
          @click="filterByStatus('queued')"
        >
          <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {{ jobsStore.queueStatus?.queue?.queued || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Queued</div>
        </div>
        <div
          class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          :class="{ 'border-2 border-green-500': jobsStore.filters.status === 'active' }"
          @click="filterByStatus('active')"
        >
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ jobsStore.queueStatus?.queue?.active || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Active</div>
        </div>
        <div
          class="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          :class="{ 'border-2 border-purple-500': jobsStore.filters.status === 'completed' }"
          @click="filterByStatus('completed')"
        >
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ jobsStore.queueStatus?.queue?.completed || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Completed</div>
        </div>
        <div
          class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          :class="{ 'border-2 border-red-500': jobsStore.filters.status === 'failed' }"
          @click="filterByStatus('failed')"
        >
          <div class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ jobsStore.queueStatus?.queue?.failed || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Failed</div>
        </div>
        <div
          class="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          :class="{ 'border-2 border-orange-500': jobsStore.filters.status === 'need_input' }"
          @click="filterByStatus('need_input')"
        >
          <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {{ jobsStore.queueStatus?.queue?.need_input || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Needs Input</div>
        </div>
        <div
          class="text-center p-4 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          :class="{ 'border-2 border-gray-500': jobsStore.filters.status === 'cancelled' }"
          @click="filterByStatus('cancelled')"
        >
          <div class="text-2xl font-bold text-gray-700 dark:text-gray-300">
            {{ jobsStore.queueStatus?.queue?.cancelled || 0 }}
          </div>
          <div class="text-sm text-gray-700 dark:text-gray-300">Cancelled</div>
        </div>
      </div>

      <div v-if="jobsStore.queueStatus?.queue?.is_paused" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div class="flex items-center">
          <UIcon name="i-heroicons-pause-circle" class="w-5 h-5 text-red-500 mr-2" />
          <span class="text-red-700 dark:text-red-300 font-medium">Queue is paused</span>
        </div>
      </div>
    </UCard>

    <!-- Subject Filter -->
    <UCard class="mb-6">
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Filter by Subject
        </h3>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Subject
          </label>
          <UInputMenu
            v-model="selectedSubjectFilter"
            v-model:search-term="subjectSearchQuery"
            :items="subjectFilterItems"
            placeholder="Search for a subject to filter jobs..."
            class="w-full"
            by="value"
            option-attribute="label"
            searchable
            @update:model-value="handleSubjectFilterSelection"
          />
          <p class="text-xs text-gray-500 mt-1">Filter jobs by the subject they were created for</p>
        </div>
        
        <div class="flex items-end">
          <UButton
            type="button"
            variant="outline"
            size="sm"
            @click="clearSubjectFilter"
            :disabled="!selectedSubjectFilter"
          >
            Clear Subject Filter
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Jobs List -->
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Jobs ({{ jobsStore.jobs.length }})
        </h3>
      </template>

      <div v-if="jobsStore.jobs.length === 0 && !jobsStore.isLoading" class="text-center py-8 text-gray-500 dark:text-gray-400">
        No jobs found
      </div>

      <div v-else-if="jobsStore.jobs.length === 0 && jobsStore.isLoading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
      </div>

      <div v-else class="h-96 overflow-y-auto space-y-2 pr-2">
        <div
          v-for="job in displayedJobs"
          :key="job.id"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          @click="viewJobDetails(job.id)"
        >
          <!-- Main job info row -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3 min-w-0 flex-1">
              <UBadge
                :color="getStatusColor(job.status)"
                variant="solid"
                size="sm"
              >
                {{ job.status }}
              </UBadge>
              <span class="font-mono text-xs text-gray-600 dark:text-gray-400 truncate">
                {{ job.id }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-500">
                {{ job.job_type }}
              </span>
              <div v-if="job.progress && job.progress > 0 && job.progress < 100" class="flex items-center space-x-2">
                <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <div
                    class="bg-blue-600 h-1 rounded-full transition-all duration-300"
                    :style="{ width: `${job.progress}%` }"
                  />
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ job.progress }}%</span>
              </div>
            </div>
            
            <div class="flex items-center space-x-2 flex-shrink-0">
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDateCompact(job.created_at) }}
              </span>
              <div class="flex gap-1">
                <UButton
                  v-if="job.output_uuid"
                  size="2xs"
                  color="green"
                  variant="ghost"
                  @click.stop="viewOutput(job.output_uuid)"
                >
                  <UIcon name="i-heroicons-play" class="w-3 h-3" />
                </UButton>
                <UButton
                  v-if="job.status === 'need_input'"
                  size="sm"
                  color="warning"
                  variant="outline"
                  @click.stop="openImageSelection(job)"
                >
                  Select Source Image
                </UButton>
                <UButton
                  v-if="['queued', 'active'].includes(job.status)"
                  size="sm"
                  color="red"
                  variant="outline"
                  @click.stop="cancelJob(job)"
                >
                  Cancel
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-6 flex justify-center">
        <UPagination
          v-model="currentPage"
          :page-count="itemsPerPage"
          :total="jobsStore.jobs.length"
          :max="5"
        />
      </div>
    </UCard>

    <!-- Job Details Modal -->
    <UModal v-model:open="showJobModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Job Details</h3>
              <UButton
                variant="ghost"
                icon="i-heroicons-x-mark"
                @click="showJobModal = false"
              />
            </div>
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

    <!-- Source Image Selection Modal -->
    <SourceImageSelectionModal
      v-model="showImageModal"
      :job="selectedJobForImage"
      @image-selected="handleImageSelected"
    />
  </div>
</template>

<script setup>
// Page metadata
definePageMeta({
  title: 'Jobs'
})

// Use the jobs store
const jobsStore = useJobsStore()

// Local modal state
const showJobModal = ref(false)
const selectedJob = ref(null)

// Image selection modal data
const showImageModal = ref(false)
const selectedJobForImage = ref(null)

// Pagination
const currentPage = ref(1)
const itemsPerPage = 20

// Local reactive filter state
const currentFilter = ref('')
const displayedJobs = ref([])

// Subject filtering using composable
const {
  selectedSubject: selectedSubjectFilter,
  searchQuery: subjectSearchQuery,
  subjectItems: subjectFilterItems,
  loadSubjects: _loadSubjects,
  handleSubjectSelection,
  clearSubject
} = useSubjects()

// Subject filter handlers
const handleSubjectFilterSelection = (selected) => {
  handleSubjectSelection(selected)
  if (selected && selected.value) {
    // Filter jobs by subject UUID
    currentFilter.value = `subject:${selected.value}`
    currentPage.value = 1
    console.log('🎯 Filtering jobs by subject:', selected.label, selected.value)
  } else {
    clearSubjectFilter()
  }
}

const clearSubjectFilter = () => {
  clearSubject()
  currentFilter.value = ''
  currentPage.value = 1
  console.log('🧹 Cleared subject filter')
}

// Computed properties
const totalPages = computed(() => Math.ceil(jobsStore.jobs.length / itemsPerPage))



// Methods
const filterByStatus = async (status) => {
  console.log(`🖱️ Filter button clicked: status = '${status}'`)
  console.log('📊 jobs count:', jobsStore.jobs?.length || 0)
  console.log('📊 Sample job statuses:', jobsStore.jobs?.slice(0, 3).map(j => j.status) || [])
  
  // Update local filter immediately
  currentFilter.value = status
  currentPage.value = 1
  
  // Also update store for UI consistency
  jobsStore.filters.status = status
  jobsStore.filters.jobId = ''
  jobsStore.filters.jobType = ''
  
  // Force Vue to update immediately
  await nextTick()
  
  console.log('📋 Updated local filter:', currentFilter.value)
  console.log('🔍 Jobs that should show:', jobsStore.jobs?.filter(j => !status || j.status === status).length || 0)
  console.log('✅ Filter applied instantly')
}


const viewJobDetails = async (jobId) => {
  try {
    const response = await useAuthFetch(`jobs/${jobId}`)
    selectedJob.value = response.job
    showJobModal.value = true
  } catch (error) {
    console.error('Failed to fetch job details:', error)
  }
}

const viewOutput = (outputUuid) => {
  navigateTo(`/media-gallery?uuid=${outputUuid}`)
}

const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'queued': return 'warning'
    case 'active': return 'info'
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'cancelled': return 'neutral'
    case 'need_input': return 'warning'
    default: return 'neutral'
  }
}

const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString()
}

const formatDateCompact = (dateString) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(date)
}

// Image selection methods
const openImageSelection = (job) => {
  selectedJobForImage.value = job
  showImageModal.value = true
}

const handleImageSelected = async () => {
  await jobsStore.refreshJobs()
}

// Job cancellation method
const cancelJob = async (job) => {
  try {
    const confirmed = confirm(`Are you sure you want to cancel job ${job.id}?`)
    if (!confirmed) return
    
    console.log(`Cancelling job ${job.id}...`)
    
    const response = await useAuthFetch(`jobs/${job.id}/cancel`, {
      method: 'POST'
    })
    
    console.log('Job cancelled successfully:', response)
    
    // Refresh the jobs list after cancellation
    await jobsStore.refreshJobs()
  } catch (error) {
    console.error('Failed to cancel job:', error)
    
    let errorMessage = 'Failed to cancel job'
    if (error.data?.statusMessage) {
      errorMessage = error.data.statusMessage
    } else if (error.message) {
      errorMessage = error.message
    }
    
    alert(`Error: ${errorMessage}`)
  }
}

// Handle page visibility changes
const handleVisibilityChange = () => {
  if (document.hidden) {
    jobsStore.stopAutoRefresh()
  } else if (jobsStore.autoRefreshEnabled) {
    jobsStore.startAutoRefresh()
  }
}

// Watcher to update displayed jobs immediately
watch([currentFilter, () => jobsStore.jobs], () => {
  console.log('🔄 Watcher triggered - updating displayed jobs')
  if (!currentFilter.value) {
    displayedJobs.value = [...jobsStore.jobs]
  } else if (currentFilter.value.startsWith('subject:')) {
    // Subject filtering
    const subjectUuid = currentFilter.value.replace('subject:', '')
    displayedJobs.value = jobsStore.jobs.filter(job => job.subject_uuid === subjectUuid)
  } else {
    // Status filtering
    displayedJobs.value = jobsStore.jobs.filter(job => job.status === currentFilter.value)
  }
  console.log(`📊 Displayed jobs updated: ${displayedJobs.value.length} jobs`)
}, { immediate: true })

// Lifecycle
onMounted(() => {
  jobsStore.fetchInitialData()
  
  // Load subjects for filtering
  _loadSubjects()
  
  // Start auto-refresh if enabled
  if (jobsStore.autoRefreshEnabled) {
    jobsStore.startAutoRefresh()
  }
  
  // Listen for page visibility changes
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  jobsStore.stopAutoRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// Page head
useHead({
  title: 'Jobs - Media Server Job System',
  meta: [
    { name: 'description', content: 'Monitor and manage video processing jobs' }
  ]
})
</script>