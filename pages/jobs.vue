<template>
  <div class="container mx-auto p-3 sm:p-6">
    <div class="mb-4 sm:mb-8">
      <h1 class="text-md sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
        Jobs
      </h1>
    </div>

    <!-- Queue Status Card -->
    <UCard class="mb-3 sm:mb-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            Queue Status
          </h2>
          <div class="flex items-center gap-1 sm:gap-2">
            <!-- Submit Job Button -->
            <UButton
              type="button"
              size="lg"
              variant="solid"
              color="primary"
              @click="showSubmitJobModal = true"
            >
              <UIcon
                name="i-heroicons-plus"
                class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2"
              />
              <span class="hidden sm:inline">Submit Job</span>
            </UButton>
            
            <!-- Processing Control Buttons -->
            <template v-if="!isAnyProcessingActive">
              <!-- Single Job Processing Button (▶️) -->
              <UButton
                type="button"
                size="lg"
                variant="outline"
                color="primary"
                :loading="isStartingSingle"
                @click.prevent="startSingleProcessing()"
              >
                <UIcon
                  name="i-heroicons-play"
                  class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2"
                />
                <span class="hidden sm:inline">Process One</span>
              </UButton>
              
              <!-- Continuous Processing Button (🔄) -->
              <UButton
                type="button"
                size="lg"
                variant="outline"
                color="primary"
                :loading="isStartingContinuous"
                @click.prevent="startContinuousProcessing()"
              >
                <UIcon
                  name="i-heroicons-arrow-path"
                  class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2"
                />
                <span class="hidden sm:inline">Process All</span>
              </UButton>
            </template>
            
            <!-- Stop Button (⏹️) - shown when any processing is active -->
            <template v-else>
              <UButton
                type="button"
                size="lg"
                variant="outline"
                color="error"
                :loading="isStopping"
                @click.prevent="stopAllProcessing()"
              >
                <UIcon
                  name="i-heroicons-stop"
                  class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2"
                />
                <span class="hidden sm:inline">Stop Processing</span>
              </UButton>
              
              <!-- Processing Mode Indicator -->
              <UBadge
                :color="processingMode === 'single' ? 'primary' : 'blue'"
                variant="soft"
                size="xs"
                class="hidden sm:inline-flex"
              >
                {{ processingMode === 'single' ? 'Processing One' : 'Processing All' }}
              </UBadge>
            </template>
          </div>
        </div>
      </template>

      <!-- Mobile: Compact grid layout with more buttons per row -->
      <div class="grid grid-cols-4 gap-1 sm:hidden">
        <div
          class="text-center p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors relative"
          :class="{
            'border-2 border-blue-500': currentFilter === '',
            'opacity-75': loadingFilter === '' && isLoading
          }"
          @click="filterByStatus('')"
        >
          <UIcon v-if="loadingFilter === '' && isLoading" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin absolute top-1 right-1" />
          <div class="text-sm font-bold text-blue-600 dark:text-blue-400">
            {{ jobsStore.queueStatus?.queue?.total || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Total</div>
        </div>
        <div
          class="text-center p-1.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-md cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors relative"
          :class="{
            'border-2 border-yellow-500': currentFilter === 'queued',
            'opacity-75': loadingFilter === 'queued' && isLoading
          }"
          @click="filterByStatus('queued')"
        >
          <UIcon v-if="loadingFilter === 'queued' && isLoading" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin absolute top-1 right-1" />
          <div class="text-sm font-bold text-yellow-600 dark:text-yellow-400">
            {{ jobsStore.queueStatus?.queue?.queued || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Queue</div>
        </div>
        <div
          class="text-center p-1.5 bg-green-50 dark:bg-green-900/20 rounded-md cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors relative"
          :class="{
            'border-2 border-green-500': currentFilter === 'active',
            'opacity-75': loadingFilter === 'active' && isLoading
          }"
          @click="filterByStatus('active')"
        >
          <UIcon v-if="loadingFilter === 'active' && isLoading" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin absolute top-1 right-1" />
          <div class="text-sm font-bold text-green-600 dark:text-green-400">
            {{ jobsStore.queueStatus?.queue?.active || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Active</div>
        </div>
        <div
          class="text-center p-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-md cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors relative"
          :class="{
            'border-2 border-purple-500': currentFilter === 'completed',
            'opacity-75': loadingFilter === 'completed' && isLoading
          }"
          @click="filterByStatus('completed')"
        >
          <UIcon v-if="loadingFilter === 'completed' && isLoading" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin absolute top-1 right-1" />
          <div class="text-sm font-bold text-purple-600 dark:text-purple-400">
            {{ jobsStore.queueStatus?.queue?.completed || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Done</div>
        </div>
        <div
          class="text-center p-1.5 bg-red-50 dark:bg-red-900/20 rounded-md cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors relative"
          :class="{
            'border-2 border-red-500': currentFilter === 'failed',
            'opacity-75': loadingFilter === 'failed' && isLoading
          }"
          @click="filterByStatus('failed')"
        >
          <UIcon v-if="loadingFilter === 'failed' && isLoading" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin absolute top-1 right-1" />
          <div class="text-sm font-bold text-red-600 dark:text-red-400">
            {{ jobsStore.queueStatus?.queue?.failed || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Failed</div>
        </div>
        <div
          class="text-center p-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-md cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors relative"
          :class="{
            'border-2 border-orange-500': currentFilter === 'need_input',
            'opacity-75': loadingFilter === 'need_input' && isLoading
          }"
          @click="filterByStatus('need_input')"
        >
          <UIcon v-if="loadingFilter === 'need_input' && isLoading" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin absolute top-1 right-1" />
          <div class="text-sm font-bold text-orange-600 dark:text-orange-400">
            {{ jobsStore.queueStatus?.queue?.need_input || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Input</div>
        </div>
        <div
          class="text-center p-1.5 bg-gray-200 dark:bg-gray-700 rounded-md cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors relative"
          :class="{
            'border-2 border-gray-500': currentFilter === 'canceled',
            'opacity-75': loadingFilter === 'canceled' && isLoading
          }"
          @click="filterByStatus('canceled')"
        >
          <UIcon v-if="loadingFilter === 'canceled' && isLoading" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin absolute top-1 right-1" />
          <div class="text-sm font-bold text-gray-700 dark:text-gray-300">
            {{ jobsStore.queueStatus?.queue?.canceled || 0 }}
          </div>
          <div class="text-xs text-gray-700 dark:text-gray-300">Cancel</div>
        </div>
      </div>

      <!-- Desktop: Original grid layout -->
      <div class="hidden sm:grid grid-cols-3 md:grid-cols-7 gap-4">
        <div
          class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors relative"
          :class="{
            'border-2 border-blue-500': currentFilter === '',
            'opacity-75': loadingFilter === '' && isLoading
          }"
          @click="filterByStatus('')"
        >
          <UIcon v-if="loadingFilter === '' && isLoading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin absolute top-2 right-2" />
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ jobsStore.queueStatus?.queue?.total || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Jobs</div>
        </div>
        <div
          class="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors relative"
          :class="{
            'border-2 border-yellow-500': currentFilter === 'queued',
            'opacity-75': loadingFilter === 'queued' && isLoading
          }"
          @click="filterByStatus('queued')"
        >
          <UIcon v-if="loadingFilter === 'queued' && isLoading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin absolute top-2 right-2" />
          <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {{ jobsStore.queueStatus?.queue?.queued || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Queued</div>
        </div>
        <div
          class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors relative"
          :class="{
            'border-2 border-green-500': currentFilter === 'active',
            'opacity-75': loadingFilter === 'active' && isLoading
          }"
          @click="filterByStatus('active')"
        >
          <UIcon v-if="loadingFilter === 'active' && isLoading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin absolute top-2 right-2" />
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ jobsStore.queueStatus?.queue?.active || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Active</div>
        </div>
        <div
          class="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors relative"
          :class="{
            'border-2 border-purple-500': currentFilter === 'completed',
            'opacity-75': loadingFilter === 'completed' && isLoading
          }"
          @click="filterByStatus('completed')"
        >
          <UIcon v-if="loadingFilter === 'completed' && isLoading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin absolute top-2 right-2" />
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ jobsStore.queueStatus?.queue?.completed || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Completed</div>
        </div>
        <div
          class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors relative"
          :class="{
            'border-2 border-red-500': currentFilter === 'failed',
            'opacity-75': loadingFilter === 'failed' && isLoading
          }"
          @click="filterByStatus('failed')"
        >
          <UIcon v-if="loadingFilter === 'failed' && isLoading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin absolute top-2 right-2" />
          <div class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ jobsStore.queueStatus?.queue?.failed || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Failed</div>
        </div>
        <div
          class="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors relative"
          :class="{
            'border-2 border-orange-500': currentFilter === 'need_input',
            'opacity-75': loadingFilter === 'need_input' && isLoading
          }"
          @click="filterByStatus('need_input')"
        >
          <UIcon v-if="loadingFilter === 'need_input' && isLoading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin absolute top-2 right-2" />
          <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {{ jobsStore.queueStatus?.queue?.need_input || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Input</div>
        </div>
        <div
          class="text-center p-4 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors relative"
          :class="{
            'border-2 border-gray-500': currentFilter === 'canceled',
            'opacity-75': loadingFilter === 'canceled' && isLoading
          }"
          @click="filterByStatus('canceled')"
        >
          <UIcon v-if="loadingFilter === 'canceled' && isLoading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin absolute top-2 right-2" />
          <div class="text-2xl font-bold text-gray-700 dark:text-gray-300">
            {{ jobsStore.queueStatus?.queue?.canceled || 0 }}
          </div>
          <div class="text-sm text-gray-700 dark:text-gray-300">Canceled</div>
        </div>
      </div>

      
      <!-- Enhanced System Status Display -->
      <div v-if="jobsStore.systemStatus" class="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <!-- Overall System Health -->
          <div class="flex items-center gap-2">
            <UIcon
              :name="getSystemHealthIcon(jobsStore.systemStatus.systemHealth)"
              :class="getSystemHealthColor(jobsStore.systemStatus.systemHealth)"
              class="w-4 h-4"
            />
            <span class="font-medium">System:</span>
            <span :class="getSystemHealthColor(jobsStore.systemStatus.systemHealth)">
              {{ jobsStore.systemStatus.systemHealth.toUpperCase() }}
            </span>
          </div>
          
          <!-- RunPod Worker Status -->
          <div class="flex items-center gap-2">
            <UIcon
              :name="getWorkerStatusIcon(jobsStore.systemStatus.runpodWorker.status)"
              :class="getWorkerStatusColor(jobsStore.systemStatus.runpodWorker.status)"
              class="w-4 h-4"
            />
            <span class="font-medium">RunPod:</span>
            <span :class="getWorkerStatusColor(jobsStore.systemStatus.runpodWorker.status)">
              {{ jobsStore.systemStatus.runpodWorker.status.toUpperCase() }}
            </span>
          </div>
          
          <!-- ComfyUI Status -->
          <div class="flex items-center gap-2">
            <UIcon
              :name="getWorkerStatusIcon(jobsStore.systemStatus.comfyui.status)"
              :class="getWorkerStatusColor(jobsStore.systemStatus.comfyui.status)"
              class="w-4 h-4"
            />
            <span class="font-medium">ComfyUI:</span>
            <span :class="getWorkerStatusColor(jobsStore.systemStatus.comfyui.status)">
              {{ jobsStore.systemStatus.comfyui.status.toUpperCase() }}
            </span>
          </div>
          
          <!-- ComfyUI Processing Status -->
          <div class="flex items-center gap-2">
            <UIcon
              :name="getProcessingStatusIcon(jobsStore.systemStatus.comfyuiProcessing.status)"
              :class="getProcessingStatusColor(jobsStore.systemStatus.comfyuiProcessing.status)"
              class="w-4 h-4"
            />
            <span class="font-medium">Processing:</span>
            <span :class="getProcessingStatusColor(jobsStore.systemStatus.comfyuiProcessing.status)">
              {{ jobsStore.systemStatus.comfyuiProcessing.status.toUpperCase() }}
            </span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Subject Filter -->
    <UCard class="mb-3 sm:mb-6">

      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <div>
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
        </div>
        
        <div>
          <USelect
            v-model="selectedSourceTypeFilter"
            :items="sourceTypeOptions"
            placeholder="Filter by job type..."
            class="w-full"
            @update:model-value="handleSourceTypeFilterSelection"
          />
        </div>
        
        <div class="flex items-end gap-2">
          <UButton
            type="button"
            variant="outline"
            size="xs"
            :disabled="!selectedSubjectFilter"
            @click="clearSubjectFilter"
          >
            <span class="inline">Clear Subject</span>
          </UButton>
          <UButton
            type="button"
            variant="outline"
            size="xs"
            :disabled="selectedSourceTypeFilter === 'all'"
            @click="clearSourceTypeFilter"
          >
            <span class="inline">Clear Type</span>
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Jobs List -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UCheckbox
              :model-value="allVisibleSelected"
              :indeterminate="hasPartialSelection"
              @update:model-value="toggleSelectAll"
            />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Jobs
              <span v-if="hasSelectedJobs" class="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({{ selectedJobs.size }} selected)
              </span>
            </h3>
          </div>
          
          <!-- Results Limit and Bulk Actions -->
          <div class="flex items-center gap-2">
            <!-- Results Limit Dropdown -->
            <div v-if="!hasSelectedJobs" class="flex items-center gap-2">
              <label class="text-xs font-medium text-gray-600 dark:text-gray-400">
                Results:
              </label>
              <USelectMenu
                v-model="itemsPerPage"
                :items="limitOptions"
                class="w-24"
                size="xs"
                @change="handleLimitChange"
              />
            </div>
            
            <!-- Bulk Actions -->
            <div v-if="hasSelectedJobs" class="flex items-center gap-2">
            <UButton
              size="xs"
              color="primary"
              variant="outline"
              @click="bulkQueue"
            >
              Queue Selected
            </UButton>
            <UButton
              size="xs"
              color="error"
              variant="outline"
              @click="bulkCancel"
            >
              Cancel Selected
            </UButton>
            <UButton
              size="xs"
              color="error"
              variant="outline"
              @click="bulkDelete"
            >
              Delete Selected
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              @click="clearSelection"
            >
              Clear
            </UButton>
            </div>
          </div>
        </div>
      </template>

      <div v-if="jobs.length === 0 && !isLoading" class="text-center py-8 text-gray-500 dark:text-gray-400">
        No jobs found
      </div>

      <div v-else-if="jobs.length === 0 && isLoading" class="flex flex-col items-center justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p class="text-sm text-gray-500 dark:text-gray-400">Loading jobs...</p>
      </div>

      <div v-else class="h-80 sm:h-96 overflow-y-auto space-y-1 sm:space-y-2 pr-1 sm:pr-2">
        <div
          v-for="job in jobs"
          :key="job.id"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative cursor-pointer"
          :class="{ 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600': selectedJobs.has(job.id) }"
          @click="viewJobDetails(job.id)"
        >
          <!-- Main job info row -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-1 sm:space-x-3 min-w-0 flex-1">
              <!-- Checkbox -->
              <UCheckbox
                :model-value="selectedJobs.has(job.id)"
                @update:model-value="(checked) => toggleJobSelection(job.id, checked)"
                @click.stop
              />
              <!-- Time since updated - moved to left side -->
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDateCompact(job.updated_at) }}
              </span>
              <UBadge
                :color="getStatusColor(job.status)"
                variant="solid"
                size="xs"
              >
                {{ getStatusDisplayText(job.status) }}
              </UBadge>
              <span class="text-xs text-gray-600 dark:text-gray-400 truncate">
                {{ job.subject?.name || 'Unknown Subject' }}
              </span>
              <!-- Desktop: Show full text -->
              <span class="text-xs text-gray-500 dark:text-gray-500 hidden sm:inline">
                {{ job.source_media_uuid ? 'vid' : 'source' }}
              </span>
              <!-- Mobile: Show single letter badges -->
              <UBadge
                v-if="job.source_media_uuid"
                color="primary"
                variant="soft"
                size="xs"
                class="sm:hidden"
              >
                V
              </UBadge>
              <UBadge
                v-else
                color="green"
                variant="soft"
                size="xs"
                class="sm:hidden"
              >
                S
              </UBadge>
              <!-- Show progress bar when available (mobile and desktop) -->
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
          </div>
          
          <!-- Full-height button container positioned absolutely -->
          <div class="absolute top-0 right-0 h-full flex items-center">
            <!-- Select button for need_input jobs -->
            <div
              v-if="job.status === 'need_input'"
              class="h-full flex items-center justify-center px-3 bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20 border-l border-gray-200 dark:border-gray-700 cursor-pointer"
              @click.stop="openImageSelectionModal(job)"
            >
              <span class="text-xs text-orange-600 dark:text-orange-400 font-medium">
                <span class="hidden sm:inline">Select</span>
                <span class="sm:hidden">Sel</span>
              </span>
            </div>
            
            <!-- Dropdown menu button -->
            <UDropdownMenu
              :items="getJobActions(job)"
              :ui="{ content: 'w-48' }"
            >
              <div
                class="h-full flex items-center justify-center px-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-l border-gray-200 dark:border-gray-700 rounded-r-lg cursor-pointer"
                :class="{ 'rounded-l-lg': job.status !== 'need_input' }"
                @click.stop
              >
                <UIcon name="i-heroicons-ellipsis-horizontal" class="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
            </UDropdownMenu>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-3 sm:mt-6 flex justify-center">
        <UPagination
          v-model:page="pageNumber"
          :total="totalJobs"
          :items-per-page="itemsPerPage"
          :max="5"
          @update:page="handlePageChange"
        />
      </div>
    </UCard>

    <!-- Job Details Modal -->
    <JobDetailsModal
      v-model="showJobModal"
      :job="selectedJob"
      :job-output-images="jobOutputImages"
      :jobs-list="jobs"
      @cancel-job="cancelJobFromModal"
      @retry-job="retryJobFromModal"
      @delete-job="deleteJobFromModal"
      @open-image-fullscreen="openImageFullscreen"
      @job-changed="handleJobDetailsChanged"
    />

    <!-- Source Image Selection Modal -->
    <SourceImageSelectionModal
      v-model="showImageModal"
      :job="selectedJobForImage"
      :need-input-jobs="needInputJobs"
      @image-selected="handleImageSelected"
      @job-changed="handleJobChanged"
      @job-deleted="handleJobDeleted"
    />

    <!-- Submit Job Modal -->
    <SubmitJobModal
      v-model="showSubmitJobModal"
      @jobs-created="handleJobsCreated"
    />
  </div>
</template>

<script setup>
import JobDetailsModal from '~/components/JobDetailsModal.vue'
import SubmitJobModal from '~/components/SubmitJobModal.vue'

// Page metadata
definePageMeta({
  title: 'Jobs'
})

// Local state instead of store
const jobs = ref([])
const totalJobs = ref(0)
const isLoading = ref(false)
const loadingFilter = ref('') // Track which filter is currently loading

// Still use store for queue status only
const jobsStore = useJobsStore()

// Local modal state
const showJobModal = ref(false)
const selectedJob = ref(null)
const outputVideoReady = ref(false)
const destVideoReady = ref(false)
const jobOutputImages = ref([])

// Image selection modal data (keeping for potential future use)
const showImageModal = ref(false)
const selectedJobForImage = ref(null)

// Submit job modal state
const showSubmitJobModal = ref(false)

// Pagination
const pageNumber = ref(1)
const itemsPerPage = ref(25)

// Limit options for dropdown
const limitOptions = [
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '200', value: 200 },
  { label: '500', value: 500 }
]

// Local reactive filter state
const currentFilter = ref('')

// Bulk selection state
const selectedJobs = ref(new Set())

// New processing state for the updated UI
const isStartingSingle = ref(false)
const isStartingContinuous = ref(false)
const isStopping = ref(false)
const processingMode = ref('idle')

// Subject filtering using composable
const {
  selectedSubject: selectedSubjectFilter,
  searchQuery: subjectSearchQuery,
  subjectItems: subjectFilterItems,
  handleSubjectSelection,
  clearSubject
} = useSubjects()

// Source type filtering
const selectedSourceTypeFilter = ref('all')
const sourceTypeOptions = [
  { value: 'all', label: 'All Jobs' },
  { value: 'vid', label: 'Video Jobs' },
  { value: 'source', label: 'Source Jobs' }
]

// Direct API call function to replace store method
const fetchJobsDirectly = async (page = 1, limit = 25, status = '', subjectUuid = '', sourceType = 'all') => {
  try {
    isLoading.value = true
    
    // Calculate offset from page (API expects offset, not page)
    const offset = (page - 1) * limit
    
    const query = {
      limit,
      offset,
      sort_by: 'updated_at',
      sort_order: 'desc'
    }
    
    // Only add status if it's not empty string (for "all" filter)
    if (status && status !== '') query.status = status
    if (subjectUuid) query.subject_uuid = subjectUuid
    if (sourceType && sourceType !== 'all') {
      // API expects source_type parameter, not has_source_media
      query.source_type = sourceType
    }
    
    console.log('🔍 [FETCH DEBUG] fetchJobsDirectly called with:', { page, limit, status, subjectUuid, sourceType })
    console.log('🔍 [FETCH DEBUG] Query params:', query)
    
    const response = await useApiFetch('jobs/search', { query })
    
    console.log('🔍 [FETCH DEBUG] API response:', response)
    
    if (response.results) {
      jobs.value = response.results
      totalJobs.value = response.count || 0  // Use filtered count for pagination
      console.log('🔍 [FETCH DEBUG] Set jobs from response.results:', jobs.value.length, 'jobs, filtered total:', totalJobs.value)
    } else if (response.jobs) {
      jobs.value = response.jobs
      totalJobs.value = response.count || 0
      console.log('🔍 [FETCH DEBUG] Set jobs from response.jobs:', jobs.value.length, 'jobs, filtered total:', totalJobs.value)
    } else if (Array.isArray(response)) {
      jobs.value = response
      totalJobs.value = response.length
      console.log('🔍 [FETCH DEBUG] Set jobs from array response:', jobs.value.length, 'jobs')
    } else {
      jobs.value = []
      totalJobs.value = 0
      console.log('🔍 [FETCH DEBUG] No valid response format, setting empty jobs')
    }
  } catch (error) {
    console.error('Failed to fetch jobs:', error)
    jobs.value = []
    totalJobs.value = 0
  } finally {
    isLoading.value = false
  }
}

// Subject filter handlers
const handleSubjectFilterSelection = async (selected) => {
  const startTime = performance.now()
  console.log(`👤 [SUBJECT DEBUG] handleSubjectFilterSelection started - selected:`, selected)
  
  handleSubjectSelection(selected)
  if (selected && selected.value) {
    // Filter jobs by subject UUID
    currentFilter.value = `subject:${selected.value}`
    pageNumber.value = 1
    const statusFilter = currentFilter.value || ''
    const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
    
    console.log(`👤 [SUBJECT DEBUG] Starting jobs API call for subject filter...`)
    const apiStartTime = performance.now()
    
    await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, selected.value, sourceTypeFilter)
    
    const apiTime = performance.now() - apiStartTime
    const totalTime = performance.now() - startTime
    console.log(`👤 [SUBJECT DEBUG] Subject filter API calls completed in ${apiTime.toFixed(2)}ms`)
    console.log(`👤 [SUBJECT DEBUG] handleSubjectFilterSelection completed in ${totalTime.toFixed(2)}ms`)
  } else {
    await clearSubjectFilter()
  }
}

const clearSubjectFilter = async () => {
  clearSubject()
  currentFilter.value = ''
  pageNumber.value = 1
  const statusFilter = currentFilter.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  
  await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, '', sourceTypeFilter)
}

// Source type filter handlers
const handleSourceTypeFilterSelection = async (selected) => {
  const startTime = performance.now()
  console.log(`📁 [SOURCE TYPE DEBUG] handleSourceTypeFilterSelection started - selected: "${selected}"`)
  
  selectedSourceTypeFilter.value = selected
  pageNumber.value = 1
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  
  console.log(`📁 [SOURCE TYPE DEBUG] Starting jobs API call for source type filter...`)
  const apiStartTime = performance.now()
  
  await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, subjectUuid, selected)
  
  const apiTime = performance.now() - apiStartTime
  const totalTime = performance.now() - startTime
  console.log(`📁 [SOURCE TYPE DEBUG] Source type filter API calls completed in ${apiTime.toFixed(2)}ms`)
  console.log(`📁 [SOURCE TYPE DEBUG] handleSourceTypeFilterSelection completed in ${totalTime.toFixed(2)}ms`)
}

const clearSourceTypeFilter = async () => {
  selectedSourceTypeFilter.value = 'all'
  pageNumber.value = 1
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  
  await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, subjectUuid, 'all')
}

// Computed properties
const totalPages = computed(() => Math.ceil(totalJobs.value / itemsPerPage.value))

// Check if any processing is currently active
const isAnyProcessingActive = computed(() => {
  // Show stop button if:
  // 1. Our local mode indicates we're processing (single or continuous)
  // 2. OR ComfyUI is actually processing something
  return processingMode.value !== 'idle' ||
         jobsStore.systemStatus?.comfyuiProcessing?.status === 'processing'
})

// Get all jobs that need input for modal navigation
const needInputJobs = ref([])

// Fetch all jobs that need input (not just current page)
const fetchAllNeedInputJobs = async () => {
  try {
    const response = await useApiFetch('jobs/search', {
      query: {
        status: 'need_input',
        limit: 1000, // Get a large number to ensure we get all
        sort_by: 'updated_at',
        sort_order: 'desc'
      }
    })
    
    if (response.results) {
      needInputJobs.value = response.results
    } else if (response.jobs) {
      needInputJobs.value = response.jobs
    } else if (Array.isArray(response)) {
      needInputJobs.value = response
    } else {
      needInputJobs.value = []
    }
  } catch (error) {
    console.error('Failed to fetch need_input jobs:', error)
    needInputJobs.value = []
  }
}

// Bulk selection computed properties
const visibleJobIds = computed(() => jobs.value.map(job => job.id))
const selectedJobsArray = computed(() => Array.from(selectedJobs.value))
const hasSelectedJobs = computed(() => selectedJobs.value.size > 0)
const allVisibleSelected = computed(() => {
  return visibleJobIds.value.length > 0 && visibleJobIds.value.every(id => selectedJobs.value.has(id))
})
const hasPartialSelection = computed(() => {
  const selectedVisibleJobs = visibleJobIds.value.filter(id => selectedJobs.value.has(id))
  return selectedVisibleJobs.length > 0 && selectedVisibleJobs.length < visibleJobIds.value.length
})

// Bulk selection methods
const toggleSelectAll = () => {
  if (allVisibleSelected.value) {
    // If all are selected, unselect all visible jobs
    visibleJobIds.value.forEach(id => selectedJobs.value.delete(id))
  } else {
    // If none or some are selected, select all visible jobs
    visibleJobIds.value.forEach(id => selectedJobs.value.add(id))
  }
}

const toggleJobSelection = (jobId, checked) => {
  if (checked) {
    selectedJobs.value.add(jobId)
  } else {
    selectedJobs.value.delete(jobId)
  }
}

const clearSelection = () => {
  selectedJobs.value.clear()
}



// Methods
const filterByStatus = async (status) => {
  const startTime = performance.now()
  console.log(`🎯 [FILTER DEBUG] filterByStatus clicked - status: "${status}"`)
  
  // Update local filter immediately for UI feedback
  currentFilter.value = status
  pageNumber.value = 1
  
  // Show loading state immediately with specific filter tracking
  loadingFilter.value = status
  isLoading.value = true
  jobs.value = []
  
  // Fetch fresh jobs for this status
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  
  try {
    await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, status, subjectUuid, sourceTypeFilter)
  } catch (error) {
    console.error('Filter failed:', error)
  } finally {
    // Always reset loading state
    isLoading.value = false
    loadingFilter.value = ''
  }
  
  const totalTime = performance.now() - startTime
  console.log(`🎯 [FILTER DEBUG] filterByStatus completed in ${totalTime.toFixed(2)}ms`)
}

const refreshJobsWithCurrentState = async () => {
  const startTime = performance.now()
  console.log(`🔄 [REFRESH DEBUG] refreshJobsWithCurrentState started`)
  
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  
  // Only fetch jobs for refresh - queue status is updated via WebSocket
  await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, subjectUuid, sourceTypeFilter)
  
  const totalTime = performance.now() - startTime
  console.log(`🔄 [REFRESH DEBUG] refreshJobsWithCurrentState completed in ${totalTime.toFixed(2)}ms`)
}

// New processing methods for the updated UI
const startSingleProcessing = async () => {
  try {
    isStartingSingle.value = true
    processingMode.value = 'single'
    
    const response = await useApiFetch('jobs/processing/single', {
      method: 'POST'
    })
    
    if (response.success) {
      const toast = useToast()
      toast.add({
        title: 'Single Job Processing Started',
        description: response.message || 'Processing one job',
        color: 'success',
        duration: 3000
      })
    } else {
      const toast = useToast()
      toast.add({
        title: 'No Jobs to Process',
        description: response.message || 'No jobs available for processing',
        color: 'warning',
        duration: 2000
      })
      processingMode.value = 'idle'
    }
  } catch (error) {
    console.error('Failed to start single processing:', error)
    processingMode.value = 'idle'
    
    const toast = useToast()
    toast.add({
      title: 'Processing Failed',
      description: error.data?.statusMessage || error.message || 'Failed to start processing',
      color: 'error',
      duration: 4000
    })
  } finally {
    isStartingSingle.value = false
  }
}

const startContinuousProcessing = async () => {
  try {
    isStartingContinuous.value = true
    processingMode.value = 'continuous'
    
    const response = await useApiFetch('jobs/processing/continuous', {
      method: 'POST'
    })
    
    if (response.success) {
      const toast = useToast()
      toast.add({
        title: 'Continuous Processing Started',
        description: response.message || 'Processing all jobs continuously',
        color: 'success',
        duration: 3000
      })
    } else {
      const toast = useToast()
      toast.add({
        title: 'No Jobs to Process',
        description: response.message || 'No jobs available for processing',
        color: 'warning',
        duration: 2000
      })
      processingMode.value = 'idle'
    }
  } catch (error) {
    console.error('Failed to start continuous processing:', error)
    processingMode.value = 'idle'
    
    const toast = useToast()
    toast.add({
      title: 'Processing Failed',
      description: error.data?.statusMessage || error.message || 'Failed to start processing',
      color: 'error',
      duration: 4000
    })
  } finally {
    isStartingContinuous.value = false
  }
}

const stopAllProcessing = async () => {
  try {
    isStopping.value = true
    
    const response = await useApiFetch('jobs/processing/interrupt', {
      method: 'POST'
    })
    
    if (response.success) {
      processingMode.value = 'idle'
      const toast = useToast()
      toast.add({
        title: 'Processing Stopped',
        description: 'All job processing has been stopped',
        color: 'success',
        duration: 3000
      })
    }
  } catch (error) {
    console.error('Failed to stop processing:', error)
    
    const toast = useToast()
    toast.add({
      title: 'Stop Failed',
      description: error.data?.statusMessage || error.message || 'Failed to stop processing',
      color: 'error',
      duration: 4000
    })
  } finally {
    isStopping.value = false
  }
}

// Handle pagination page changes
const handlePageChange = async (newPage) => {
  const startTime = performance.now()
  console.log(`📄 [PAGE DEBUG] handlePageChange started - newPage: ${newPage}`)
  
  pageNumber.value = newPage
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  
  console.log(`📄 [PAGE DEBUG] Starting jobs API call for page change...`)
  const apiStartTime = performance.now()
  
  await fetchJobsDirectly(newPage, itemsPerPage.value, statusFilter, subjectUuid, sourceTypeFilter)
  
  const apiTime = performance.now() - apiStartTime
  const totalTime = performance.now() - startTime
  console.log(`📄 [PAGE DEBUG] Page change API calls completed in ${apiTime.toFixed(2)}ms`)
  console.log(`📄 [PAGE DEBUG] handlePageChange completed in ${totalTime.toFixed(2)}ms`)
}

// Handle limit change
const handleLimitChange = async () => {
  const startTime = performance.now()
  console.log(`📊 [LIMIT DEBUG] handleLimitChange started - new limit: ${itemsPerPage.value}`)
  
  pageNumber.value = 1 // Reset to first page when changing limit
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  
  console.log(`📊 [LIMIT DEBUG] Starting parallel API calls for limit change...`)
  const apiStartTime = performance.now()
  
  // Fetch jobs and update queue status simultaneously
  await Promise.all([
    fetchJobsDirectly(1, itemsPerPage.value, statusFilter, subjectUuid, sourceTypeFilter),
    jobsStore.fetchQueueStatus()
  ])
  
  const apiTime = performance.now() - apiStartTime
  const totalTime = performance.now() - startTime
  console.log(`📊 [LIMIT DEBUG] Limit change API calls completed in ${apiTime.toFixed(2)}ms`)
  console.log(`📊 [LIMIT DEBUG] handleLimitChange completed in ${totalTime.toFixed(2)}ms`)
}

const viewJobDetails = async (jobId) => {
  try {
    // Reset video ready states when opening a new job
    outputVideoReady.value = false
    destVideoReady.value = false
    
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

// Helper method to format status display text
const getStatusDisplayText = (status) => {
  if (status === 'need_input') {
    return 'input'
  }
  return status
}

// Get job actions for dropdown menu
const getJobActions = (job) => {
  const actions = []
  
  // Add cancel option for queued/active/need_input/failed jobs
  if (['queued', 'active', 'need_input', 'failed'].includes(job.status)) {
    actions.push({
      label: 'Cancel Job',
      icon: 'i-heroicons-x-mark',
      onSelect: async () => {
        await cancelJob(job)
      }
    })
  }
  
  // Add re-queue option specifically for failed jobs
  if (job.status === 'failed') {
    actions.push({
      label: 'Re-queue Job',
      icon: 'i-heroicons-arrow-path-rounded-square',
      onSelect: async () => {
        await requeueJob(job)
      }
    })
  }
  
  // Add retry option for failed, canceled, completed, or need_input jobs
  if (['canceled', 'failed', 'completed', 'need_input'].includes(job.status)) {
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

// Image selection modal methods
const openImageSelectionModal = async (job) => {
  // Fetch all need_input jobs before opening modal
  await fetchAllNeedInputJobs()
  selectedJobForImage.value = job
  showImageModal.value = true
}

// Image selection methods (keeping handleImageSelected for potential future use)
const handleImageSelected = async () => {
  await refreshJobsWithCurrentState()
  // Refresh the need_input jobs list for the modal
  await fetchAllNeedInputJobs()
}

// Handle job navigation in the modal
const handleJobChanged = (newJob) => {
  selectedJobForImage.value = newJob
}

// Handle job deletion from the modal
const handleJobDeleted = async () => {
  await refreshJobsWithCurrentState()
  // Refresh the need_input jobs list for the modal
  await fetchAllNeedInputJobs()
}

// Handle jobs created from submit job modal
const handleJobsCreated = async (result) => {
  const toast = useToast()
  toast.add({
    title: 'Jobs Created Successfully',
    description: `${result.successCount} job${result.successCount !== 1 ? 's' : ''} created successfully!`,
    color: 'green',
    duration: 3000
  })
  
  // Refresh the jobs list to show new jobs
  await refreshJobsWithCurrentState()
}

const openImageFullscreen = (image) => {
  // TODO: Implement image fullscreen functionality
  console.log('Opening image fullscreen:', image)
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
    await refreshJobsWithCurrentState()
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
    await refreshJobsWithCurrentState()
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

// Job re-queue method
const requeueJob = async (job) => {
  try {
    const { confirm } = useConfirmDialog()
    
    const confirmed = await confirm({
      title: 'Re-queue Failed Job',
      message: `Are you sure you want to re-queue job ${job.id}? This will delete any output media and reset the job to queued status.`,
      confirmLabel: 'Re-queue Job',
      cancelLabel: 'Cancel',
      variant: 'primary'
    })
    
    if (!confirmed) return
    
    await useApiFetch(`jobs/${job.id}/requeue`, {
      method: 'POST'
    })
    
    // Show success toast
    const toast = useToast()
    toast.add({
      title: 'Job Re-queued Successfully',
      description: `Job ${job.id} has been re-queued and is ready for processing.`,
      color: 'success',
      duration: 2000
    })
    
    // Refresh the jobs list after re-queue
    await refreshJobsWithCurrentState()
  } catch (error) {
    console.error('Failed to re-queue job:', error)
    
    let errorMessage = 'Failed to re-queue job'
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
  console.log('🗑️ deleteJob called with job:', job.id)
  try {
    const { confirm } = useConfirmDialog()
    
    console.log('🤔 Showing confirmation dialog...')
    const confirmed = await confirm({
      title: 'Delete Job',
      message: `Are you sure you want to delete job ${job.id}? This action cannot be undone and will remove the job and any associated output media.`,
      confirmLabel: 'Delete Job',
      cancelLabel: 'Cancel',
      variant: 'error'
    })
    
    console.log('✅ Confirmation result:', confirmed)
    if (!confirmed) {
      console.log('❌ User cancelled deletion')
      return
    }
    
    console.log('🚀 Making delete API call...')
    console.log('🔗 Delete URL:', `/api/jobs/${job.id}/delete`)
    const result = await useApiFetch(`jobs/${job.id}/delete`, {
      method: 'DELETE'
    })
    console.log('✅ Delete API call completed, result:', result)
    
    // Show success toast
    const toast = useToast()
    toast.add({
      title: 'Job Deleted Successfully',
      description: `Job ${job.id} has been deleted successfully.`,
      color: 'success',
      duration: 1000
    })
    
    // Refresh the jobs list after deletion with cache busting
    await refreshJobsWithCurrentState()
    // Also refresh queue status to update counts
    await jobsStore.fetchQueueStatus()
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

// Modal-specific retry, cancel and delete handlers
const retryJobFromModal = async () => {
  console.log('🔄 retryJobFromModal called')
  if (selectedJob.value) {
    showJobModal.value = false
    await retryJob(selectedJob.value)
  }
}

const cancelJobFromModal = async () => {
  if (selectedJob.value) {
    showJobModal.value = false
    await cancelJob(selectedJob.value)
  }
}

const deleteJobFromModal = async () => {
  console.log('🗑️ deleteJobFromModal called')
  if (selectedJob.value) {
    console.log('🗑️ selectedJob exists, closing modal and calling deleteJob')
    showJobModal.value = false
    await deleteJob(selectedJob.value)
  } else {
    console.log('❌ No selectedJob found!')
  }
}

// Handle job change from JobDetailsModal
const handleJobDetailsChanged = async (newJob) => {
  try {
    // Fetch the full job details with thumbnails
    const response = await useApiFetch(`jobs/${newJob.id}?include_thumbnails=true&thumbnail_size=md`)
    selectedJob.value = response.job
  } catch (error) {
    console.error('Failed to fetch job details for navigation:', error)
    // Fallback to the basic job data
    selectedJob.value = newJob
  }
}

// Bulk operation methods
const bulkQueue = async () => {
  const jobsToQueue = selectedJobsArray.value.filter(jobId => {
    const job = jobs.value.find(j => j.id === jobId)
    return job && ['canceled', 'failed', 'completed', 'need_input'].includes(job.status)
  })
  
  if (jobsToQueue.length === 0) {
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'No Jobs to Queue',
      message: 'Selected jobs cannot be queued. Only canceled, failed, completed, or need_input jobs can be queued.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'warning'
    })
    return
  }
  
  const { confirm } = useConfirmDialog()
  const confirmed = await confirm({
    title: 'Queue Selected Jobs',
    message: `Are you sure you want to queue ${jobsToQueue.length} job(s)?`,
    confirmLabel: 'Queue Jobs',
    cancelLabel: 'Cancel',
    variant: 'primary'
  })
  
  if (!confirmed) return
  
  try {
    // Queue jobs by retrying them
    for (const jobId of jobsToQueue) {
      await useApiFetch(`jobs/${jobId}/retry`, { method: 'POST' })
    }
    
    const toast = useToast()
    toast.add({
      title: 'Jobs Queued Successfully',
      description: `${jobsToQueue.length} job(s) have been queued.`,
      color: 'success',
      duration: 2000
    })
    
    clearSelection()
    await refreshJobsWithCurrentState()
  } catch (error) {
    console.error('Failed to queue jobs:', error)
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: 'Failed to queue some jobs. Please try again.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

const bulkCancel = async () => {
  const jobsToCancel = selectedJobsArray.value.filter(jobId => {
    const job = jobs.value.find(j => j.id === jobId)
    return job && ['queued', 'active', 'need_input', 'failed'].includes(job.status)
  })
  
  if (jobsToCancel.length === 0) {
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'No Jobs to Cancel',
      message: 'Selected jobs cannot be canceled. Only queued, active, need_input, or failed jobs can be canceled.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'warning'
    })
    return
  }
  
  const { confirm } = useConfirmDialog()
  const confirmed = await confirm({
    title: 'Cancel Selected Jobs',
    message: `Are you sure you want to cancel ${jobsToCancel.length} job(s)? This action cannot be undone.`,
    confirmLabel: 'Cancel Jobs',
    cancelLabel: 'Keep Jobs',
    variant: 'error'
  })
  
  if (!confirmed) return
  
  try {
    for (const jobId of jobsToCancel) {
      await useApiFetch(`jobs/${jobId}/cancel`, { method: 'POST' })
    }
    
    const toast = useToast()
    toast.add({
      title: 'Jobs Canceled Successfully',
      description: `${jobsToCancel.length} job(s) have been canceled.`,
      color: 'success',
      duration: 2000
    })
    
    clearSelection()
    await refreshJobsWithCurrentState()
  } catch (error) {
    console.error('Failed to cancel jobs:', error)
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: 'Failed to cancel some jobs. Please try again.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

const bulkDelete = async () => {
  const { confirm } = useConfirmDialog()
  const confirmed = await confirm({
    title: 'Delete Selected Jobs',
    message: `Are you sure you want to delete ${selectedJobs.value.size} job(s)? This action cannot be undone and will remove the jobs and any associated output media.`,
    confirmLabel: 'Delete Jobs',
    cancelLabel: 'Cancel',
    variant: 'error'
  })
  
  if (!confirmed) return
  
  try {
    for (const jobId of selectedJobsArray.value) {
      await useApiFetch(`jobs/${jobId}/delete`, { method: 'DELETE' })
    }
    
    const toast = useToast()
    toast.add({
      title: 'Jobs Deleted Successfully',
      description: `${selectedJobs.value.size} job(s) have been deleted.`,
      color: 'success',
      duration: 2000
    })
    
    clearSelection()
    await refreshJobsWithCurrentState()
    await jobsStore.fetchQueueStatus()
  } catch (error) {
    console.error('Failed to delete jobs:', error)
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: 'Failed to delete some jobs. Please try again.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

// Page visibility changes are now handled globally by the websocket plugin


// Reset video states when modal is closed
watch(showJobModal, (isOpen) => {
  if (!isOpen) {
    outputVideoReady.value = false
    destVideoReady.value = false
  }
})

// Clear selection when page changes or filters change
watch([pageNumber, currentFilter, selectedSubjectFilter, selectedSourceTypeFilter], () => {
  clearSelection()
})

// Watch for processing status changes from the backend
watch(() => jobsStore.systemStatus?.comfyuiProcessing?.status, (newStatus) => {
  // If ComfyUI goes idle and we're not in the middle of starting something, reset mode
  if (newStatus === 'idle' && !isStartingSingle.value && !isStartingContinuous.value) {
    processingMode.value = 'idle'
  }
})


// Lifecycle
onMounted(async () => {
  // Reset processing mode on page load
  processingMode.value = 'idle'
  
  // Fetch initial data (queue status, system status, etc.)
  await jobsStore.fetchInitialData()
  
  // Determine which filter to use based on queue status counts
  const needInputCount = jobsStore.queueStatus?.queue?.need_input || 0
  const defaultFilter = needInputCount > 0 ? 'need_input' : 'completed'
  
  // Set the filter and fetch jobs
  currentFilter.value = defaultFilter
  await fetchJobsDirectly(1, itemsPerPage.value, defaultFilter, '', 'all')
  
  // Page visibility changes are now handled globally by the websocket plugin
})

onUnmounted(() => {
  // WebSocket cleanup is now handled globally by the websocket plugin
  // Just clear any page-specific state here if needed
})

// Page head
useHead({
  title: 'Jobs - Media Server Job System',
  meta: [
    { name: 'description', content: 'Monitor and manage video processing jobs' }
  ]
})

// System status helper functions
const getSystemHealthIcon = (health) => {
  switch (health) {
    case 'healthy': return 'i-heroicons-check-circle'
    case 'degraded': return 'i-heroicons-exclamation-triangle'
    case 'unhealthy': return 'i-heroicons-x-circle'
    default: return 'i-heroicons-question-mark-circle'
  }
}

const getSystemHealthColor = (health) => {
  switch (health) {
    case 'healthy': return 'text-green-600 dark:text-green-400'
    case 'degraded': return 'text-yellow-600 dark:text-yellow-400'
    case 'unhealthy': return 'text-red-600 dark:text-red-400'
    default: return 'text-gray-600 dark:text-gray-400'
  }
}

const getWorkerStatusIcon = (status) => {
  switch (status) {
    case 'healthy': return 'i-heroicons-check-circle'
    case 'unhealthy': return 'i-heroicons-x-circle'
    default: return 'i-heroicons-question-mark-circle'
  }
}

const getWorkerStatusColor = (status) => {
  switch (status) {
    case 'healthy': return 'text-green-600 dark:text-green-400'
    case 'unhealthy': return 'text-red-600 dark:text-red-400'
    default: return 'text-gray-600 dark:text-gray-400'
  }
}

const getProcessingStatusIcon = (status) => {
  switch (status) {
    case 'idle': return 'i-heroicons-pause-circle'
    case 'processing': return 'i-heroicons-play-circle'
    case 'queued': return 'i-heroicons-clock'
    default: return 'i-heroicons-question-mark-circle'
  }
}

const getProcessingStatusColor = (status) => {
  switch (status) {
    case 'idle': return 'text-gray-600 dark:text-gray-400'
    case 'processing': return 'text-blue-600 dark:text-blue-400'
    case 'queued': return 'text-yellow-600 dark:text-yellow-400'
    default: return 'text-gray-600 dark:text-gray-400'
  }
}
</script>

