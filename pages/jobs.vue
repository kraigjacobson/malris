<template>
  <div class="container mx-auto p-3 sm:p-6">
    <div class="mb-4 sm:mb-8">
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
        Job Queue
      </h1>
      <p class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
        Monitor and manage processing jobs
      </p>
    </div>

    <!-- Queue Status Card -->
    <UCard class="mb-3 sm:mb-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            Queue Status
          </h2>
          <div class="flex items-center gap-1 sm:gap-2">
            <USwitch
              v-model="jobsStore.autoRefreshEnabled"
              :disabled="jobsStore.isLoading"
              @update:model-value="(value) => jobsStore.toggleAutoRefresh(value)"
            />
            <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1 hidden sm:flex">
              Auto-refresh {{ jobsStore.autoRefreshEnabled ? 'ON' : 'OFF' }}
            </span>
            <UButton
              type="button"
              size="xs"
              variant="outline"
              @click.prevent="() => jobsStore.refreshJobs(true)"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" :class="{ 'animate-spin': jobsStore.isLoading }" />
              <span class="hidden sm:inline">Refresh</span>
            </UButton>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2 sm:gap-4">
        <div
          class="text-center p-2 sm:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          :class="{ 'border-2 border-blue-500': jobsStore.filters.status === '' }"
          @click="filterByStatus('')"
        >
          <div class="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ jobsStore.queueStatus?.queue?.total || 0 }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Jobs</div>
        </div>
        <div
          class="text-center p-2 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
          :class="{ 'border-2 border-yellow-500': jobsStore.filters.status === 'queued' }"
          @click="filterByStatus('queued')"
        >
          <div class="text-lg sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {{ jobsStore.queueStatus?.queue?.queued || 0 }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Queued</div>
        </div>
        <div
          class="text-center p-2 sm:p-4 bg-green-50 dark:bg-green-900/20 rounded-lg cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          :class="{ 'border-2 border-green-500': jobsStore.filters.status === 'active' }"
          @click="filterByStatus('active')"
        >
          <div class="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
            {{ jobsStore.queueStatus?.queue?.active || 0 }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Active</div>
        </div>
        <div
          class="text-center p-2 sm:p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          :class="{ 'border-2 border-purple-500': jobsStore.filters.status === 'completed' }"
          @click="filterByStatus('completed')"
        >
          <div class="text-lg sm:text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ jobsStore.queueStatus?.queue?.completed || 0 }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Completed</div>
        </div>
        <div
          class="text-center p-2 sm:p-4 bg-red-50 dark:bg-red-900/20 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          :class="{ 'border-2 border-red-500': jobsStore.filters.status === 'failed' }"
          @click="filterByStatus('failed')"
        >
          <div class="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400">
            {{ jobsStore.queueStatus?.queue?.failed || 0 }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Failed</div>
        </div>
        <div
          class="text-center p-2 sm:p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          :class="{ 'border-2 border-orange-500': jobsStore.filters.status === 'need_input' }"
          @click="filterByStatus('need_input')"
        >
          <div class="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400">
            {{ jobsStore.queueStatus?.queue?.need_input || 0 }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Needs Input</div>
        </div>
        <div
          class="text-center p-2 sm:p-4 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          :class="{ 'border-2 border-gray-500': jobsStore.filters.status === 'canceled' }"
          @click="filterByStatus('canceled')"
        >
          <div class="text-lg sm:text-2xl font-bold text-gray-700 dark:text-gray-300">
            {{ jobsStore.queueStatus?.queue?.canceled || 0 }}
          </div>
          <div class="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Canceled</div>
        </div>
      </div>

      <div v-if="jobsStore.queueStatus?.queue?.is_paused" class="mt-2 sm:mt-4 p-2 sm:p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div class="flex items-center">
          <UIcon name="i-heroicons-pause-circle" class="w-5 h-5 text-red-500 mr-2" />
          <span class="text-red-700 dark:text-red-300 font-medium">Queue is paused</span>
        </div>
      </div>
    </UCard>

    <!-- Subject Filter -->
    <UCard class="mb-3 sm:mb-6">
      <template #header>
        <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
          Filter by Subject
        </h3>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
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
          <p class="text-xs text-gray-500 mt-1 hidden sm:block">Filter jobs by the subject they were created for</p>
        </div>
        
        <div class="flex items-end">
          <UButton
            type="button"
            variant="outline"
            size="xs"
            @click="clearSubjectFilter"
            :disabled="!selectedSubjectFilter"
          >
            <span class="hidden sm:inline">Clear Subject Filter</span>
            <span class="sm:hidden">Clear</span>
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Jobs List -->
    <UCard>
      <template #header>
        <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
          Jobs ({{ displayedJobs.length }})
        </h3>
      </template>

      <div v-if="jobsStore.jobs.length === 0 && !jobsStore.isLoading" class="text-center py-8 text-gray-500 dark:text-gray-400">
        No jobs found
      </div>

      <div v-else-if="jobsStore.jobs.length === 0 && jobsStore.isLoading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
      </div>

      <div v-else class="h-80 sm:h-96 overflow-y-auto space-y-1 sm:space-y-2 pr-1 sm:pr-2">
        <div
          v-for="job in displayedJobs"
          :key="job.id"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          @click="viewJobDetails(job.id)"
        >
          <!-- Main job info row -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-1 sm:space-x-3 min-w-0 flex-1">
              <UBadge
                :color="getStatusColor(job.status)"
                variant="solid"
                size="xs"
              >
                {{ job.status }}
              </UBadge>
              <span class="text-xs text-gray-600 dark:text-gray-400 truncate hidden sm:inline">
                {{ job.subject?.name || 'Unknown Subject' }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-500 hidden sm:inline">
                {{ job.job_type }}
              </span>
              <div v-if="job.progress && job.progress > 0 && job.progress < 100" class="flex items-center space-x-1 sm:space-x-2">
                <div class="w-12 sm:w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <div
                    class="bg-blue-600 h-1 rounded-full transition-all duration-300"
                    :style="{ width: `${job.progress}%` }"
                  />
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ job.progress }}%</span>
              </div>
            </div>
            
            <div class="flex items-center space-x-1 sm:space-x-2 shrink-0">
              <span class="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                {{ formatDateCompact(job.created_at) }}
              </span>
              <div class="flex gap-1">
                <UButton
                  v-if="job.status === 'need_input'"
                  size="xs"
                  color="warning"
                  variant="outline"
                  @click.stop="openImageSelection(job)"
                >
                  <span class="hidden sm:inline">Select Source Image</span>
                  <span class="sm:hidden">Select</span>
                </UButton>
                <UButton
                  v-if="['queued', 'active'].includes(job.status)"
                  size="xs"
                  color="error"
                  variant="outline"
                  @click.stop="cancelJob(job)"
                >
                  Cancel
                </UButton>
                <UDropdownMenu
                  :items="getJobActions(job)"
                  :ui="{ content: 'w-48' }"
                >
                  <UButton
                    size="2xs"
                    color="gray"
                    variant="ghost"
                    class="ml-2"
                    @click.stop
                    icon="i-heroicons-ellipsis-horizontal"
                  />
                </UDropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-3 sm:mt-6 flex justify-center">
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
            <!-- Thumbnails Section -->
            <div class="space-y-3">
              <h4 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Media Thumbnails</h4>
              <div class="flex flex-wrap gap-2 sm:gap-4 justify-center sm:justify-start">
                <!-- Subject Thumbnail -->
                <div v-if="selectedJob.subject_thumbnail" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
                  <div class="mb-1 sm:mb-2 text-center">
                    <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Subject</span>
                  </div>
                  <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4]">
                    <img
                      :src="`data:image/jpeg;base64,${selectedJob.subject_thumbnail}`"
                      alt="Subject thumbnail"
                      class="w-full h-full object-cover"
                    />
                  </div>
                </div>
                
                <!-- Destination Media Thumbnail -->
                <div v-if="selectedJob.dest_media_thumbnail" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
                  <div class="mb-1 sm:mb-2 text-center">
                    <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Destination</span>
                  </div>
                  <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4]">
                    <img
                      :src="`data:image/jpeg;base64,${selectedJob.dest_media_thumbnail}`"
                      alt="Destination media thumbnail"
                      class="w-full h-full object-cover"
                    />
                  </div>
                </div>
                
                <!-- Output Thumbnail/Video -->
                <div v-if="selectedJob.output_thumbnail || (selectedJob.status === 'completed' && selectedJob.output_uuid)" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
                  <div class="mb-1 sm:mb-2 text-center">
                    <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Output</span>
                  </div>
                  <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4] relative group">
                    <!-- Show thumbnail first, then replace with video when ready -->
                    <img
                      v-if="selectedJob.output_thumbnail && (!selectedJob.output_uuid || selectedJob.status !== 'completed' || !outputVideoReady)"
                      :src="`data:image/jpeg;base64,${selectedJob.output_thumbnail}`"
                      alt="Output thumbnail"
                      class="w-full h-full object-cover"
                    />
                    <!-- Video player for completed jobs -->
                    <video
                      v-if="selectedJob.status === 'completed' && selectedJob.output_uuid"
                      :src="`/api/stream/${selectedJob.output_uuid}`"
                      autoplay
                      loop
                      muted
                      class="w-full h-full object-cover group-hover:[&::-webkit-media-controls]:opacity-100 [&::-webkit-media-controls]:opacity-0 [&::-webkit-media-controls]:transition-opacity"
                      preload="metadata"
                      controls
                      @loadeddata="outputVideoReady = true"
                      @error="outputVideoReady = false"
                    >
                      <source :src="`/api/stream/${selectedJob.output_uuid}`" type="video/mp4">
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </div>
              </div>
            </div>

            <!-- Job Details Accordion -->
            <div class="mt-4">
              <UAccordion :items="jobDetailsAccordionItems">
                <template #job-details>
                  <div class="space-y-3 text-left">
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ID</span>
                      <span class="text-sm font-mono text-gray-600 dark:text-gray-400">{{ selectedJob.id }}</span>
                    </div>
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                      <UBadge :color="getStatusColor(selectedJob.status)" size="sm">
                        {{ selectedJob.status }}
                      </UBadge>
                    </div>
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ selectedJob.job_type }}</span>
                    </div>
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Progress</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ selectedJob.progress || 0 }}%</span>
                    </div>
                    <div v-if="selectedJob.source_media_uuid" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Source UUID</span>
                      <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedJob.source_media_uuid }}</span>
                    </div>
                    <div v-if="selectedJob.dest_media_uuid" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Destination UUID</span>
                      <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedJob.dest_media_uuid }}</span>
                    </div>
                    <div v-if="selectedJob.subject_uuid" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Subject UUID</span>
                      <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedJob.subject_uuid }}</span>
                    </div>
                    <div v-if="selectedJob.output_uuid" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Output UUID</span>
                      <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedJob.output_uuid }}</span>
                    </div>
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Created</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(selectedJob.created_at) }}</span>
                    </div>
                    <div v-if="selectedJob.completed_at" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Completed</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(selectedJob.completed_at) }}</span>
                    </div>
                  </div>
                </template>
              </UAccordion>
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
const outputVideoReady = ref(false)

// Job details accordion items
const jobDetailsAccordionItems = computed(() => {
  return [{
    label: 'Job Details',
    slot: 'job-details'
  }]
})

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
  } else {
    clearSubjectFilter()
  }
}

const clearSubjectFilter = () => {
  clearSubject()
  currentFilter.value = ''
  currentPage.value = 1
}

// Computed properties
const totalPages = computed(() => Math.ceil(jobsStore.jobs.length / itemsPerPage))



// Methods
const filterByStatus = async (status) => {
  
  // Update local filter immediately
  currentFilter.value = status
  currentPage.value = 1
  
  // Also update store for UI consistency
  jobsStore.filters.status = status
  jobsStore.filters.jobId = ''
  jobsStore.filters.jobType = ''
  
  // Force Vue to update immediately
  await nextTick()
}


const viewJobDetails = async (jobId) => {
  try {
    // Reset video ready state when opening a new job
    outputVideoReady.value = false
    
    const response = await useApiFetch(`jobs/${jobId}?include_thumbnails=true&thumbnail_size=md`)
    selectedJob.value = response.job  // The media server returns {success: true, job: {...}}
    showJobModal.value = true
  } catch (error) {
    console.error('Failed to fetch job details:', error)
  }
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

// Get job actions for dropdown menu
const getJobActions = (job) => {
  const actions = []
  
  // Add retry option for failed, canceled, or completed jobs
  if (['canceled', 'failed', 'completed'].includes(job.status)) {
    actions.push({
      label: 'Retry Job',
      icon: 'i-heroicons-arrow-path',
      onSelect: async () => {
        await retryJob(job)
      }
    })
  }
  
  // Always add delete option
  actions.push({
    label: 'Delete Job',
    icon: 'i-heroicons-trash',
    onSelect: async () => {
      await deleteJob(job)
    }
  })
  
  return [actions]
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
    const { confirm } = useConfirmDialog()
    
    const confirmed = await confirm({
      title: 'Cancel Job',
      message: `Are you sure you want to cancel job ${job.id}? This action cannot be undone.`,
      confirmLabel: 'Cancel Job',
      cancelLabel: 'Keep Job',
      variant: 'error'
    })
    
    if (!confirmed) return
    
    
    await useApiFetch(`jobs/${job.id}/cancel`, {
      method: 'POST'
    })
    
    
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
    
    // Use confirm dialog for error messages too
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: errorMessage,
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

// Job retry method
const retryJob = async (job) => {
  try {
    const { confirm } = useConfirmDialog()
    
    const confirmed = await confirm({
      title: 'Retry Job',
      message: `Are you sure you want to retry job ${job.id}? This will create a new job with the same parameters.`,
      confirmLabel: 'Retry Job',
      cancelLabel: 'Cancel',
      variant: 'primary'
    })
    
    if (!confirmed) return
    
    
    const response = await useApiFetch(`jobs/${job.id}/retry`, {
      method: 'POST'
    })
    
    // Show success toast with new job ID
    const toast = useToast()
    toast.add({
      title: 'Job Retried Successfully',
      description: `New job ID: ${response.job_id}`,
      color: 'success',
      duration: 2000
    })
    
    // Refresh the jobs list after retry
    await jobsStore.refreshJobs()
  } catch (error) {
    console.error('Failed to retry job:', error)
    
    let errorMessage = 'Failed to retry job'
    if (error.data?.statusMessage) {
      errorMessage = error.data.statusMessage
    } else if (error.message) {
      errorMessage = error.message
    }
    
    // Use confirm dialog for error messages
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: errorMessage,
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

// Job deletion method
const deleteJob = async (job) => {
  try {
    const { confirm } = useConfirmDialog()
    
    const confirmed = await confirm({
      title: 'Delete Job',
      message: `Are you sure you want to delete job ${job.id}? This action cannot be undone and will remove the job and any associated output media.`,
      confirmLabel: 'Delete Job',
      cancelLabel: 'Cancel',
      variant: 'error'
    })
    
    if (!confirmed) return
    
    await useApiFetch(`jobs/${job.id}/delete`, {
      method: 'DELETE'
    })
    
    // Show success toast
    const toast = useToast()
    toast.add({
      title: 'Job Deleted Successfully',
      description: `Job ${job.id} has been deleted successfully.`,
      color: 'success',
      duration: 1000
    })
    
    // Refresh the jobs list after deletion
    await jobsStore.refreshJobs()
  } catch (error) {
    console.error('Failed to delete job:', error)
    
    let errorMessage = 'Failed to delete job'
    if (error.data?.statusMessage) {
      errorMessage = error.data.statusMessage
    } else if (error.message) {
      errorMessage = error.message
    }
    
    // Use confirm dialog for error messages
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: errorMessage,
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
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
}, { immediate: true })

// Reset video state when modal is closed
watch(showJobModal, (isOpen) => {
  if (!isOpen) {
    outputVideoReady.value = false
  }
})

// Lifecycle
onMounted(() => {
  jobsStore.fetchInitialData()
  
  // Load subjects for filtering
  _loadSubjects()
  
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