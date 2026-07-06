<template>
  <div class="container mx-auto p-3 sm:p-6">
    <!-- Queue Status Card -->
    <UCard class="mb-3 sm:mb-6">
      <template #header>
        <div class="flex flex-col gap-2 sm:gap-0">
          <div class="flex items-center justify-between">
            <h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Queue Status</h2>
            <div class="flex items-center gap-1 sm:gap-2">
              <!-- Subject Filter for continuous processing (scopes Process All / Process N to one subject across all job types) -->
              <div class="hidden sm:block w-48" title="Limit continuous processing to a single subject">
                <UInputMenu
                  v-model="processingSubject"
                  v-model:search-term="processingSubjectSearch"
                  :items="processingSubjectItemsWithAll"
                  placeholder="All subjects"
                  class="w-full"
                  by="value"
                  option-attribute="label"
                  searchable
                  @update:model-value="onProcessingSubjectSelect"
                />
              </div>

              <!-- Preset Filter for continuous processing (i2v only — left of pick order toggle) -->
              <div v-if="processingJobType === 'i2v'" class="hidden sm:block w-44" title="Limit continuous processing to a single preset">
                <PresetFilter
                  v-model="presetFilterValue"
                  job-type="i2v"
                  placeholder="All presets"
                />
              </div>

              <!-- Job Type Filter for continuous processing (only Process All / Process N pick these up) -->
              <div class="hidden sm:block w-40" title="Limit Process All / Process N to a single job type">
                <USelect
                  v-model="processingJobType"
                  :items="processingJobTypeOptions"
                  placeholder="All job types"
                />
              </div>

              <!-- Pick Order Toggle (chronological vs random preset-reuse) -->
              <div
                class="hidden sm:flex items-center gap-1.5 px-2"
                :title="pickOrderTooltip"
              >
                <span
                  class="text-xs"
                  :class="pickOrder === 'chronological' ? 'text-primary font-medium' : 'text-gray-400'"
                >Chrono</span>
                <USwitch
                  :model-value="pickOrder === 'random'"
                  :disabled="pickOrderSaving"
                  @update:model-value="onPickOrderToggle($event)"
                />
                <span
                  class="text-xs"
                  :class="pickOrder === 'random' ? 'text-primary font-medium' : 'text-gray-400'"
                >Random</span>
              </div>

              <!-- Submit Job Button -->
              <UButton type="button" size="lg" variant="solid" color="primary" @click="showSubmitJobModal = true">
                <UIcon name="i-heroicons-plus" class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span class="hidden sm:inline">Submit Job</span>
              </UButton>

              <!-- Force Restart Button (⚡) - Always visible. Hard-restarts the worker containers (evicts loaded models). -->
              <UButton type="button" size="lg" variant="ghost" color="error" :loading="isRestarting" @click.prevent="forceRestartWorkers()" title="Force Restart ComfyUI (reloads models)">
                <UIcon name="i-heroicons-power" class="w-3 h-3 sm:w-4 sm:h-4" />
              </UButton>

              <!-- Processing Control Buttons -->
              <template v-if="!isAnyProcessingActive">
                <!-- Split button: Process N (▶️) + caret to pick the count -->
                <div class="flex">
                  <UButton
                    type="button"
                    size="lg"
                    variant="outline"
                    color="primary"
                    :loading="isStartingSingle"
                    class="rounded-r-none"
                    @click.prevent="startProcessNJobs()"
                  >
                    <UIcon name="i-heroicons-play" class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                    <span class="hidden sm:inline">Process {{ selectedJobCount === 1 ? 'One' : selectedJobCount }}</span>
                  </UButton>
                  <UDropdownMenu :items="jobCountDropdownItems" :ui="{ content: 'w-28 max-h-72 overflow-y-auto' }">
                    <UButton
                      type="button"
                      size="lg"
                      variant="outline"
                      color="primary"
                      class="rounded-l-none border-l-0 px-1.5 sm:px-2"
                      aria-label="Select number of jobs to process"
                    >
                      <UIcon name="i-heroicons-chevron-down" class="w-3 h-3 sm:w-4 sm:h-4" />
                    </UButton>
                  </UDropdownMenu>
                </div>

                <!-- Continuous Processing Button (🔄) -->
                <UButton type="button" size="lg" variant="outline" color="primary" :loading="isStartingContinuous" @click.prevent="startContinuousProcessing()">
                  <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                  <span class="hidden sm:inline">Process All</span>
                </UButton>
              </template>

              <!-- Stop Button (⏹️) - shown when any processing is active -->
              <template v-else>
                <UButton type="button" size="lg" variant="outline" color="error" :loading="isStopping" @click.prevent="stopAllProcessing()">
                  <UIcon name="i-heroicons-stop" class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                  <span class="hidden sm:inline">Stop Processing</span>
                </UButton>

                <!-- Processing Mode Indicator -->
                <UBadge :color="processingModeBadgeColor" variant="soft" size="lg" class="hidden sm:inline-flex">
                  {{ processingModeBadgeLabel }}
                </UBadge>
              </template>
            </div>
          </div>

          <!-- Mobile-only second row: Subject filter + Preset filter + Pick order toggle -->
          <div class="flex sm:hidden items-center gap-2">
            <div class="flex-1 min-w-0" title="Limit continuous processing to a single subject">
              <UInputMenu
                v-model="processingSubject"
                v-model:search-term="processingSubjectSearch"
                :items="processingSubjectItemsWithAll"
                placeholder="All subjects"
                class="w-full"
                by="value"
                option-attribute="label"
                searchable
                @update:model-value="onProcessingSubjectSelect"
              />
            </div>
            <div v-if="processingJobType === 'i2v'" class="flex-1 min-w-0" title="Limit continuous processing to a single preset">
              <PresetFilter
                v-model="presetFilterValue"
                job-type="i2v"
                placeholder="All presets"
              />
            </div>
            <div class="flex-1 min-w-0" title="Limit Process All / Process N to a single job type">
              <USelect
                v-model="processingJobType"
                :items="processingJobTypeOptions"
                placeholder="All job types"
              />
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0" :title="pickOrderTooltip">
              <span
                class="text-xs"
                :class="pickOrder === 'chronological' ? 'text-primary font-medium' : 'text-gray-400'"
              >Chrono</span>
              <USwitch
                :model-value="pickOrder === 'random'"
                :disabled="pickOrderSaving"
                @update:model-value="onPickOrderToggle($event)"
              />
              <span
                class="text-xs"
                :class="pickOrder === 'random' ? 'text-primary font-medium' : 'text-gray-400'"
              >Random</span>
            </div>
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
    </UCard>

    <!-- Subject Filter -->
    <UCard class="mb-3 sm:mb-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div>
          <UInputMenu v-model="selectedSubjectFilter" v-model:search-term="subjectSearchQuery" :items="subjectFilterItems" placeholder="Search for a subject to filter jobs..." class="w-full" by="value" option-attribute="label" searchable @update:model-value="handleSubjectFilterSelection" />
        </div>

        <div>
          <USelect v-model="selectedSourceTypeFilter" :items="sourceTypeOptions" placeholder="Filter by job type..." class="w-full" @update:model-value="handleSourceTypeFilterSelection" />
        </div>

        <div>
          <PresetFilter v-model="selectedPresetFilter" job-type="i2v" placeholder="Filter by i2v preset..." />
        </div>

        <div class="flex items-end gap-2">
          <UButton type="button" variant="outline" size="xs" :disabled="!selectedSubjectFilter" @click="clearSubjectFilter">
            <span class="inline">Clear Subject</span>
          </UButton>
          <UButton type="button" variant="outline" size="xs" :disabled="selectedSourceTypeFilter === 'all'" @click="clearSourceTypeFilter">
            <span class="inline">Clear Type</span>
          </UButton>
          <UButton type="button" variant="outline" size="xs" :disabled="!selectedPresetFilter" @click="selectedPresetFilter = null">
            <span class="inline">Clear Preset</span>
          </UButton>
        </div>
      </div>

      <!-- Star Rating Filter -->
      <div class="mt-3 sm:mt-4">
        <RatingFilter v-model="selectedRatings" v-model:show-unrated="showUnrated" @update:model-value="handleRatingFilterChange" @update:show-unrated="handleRatingFilterChange" />
      </div>
    </UCard>

    <!-- Jobs List -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UCheckbox :model-value="allVisibleSelected" :indeterminate="hasPartialSelection" @update:model-value="toggleSelectAll" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Jobs
              <span v-if="hasSelectedJobs" class="text-sm font-normal text-gray-500 dark:text-gray-400"> ({{ selectedJobs.size }} selected) </span>
            </h3>
          </div>

          <!-- Results Limit and Bulk Actions -->
          <div class="flex items-center gap-2">
            <!-- View Toggle -->
            <div class="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mr-2">
              <UButton :variant="viewMode === 'list' ? 'solid' : 'ghost'" size="xs" icon="i-heroicons-list-bullet" @click="viewMode = 'list'" />
              <UButton :variant="viewMode === 'grid' ? 'solid' : 'ghost'" size="xs" icon="i-heroicons-squares-2x2" @click="viewMode = 'grid'" />
            </div>

            <!-- Results Limit Dropdown -->
            <div v-if="!hasSelectedJobs" class="flex items-center gap-2">
              <label class="text-xs font-medium text-gray-600 dark:text-gray-400"> Results: </label>
              <USelect v-model="itemsPerPage" :items="limitOptions" class="w-24" size="xs" @change="handleLimitChange" />
            </div>

            <!-- Bulk Actions -->
            <div v-if="hasSelectedJobs" class="flex items-center gap-2">
              <UButton size="xs" color="primary" variant="outline" icon="i-heroicons-arrow-up" @click="bulkPushToFront"> Push to Front </UButton>
              <UButton size="xs" color="primary" variant="outline" @click="bulkQueue"> Queue Selected </UButton>
              <UButton size="xs" color="error" variant="outline" @click="bulkCancel"> Cancel Selected </UButton>
              <UButton size="xs" color="error" variant="outline" @click="bulkDelete"> Delete Selected </UButton>
              <UButton size="xs" variant="ghost" @click="clearSelection"> Clear </UButton>
            </div>
          </div>
        </div>
      </template>

      <div v-if="jobs.length === 0 && !isLoading" class="text-center py-8 text-gray-500 dark:text-gray-400">No jobs found</div>

      <div v-else-if="jobs.length === 0 && isLoading" class="flex flex-col items-center justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p class="text-sm text-gray-500 dark:text-gray-400">Loading jobs...</p>
      </div>

      <div v-else class="h-80 sm:h-96 overflow-y-auto">
        <!-- List View -->
        <div v-if="viewMode === 'list'">
          <div v-for="job in jobs" :key="job.id" class="border-b border-gray-200 dark:border-gray-700 p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative cursor-pointer w-full" :class="{ 'bg-blue-50 dark:bg-blue-900/20': selectedJobs.has(job.id) }" @click="job.status === 'need_input' ? openImageSelectionModal(job) : viewJobDetails(job.id)">
            <!-- Main job info row -->
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1 sm:space-x-3 min-w-0 flex-1">
                <!-- Checkbox -->
                <UCheckbox :model-value="selectedJobs.has(job.id)" @update:model-value="checked => toggleJobSelection(job.id, checked)" @click.stop />
                <!-- Time since updated - moved to left side -->
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {{ formatDateCompact(job.updated_at) }}
                </span>
                <UBadge :color="getStatusColor(job.status)" variant="solid" size="xs">
                  {{ getStatusDisplayText(job.status) }}
                </UBadge>
                <!-- Priority badge: shows position in the in-memory priority queue (1 = next) -->
                <UBadge v-if="priorityQueueSet.has(job.id)" color="warning" variant="soft" size="xs" icon="i-heroicons-arrow-up-20-solid" :title="`Priority #${priorityIndex(job.id) + 1} — picker will run this before the normal queue`">
                  PRI {{ priorityIndex(job.id) + 1 }}
                </UBadge>
                <span class="text-xs text-gray-600 dark:text-gray-400 truncate">
                  {{ job.subject?.name || 'Unknown Subject' }}
                </span>
                <!-- Desktop: Show full text -->
                <span class="text-xs text-gray-500 dark:text-gray-500 hidden sm:inline">
                  {{ job.job_type === 'i2v' ? 'i2v' : job.job_type === 't2v' ? 't2v' : job.job_type === 'fs' ? 'fs' : (job.source_media_uuid ? 'vid' : 'source') }}
                </span>
                <!-- Mobile: Show single letter badges -->
                <UBadge v-if="job.job_type === 'i2v'" color="purple" variant="soft" size="xs" class="sm:hidden"> I </UBadge>
                <UBadge v-else-if="job.job_type === 't2v'" color="purple" variant="soft" size="xs" class="sm:hidden"> T </UBadge>
                <UBadge v-else-if="job.job_type === 'fs'" color="amber" variant="soft" size="xs" class="sm:hidden"> F </UBadge>
                <UBadge v-else-if="job.source_media_uuid" color="primary" variant="soft" size="xs" class="sm:hidden"> V </UBadge>
                <UBadge v-else color="green" variant="soft" size="xs" class="sm:hidden"> S </UBadge>
                <!-- Preset name (if the job was submitted with one) -->
                <UBadge v-if="job.parameters?._preset_name" color="info" variant="subtle" size="xs" icon="i-heroicons-bookmark" class="max-w-[120px] sm:max-w-[200px] truncate">
                  {{ job.parameters._preset_name }}
                </UBadge>
                <!-- Show progress bar when available (mobile and desktop) -->
                <div v-if="job.progress && job.progress > 0 && job.progress < 100" class="flex items-center space-x-1 sm:space-x-2">
                  <div class="w-12 sm:w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                    <div class="bg-blue-600 h-1 rounded-full transition-all duration-300" :style="{ width: `${job.progress}%` }" />
                  </div>
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ job.progress }}%</span>
                </div>
                <!-- Show star rating based on job status -->
                <!-- For completed jobs: show output media rating -->
                <!-- For queued/other jobs: show dest media rating -->
                <div v-if="(job.status === 'completed' && job.output_media && job.output_media.rating) || (job.status !== 'completed' && job.dest_media && job.dest_media.rating)" class="flex items-center space-x-1">
                  <UIcon v-for="star in 5" :key="star" name="i-heroicons-star-solid" class="w-3 h-3" :class="star <= (job.status === 'completed' ? job.output_media.rating : job.dest_media.rating) ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'" />
                </div>
              </div>
            </div>

            <!-- Full-height button container positioned absolutely -->
            <div class="absolute top-0 right-0 h-full flex items-center">
              <!-- Select button for need_input jobs -->
              <div v-if="job.status === 'need_input'" class="h-full flex items-center justify-center px-3 bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20 border-l border-gray-200 dark:border-gray-700 cursor-pointer" @click.stop="openImageSelectionModal(job)">
                <span class="text-xs text-orange-600 dark:text-orange-400 font-medium">
                  <span class="hidden sm:inline">Select</span>
                  <span class="sm:hidden">Sel</span>
                </span>
              </div>

              <!-- Dropdown menu button -->
              <UDropdownMenu :items="getJobActions(job)" :ui="{ content: 'w-48' }">
                <div class="h-full flex items-center justify-center px-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-l border-gray-200 dark:border-gray-700 cursor-pointer" @click.stop>
                  <UIcon name="i-heroicons-ellipsis-horizontal" class="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
              </UDropdownMenu>
            </div>
          </div>
        </div>

        <!-- Grid View -->
        <div v-else-if="viewMode === 'grid'" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4">
          <div v-for="job in jobs" :key="job.id" class="relative group bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700 cursor-pointer" @click="job.status === 'need_input' ? openImageSelectionModal(job) : viewJobDetails(job.id)">
            <!-- Media Preview -->
            <div class="aspect-[2/3] bg-gray-100 dark:bg-gray-900 relative">
              <MediaCard v-if="job.output_media" :media="job.output_media" class="w-full h-full" @click="job.status === 'need_input' ? openImageSelectionModal(job) : viewJobDetails(job.id)" @delete="deleteJob(job)">
                <template #overlays>
                  <!-- Status Badge -->
                  <div class="absolute top-2 right-2 z-10">
                    <UBadge :color="getStatusColor(job.status)" variant="solid" size="xs">{{ getStatusDisplayText(job.status) }}</UBadge>
                  </div>
                  <!-- Selection Checkbox -->
                  <div class="absolute top-2 left-2 z-10" @click.stop>
                    <UCheckbox :model-value="selectedJobs.has(job.id)" @update:model-value="checked => toggleJobSelection(job.id, checked)" />
                  </div>
                </template>
              </MediaCard>

              <!-- Fallback if no output media -->
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-300" />
                <!-- Status Badge -->
                <div class="absolute top-2 right-2 z-10">
                  <UBadge :color="getStatusColor(job.status)" variant="solid" size="xs">{{ getStatusDisplayText(job.status) }}</UBadge>
                </div>
                <!-- Selection Checkbox -->
                <div class="absolute top-2 left-2 z-10" @click.stop>
                  <UCheckbox :model-value="selectedJobs.has(job.id)" @update:model-value="checked => toggleJobSelection(job.id, checked)" />
                </div>
              </div>
            </div>

            <!-- Footer Info -->
            <div class="p-2 text-xs">
              <div class="font-medium truncate">{{ job.subject?.name || 'Unknown' }}</div>
              <div class="text-gray-500 truncate">{{ formatDateCompact(job.updated_at) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-3 sm:mt-6 space-y-3">
        <div class="flex justify-center">
          <UPagination v-model:page="pageNumber" show-edges :sibling-count="1" :total="totalJobs" :items-per-page="itemsPerPage" @update:page="handlePageChange" />
        </div>

        <!-- Manual Page Input -->
        <div class="flex justify-center items-center gap-2">
          <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Go to page:</label>
          <UInput v-model.number="manualPageInput" type="number" :min="1" :max="totalPages" placeholder="Page #" class="w-20" size="xs" @keyup.enter="goToManualPage" />
          <UButton size="xs" variant="outline" @click="goToManualPage">Go</UButton>
        </div>
      </div>
    </UCard>

    <!-- Job Details Modal -->
    <JobDetailsModal v-model="showJobModal" :job="selectedJob" :job-output-images="jobOutputImages" :jobs-list="jobs" @cancel-job="cancelJobFromModal" @retry-job="retryJobFromModal" @delete-job="deleteJobFromModal" @open-image-fullscreen="openImageFullscreen" @job-changed="handleJobDetailsChanged" @rating-changed="handleRatingChanged" />

    <!-- Source Image Selection Modal -->
    <SourceImageSelectionModal v-model="showImageModal" :job="selectedJobForImage" :need-input-jobs="needInputJobs" @image-selected="handleImageSelected" @job-changed="handleJobChanged" @job-deleted="handleJobDeleted" />

    <!-- Submit Job Modal -->
    <SubmitJobModal ref="submitJobModalRef" v-model="showSubmitJobModal" @jobs-created="handleJobsCreated" />
  </div>
</template>

<script setup>
import { nextTick } from 'vue'
import JobDetailsModal from '~/components/JobDetailsModal.vue'
import SubmitJobModal from '~/components/SubmitJobModal.vue'
import MediaCard from '~/components/MediaCard.vue'

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

// Auto-refresh job list when queue counts change (via WebSocket)
watch(() => jobsStore.queueStatus?.queue, (newVal, oldVal) => {
  if (!newVal || !oldVal) return
  // Only refresh if counts actually changed
  if (newVal.total !== oldVal.total || newVal.active !== oldVal.active ||
      newVal.queued !== oldVal.queued || newVal.completed !== oldVal.completed ||
      newVal.failed !== oldVal.failed) {
    refreshJobsWithCurrentState()
  }
}, { deep: true })

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
const submitJobModalRef = ref(null)

// Pagination
const pageNumber = ref(1)
const itemsPerPage = ref(96)
const manualPageInput = ref(null)

// Limit options for dropdown
const limitOptions = [
  { label: '24', value: 24 },
  { label: '48', value: 48 },
  { label: '96', value: 96 },
  { label: '192', value: 192 },
  { label: '480', value: 480 }
]

// Local reactive filter state
const currentFilter = ref('')

// View mode state
const viewMode = ref('list')

// Bulk selection state
const selectedJobs = ref(new Set())

// New processing state for the updated UI
const isStartingSingle = ref(false)
const isStartingContinuous = ref(false)
const isStopping = ref(false)
const isRestarting = ref(false)
const processingMode = ref('idle')

// Pick order toggle — 'chronological' (legacy, most recent queued) vs 'random'
// (random with preset carryover so we don't reload LoRAs between jobs).
const pickOrderSaving = ref(false)
const pickOrder = computed(() => jobsStore.processingState?.pickOrder ?? 'random')
const pickOrderTooltip = computed(() =>
  pickOrder.value === 'random'
    ? 'Random: reuses the last preset if queued jobs share it, else picks at random'
    : 'Chronological: runs the most recently updated queued job'
)
async function onPickOrderToggle(isRandom) {
  const next = isRandom ? 'random' : 'chronological'
  if (next === pickOrder.value) return
  if (!jobsStore.wsConnection || !jobsStore.wsConnected) {
    useToast().add({
      title: 'Not connected',
      description: 'WebSocket is disconnected — cannot change pick order',
      color: 'warning',
      duration: 3000,
    })
    return
  }
  pickOrderSaving.value = true
  try {
    jobsStore.wsConnection.send(JSON.stringify({ type: 'set_pick_order', pick_order: next }))
  } finally {
    setTimeout(() => { pickOrderSaving.value = false }, 300)
  }
}

// Preset filter — pins continuous processing to a single preset (or "all").
// Backed by the same WebSocket-driven state as pickOrder.
const presetFilterValue = computed({
  get: () => jobsStore.processingState?.presetFilter ?? null,
  set: (next) => {
    if (!jobsStore.wsConnection || !jobsStore.wsConnected) {
      useToast().add({
        title: 'Not connected',
        description: 'WebSocket is disconnected — cannot change preset filter',
        color: 'warning',
        duration: 3000,
      })
      return
    }
    jobsStore.wsConnection.send(JSON.stringify({ type: 'set_preset_filter', preset_filter: next ?? 'all' }))
  }
})

// How many jobs the split "Process N" button will run before auto-stopping (1..15, default 1)
const selectedJobCount = ref(1)

// Badge shown while processing — "One"/"All" normally, or "M/N" when a job limit is active
const processingModeBadgeLabel = computed(() => {
  const state = jobsStore.processingState
  if (state?.isActive && state.jobLimit) {
    return `${state.jobsProcessedCount ?? 0}/${state.jobLimit}`
  }
  return processingMode.value === 'single' ? 'One' : 'All'
})
const processingModeBadgeColor = computed(() => {
  const state = jobsStore.processingState
  if (state?.isActive && state.jobLimit) return 'primary'
  return processingMode.value === 'single' ? 'primary' : 'neutral'
})
const jobCountDropdownItems = computed(() => [
  Array.from({ length: 15 }, (_, i) => {
    const n = i + 1
    return {
      label: `Process ${n}`,
      icon: n === selectedJobCount.value ? 'i-heroicons-check' : undefined,
      onSelect: () => {
        selectedJobCount.value = n
      }
    }
  })
])

// Subject filtering using composable
const { selectedSubject: selectedSubjectFilter, searchQuery: subjectSearchQuery, subjectItems: subjectFilterItems, handleSubjectSelection, clearSubject } = useSubjects()

// Source type filtering — scopes BOTH the visible job list and what the
// continuous picker considers eligible. 'vid'/'source' are legacy sub-modes
// of vid_faceswap; the broader entries below filter by jobType directly.
const selectedSourceTypeFilter = ref('all')
const sourceTypeOptions = [
  { value: 'all', label: 'All Jobs' },
  { value: 'vid_faceswap', label: 'Faceswap I2V Legacy' },
  { value: 'fs', label: 'Faceswap I2I' },
  { value: 'i2v', label: 'Wan I2V' },
  { value: 't2v', label: 'Wan T2V' },
  { value: 'tagging', label: 'Tagging' },
  { value: 'vid', label: '— Legacy: video sub-jobs' },
  { value: 'source', label: '— Legacy: source sub-jobs' }
]

// Preset filter (id of the i2v preset stashed on jobs.parameters._preset_id)
const selectedPresetFilter = ref(null)

// Processing job-type filter — sits next to the "All presets" filter in the
// Queue Status header and scopes ONLY what Process All / Process N pick up.
// Independent of the subject-card source-type filter (which also filters the
// visible list). When left on 'all', we fall back to the subject-card filter
// so existing behavior is preserved.
const processingJobType = ref('all')
// Only real continuous-picker scopes belong here. 'tagging' is intentionally
// excluded — tagging jobs bypass the picker and are dispatched directly, and
// feeding it as a scope would make the picker fall through to "process all".
const processingJobTypeOptions = [
  { value: 'all', label: 'All job types' },
  { value: 'i2v', label: 'Wan I2V' },
  { value: 't2v', label: 'Wan T2V' },
  { value: 'fs', label: 'Faceswap I2I' },
  { value: 'vid_faceswap', label: 'Faceswap I2V Legacy' },
  // train_lora rides the same picker but dispatches to the ktrain trainer and
  // skips the ComfyUI health gate (see jobProcessingService: 'train_lora' scope).
  { value: 'train_lora', label: 'LoRA Training' }
]
// Effective source_type sent to the picker: explicit header choice wins,
// otherwise inherit whatever the subject-card filter is set to.
const effectiveProcessingSourceType = () =>
  processingJobType.value !== 'all' ? processingJobType.value : selectedSourceTypeFilter.value

// The i2v preset filter only makes sense for Wan I2V jobs, so the dropdown is
// only shown when that job type is selected. Clear any pinned preset when the
// user switches away so a hidden filter can't keep silently scoping the picker.
watch(processingJobType, (jt) => {
  if (jt !== 'i2v' && presetFilterValue.value) {
    presetFilterValue.value = null
  }
})

// Processing subject filter — pins continuous processing (Process All / Process
// N) to a single subject across ALL job types. Backed by the same WebSocket-
// driven state as pickOrder/presetFilter, so it syncs across tabs/devices.
// Independent of the Subject Filter card below (which only filters the list).
const { selectedSubject: processingSubject, searchQuery: processingSubjectSearch, subjectItems: processingSubjectItems } = useSubjects()

// Prepend an explicit "All subjects" entry so the filter can be cleared from
// the dropdown itself (selecting it sends subject_filter: 'all'). Without this
// there's no in-menu way to un-pin a subject. Hidden while the user is actively
// searching so it doesn't clutter typed results.
const processingSubjectItemsWithAll = computed(() => {
  const base = processingSubjectItems.value
  if (processingSubjectSearch.value && processingSubjectSearch.value.trim()) return base
  return [{ value: 'all', label: 'All subjects' }, ...base]
})

// Keep the dropdown selection in sync with the backend subjectFilter uuid
// (initial sync + cross-tab changes). Re-resolves the label once the subject
// cache has loaded.
watch(
  () => [jobsStore.processingState?.subjectFilter, processingSubjectItems.value.length],
  ([uuid]) => {
    if (!uuid) {
      if (processingSubject.value) processingSubject.value = null
      return
    }
    if (processingSubject.value?.value === uuid) return
    const match = processingSubjectItems.value.find(i => i.value === uuid)
    processingSubject.value = match || { value: uuid, label: '…' }
  },
  { immediate: true }
)

const onProcessingSubjectSelect = (selected) => {
  const next = selected?.value ?? 'all'
  if (!jobsStore.wsConnection || !jobsStore.wsConnected) {
    useToast().add({
      title: 'Not connected',
      description: 'WebSocket is disconnected — cannot change subject filter',
      color: 'warning',
      duration: 3000,
    })
    return
  }
  jobsStore.wsConnection.send(JSON.stringify({ type: 'set_subject_filter', subject_filter: next }))
}

// Star rating filter state - default to empty (show only unrated)
const selectedRatings = ref([])
const showUnrated = ref(false)

// Direct API call function to replace store method
const fetchJobsDirectly = async (page = 1, limit = 24, status = '', subjectUuid = '', sourceType = 'all') => {
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

    // Add rating filter
    if (selectedRatings.value.length > 0) {
      query.ratings = selectedRatings.value.join(',')
    }

    // Add unrated filter - only if showUnrated is true
    if (showUnrated.value) {
      query.unrated_only = 'true'
    }

    // Add preset filter
    if (selectedPresetFilter.value) {
      query.preset_id = selectedPresetFilter.value
    }

    const response = await useApiFetch('jobs/search', { query })

    if (response.results) {
      jobs.value = response.results
      // API returns total_jobs_count for the total number of jobs matching the filter
      totalJobs.value = response.total_jobs_count || response.total || response.total_count || response.count || 0
    } else if (response.jobs) {
      jobs.value = response.jobs
      totalJobs.value = response.total_jobs_count || response.total || response.total_count || response.count || 0
    } else if (Array.isArray(response)) {
      jobs.value = response
      totalJobs.value = response.length
    } else {
      jobs.value = []
      totalJobs.value = 0
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
const handleSubjectFilterSelection = async selected => {
  const startTime = performance.now()
  console.log(`👤 [SUBJECT DEBUG] handleSubjectFilterSelection started - selected:`, selected)

  return new Promise(resolve => {
    const performSelection = async () => {
      try {
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
        resolve()
      } catch (error) {
        console.error('Subject filter failed:', error)
        resolve()
      }
    }

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(performSelection)
    } else {
      setTimeout(performSelection, 0)
    }
  })
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
const handleSourceTypeFilterSelection = async selected => {
  const startTime = performance.now()
  console.log(`📁 [SOURCE TYPE DEBUG] handleSourceTypeFilterSelection started - selected: "${selected}"`)

  return new Promise(resolve => {
    const performSelection = async () => {
      try {
        selectedSourceTypeFilter.value = selected
        pageNumber.value = 1
        const statusFilter = currentFilter.value || ''
        const subjectUuid = selectedSubjectFilter?.value?.value || ''

        console.log(`📁 [SOURCE TYPE DEBUG] Starting jobs API call for source type filter...`)
        const apiStartTime = performance.now()

        await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, subjectUuid, selected)

        const apiTime = performance.now() - apiStartTime
        const totalTime = performance.now() - startTime
        console.log(`📁 [SOURCE TYPE DEBUG] Source type filter API calls completed in ${apiTime.toFixed(2)}ms`)
        console.log(`📁 [SOURCE TYPE DEBUG] handleSourceTypeFilterSelection completed in ${totalTime.toFixed(2)}ms`)
        resolve()
      } catch (error) {
        console.error('Source type filter failed:', error)
        resolve()
      }
    }

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(performSelection)
    } else {
      setTimeout(performSelection, 0)
    }
  })
}

const clearSourceTypeFilter = async () => {
  selectedSourceTypeFilter.value = 'all'
  pageNumber.value = 1
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter?.value?.value || ''

  await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, subjectUuid, 'all')
}

// Handle rating filter changes
const handleRatingFilterChange = () => {
  // Refresh jobs with new rating filter
  pageNumber.value = 1
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter?.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, subjectUuid, sourceTypeFilter)
}

// Computed properties
const totalPages = computed(() => Math.ceil(totalJobs.value / itemsPerPage.value))

// Check if any processing is currently active
const isAnyProcessingActive = computed(() => {
  const comfyuiRunningJobs = jobsStore.systemStatus?.comfyuiProcessing?.runningJobs || 0
  const localModeIsProcessing = processingMode.value !== 'idle'

  // Shared state from WebSocket (syncs across devices/tabs)
  const sharedProcessingActive = jobsStore.processingState?.isActive === true
  const anyActiveJob = (jobsStore.queueStatus?.queue?.active || 0) > 0

  return comfyuiRunningJobs > 0 || localModeIsProcessing || sharedProcessingActive || anyActiveJob
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
const filterByStatus = async status => {
  const startTime = performance.now()
  console.log(`🎯 [FILTER DEBUG] filterByStatus clicked - status: "${status}"`)

  // Use requestIdleCallback or setTimeout to prevent blocking
  return new Promise(resolve => {
    const performFilter = async () => {
      try {
        // Update local filter immediately for UI feedback
        currentFilter.value = status
        pageNumber.value = 1

        // Show loading state immediately with specific filter tracking
        loadingFilter.value = status
        isLoading.value = true

        // Clear jobs array in next tick to avoid blocking
        await nextTick()
        jobs.value = []

        // Fetch fresh jobs for this status
        const subjectUuid = selectedSubjectFilter?.value?.value || ''
        const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'

        await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, status, subjectUuid, sourceTypeFilter)

        const totalTime = performance.now() - startTime
        console.log(`🎯 [FILTER DEBUG] filterByStatus completed in ${totalTime.toFixed(2)}ms`)
        resolve()
      } catch (error) {
        console.error('Filter failed:', error)
        resolve()
      } finally {
        // Always reset loading state
        isLoading.value = false
        loadingFilter.value = ''
      }
    }

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(performFilter)
    } else {
      setTimeout(performFilter, 0)
    }
  })
}

const refreshJobsWithCurrentState = async () => {
  const startTime = performance.now()
  console.log(`🔄 [REFRESH DEBUG] refreshJobsWithCurrentState started`)

  return new Promise(resolve => {
    const performRefresh = async () => {
      try {
        const statusFilter = currentFilter.value || ''
        const subjectUuid = selectedSubjectFilter?.value?.value || ''
        const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'

        // Only fetch jobs for refresh - queue status is updated via WebSocket
        await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, subjectUuid, sourceTypeFilter)
        // Refresh the priority queue too so PRI badges stay in sync after picks/cancels
        fetchPriorityQueue()

        const totalTime = performance.now() - startTime
        console.log(`🔄 [REFRESH DEBUG] refreshJobsWithCurrentState completed in ${totalTime.toFixed(2)}ms`)
        resolve()
      } catch (error) {
        console.error('Refresh failed:', error)
        resolve()
      }
    }

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(performRefresh)
    } else {
      setTimeout(performRefresh, 0)
    }
  })
}

// WebSocket command acknowledgment tracker
const pendingAcks = ref(new Map())

// Helper function to wait for WebSocket acknowledgment
const waitForAck = (command, timeout = 5000) => {
  return new Promise(resolve => {
    const timeoutId = setTimeout(() => {
      pendingAcks.value.delete(command)
      resolve(false)
    }, timeout)

    pendingAcks.value.set(command, { resolve, timeoutId })
  })
}

// Handle WebSocket acknowledgments
const handleWebSocketAck = ackData => {
  // Add null safety check
  if (!ackData) {
    console.error('❌ handleWebSocketAck received null/undefined ackData')
    return
  }

  if (!ackData.command) {
    console.error('❌ handleWebSocketAck received ackData without command property:', ackData)
    return
  }

  const pending = pendingAcks.value.get(ackData.command)
  if (pending) {
    clearTimeout(pending.timeoutId)
    pending.resolve(ackData.success)
    pendingAcks.value.delete(ackData.command)
  } else {
    console.warn('⚠️ Received acknowledgment for command with no pending request:', ackData.command)
  }
}

// New processing methods for the updated UI - using WebSocket commands
// Entry point for the split "Process N" button — routes to single mode for N=1
// (preserves the existing 10-second idle wait) or to continuous-with-limit for N>1.
const startProcessNJobs = async () => {
  if (selectedJobCount.value <= 1) {
    await startSingleProcessing()
  } else {
    await startContinuousProcessing({ jobLimit: selectedJobCount.value })
  }
}

const startSingleProcessing = async () => {
  try {
    isStartingSingle.value = true
    processingMode.value = 'single' // Optimistic update

    const procType = effectiveProcessingSourceType()

    // Send command via WebSocket if connected
    if (jobsStore.wsConnection && jobsStore.wsConnected) {
      jobsStore.wsConnection.send(
        JSON.stringify({
          type: 'start_single',
          source_type: procType
        })
      )

      // Wait for acknowledgment with timeout
      const ackReceived = await waitForAck('start_single', 5000)

      if (ackReceived) {
        const toast = useToast()
        const typeLabel = procType === 'all' ? 'any' : procType
        toast.add({
          title: 'Single Job Processing Started',
          description: `Processing one ${typeLabel} job`,
          color: 'success',
          duration: 3000
        })
      } else {
        // Timeout - revert optimistic update
        processingMode.value = 'idle'
        const toast = useToast()
        toast.add({
          title: 'Command Timeout',
          description: 'No response from server',
          color: 'warning',
          duration: 3000
        })
      }
    } else {
      // Fallback to HTTP if WebSocket not connected
      console.warn('⚠️ WebSocket not connected, falling back to HTTP')
      const response = await useApiFetch('jobs/processing/single', {
        method: 'POST',
        body: {
          source_type: procType
        }
      })

      if (response.success) {
        const toast = useToast()
        const typeLabel = procType === 'all' ? 'any' : procType
        toast.add({
          title: 'Single Job Processing Started',
          description: response.message || `Processing one ${typeLabel} job`,
          color: 'success',
          duration: 3000
        })
      } else {
        processingMode.value = 'idle'
        const toast = useToast()
        toast.add({
          title: 'No Jobs to Process',
          description: response.message || 'No jobs available for processing',
          color: 'warning',
          duration: 2000
        })
      }
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

const startContinuousProcessing = async (options = {}) => {
  const jobLimit = options.jobLimit && options.jobLimit > 0 ? options.jobLimit : null
  const useSingleSpinner = jobLimit !== null
  try {
    // Split button reuses the "single" spinner so users see loading on the button they clicked
    if (useSingleSpinner) {
      isStartingSingle.value = true
    } else {
      isStartingContinuous.value = true
    }
    processingMode.value = 'continuous' // Optimistic update

    const procType = effectiveProcessingSourceType()

    // Send command via WebSocket if connected
    if (jobsStore.wsConnection && jobsStore.wsConnected) {
      jobsStore.wsConnection.send(
        JSON.stringify({
          type: 'start_continuous',
          source_type: procType,
          job_limit: jobLimit
        })
      )

      // Wait for acknowledgment with timeout
      const ackReceived = await waitForAck('start_continuous', 5000)

      if (ackReceived) {
        const toast = useToast()
        const typeLabel = procType === 'all' ? 'all' : procType
        toast.add({
          title: jobLimit ? `Processing ${jobLimit} Jobs` : 'Continuous Processing Started',
          description: jobLimit
            ? `Processing up to ${jobLimit} ${typeLabel} job${jobLimit === 1 ? '' : 's'} then stopping`
            : `Processing ${typeLabel} jobs continuously`,
          color: 'success',
          duration: 3000
        })
      } else {
        // Timeout - revert optimistic update
        processingMode.value = 'idle'
        const toast = useToast()
        toast.add({
          title: 'Command Timeout',
          description: 'No response from server',
          color: 'warning',
          duration: 3000
        })
      }
    } else {
      // Fallback to HTTP if WebSocket not connected
      console.warn('⚠️ WebSocket not connected, falling back to HTTP')
      const response = await useApiFetch('jobs/processing/continuous', {
        method: 'POST',
        body: {
          source_type: procType,
          job_limit: jobLimit
        }
      })

      if (response.success) {
        const toast = useToast()
        const typeLabel = procType === 'all' ? 'all' : procType
        toast.add({
          title: jobLimit ? `Processing ${jobLimit} Jobs` : 'Continuous Processing Started',
          description: response.message || (jobLimit
            ? `Processing up to ${jobLimit} ${typeLabel} job${jobLimit === 1 ? '' : 's'} then stopping`
            : `Processing ${typeLabel} jobs continuously`),
          color: 'success',
          duration: 3000
        })
      } else {
        processingMode.value = 'idle'
        const toast = useToast()
        toast.add({
          title: 'No Jobs to Process',
          description: response.message || 'No jobs available for processing',
          color: 'warning',
          duration: 2000
        })
      }
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
    if (useSingleSpinner) {
      isStartingSingle.value = false
    } else {
      isStartingContinuous.value = false
    }
  }
}

const stopAllProcessing = async () => {
  try {
    isStopping.value = true
    processingMode.value = 'idle' // Optimistic update

    // Send command via WebSocket if connected
    if (jobsStore.wsConnection && jobsStore.wsConnected) {
      jobsStore.wsConnection.send(
        JSON.stringify({
          type: 'stop_processing'
        })
      )

      // Wait for acknowledgment with timeout
      const ackReceived = await waitForAck('stop_processing', 5000)

      if (ackReceived) {
        const toast = useToast()
        toast.add({
          title: 'Processing Stopped',
          description: 'Continuous processing halted and current jobs interrupted. Models stay loaded.',
          color: 'success',
          duration: 3000
        })
      } else {
        // Timeout - show warning but keep the idle state
        const toast = useToast()
        toast.add({
          title: 'Stop Command Sent',
          description: 'Processing should stop shortly',
          color: 'warning',
          duration: 3000
        })
      }
    } else {
      // Fallback to HTTP if WebSocket not connected
      console.warn('⚠️ WebSocket not connected, falling back to HTTP')
      const response = await useApiFetch('jobs/processing/interrupt', {
        method: 'POST'
      })

      if (response.success) {
        const toast = useToast()
        toast.add({
          title: 'Processing Stopped',
          description: 'Continuous processing halted and current jobs interrupted. Models stay loaded.',
          color: 'success',
          duration: 3000
        })
      }
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

const forceRestartWorkers = async () => {
  try {
    isRestarting.value = true
    processingMode.value = 'idle' // Optimistic update

    // Send command via WebSocket if connected
    if (jobsStore.wsConnection && jobsStore.wsConnected) {
      jobsStore.wsConnection.send(
        JSON.stringify({
          type: 'force_restart_workers'
        })
      )

      const ackReceived = await waitForAck('force_restart_workers', 5000)

      const toast = useToast()
      if (ackReceived) {
        toast.add({
          title: 'Workers Restarting',
          description: 'Containers restarting — models will reload on the next job.',
          color: 'success',
          duration: 3000
        })
      } else {
        toast.add({
          title: 'Restart Command Sent',
          description: 'Workers should restart shortly',
          color: 'warning',
          duration: 3000
        })
      }
    } else {
      // Fallback to HTTP if WebSocket not connected
      console.warn('⚠️ WebSocket not connected, falling back to HTTP')
      const response = await useApiFetch('jobs/processing/force-restart', {
        method: 'POST'
      })

      if (response.success) {
        const toast = useToast()
        toast.add({
          title: 'Workers Restarting',
          description: 'Containers restarting — models will reload on the next job.',
          color: 'success',
          duration: 3000
        })
      }
    }
  } catch (error) {
    console.error('Failed to force restart workers:', error)

    const toast = useToast()
    toast.add({
      title: 'Restart Failed',
      description: error.data?.statusMessage || error.message || 'Failed to restart workers',
      color: 'error',
      duration: 4000
    })
  } finally {
    isRestarting.value = false
  }
}

// Handle pagination page changes
const handlePageChange = async newPage => {
  const startTime = performance.now()
  console.log(`📄 [PAGE DEBUG] handlePageChange started - newPage: ${newPage}`)

  pageNumber.value = newPage
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter?.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'

  console.log(`📄 [PAGE DEBUG] Starting jobs API call for page change...`)
  const apiStartTime = performance.now()

  await fetchJobsDirectly(newPage, itemsPerPage.value, statusFilter, subjectUuid, sourceTypeFilter)

  const apiTime = performance.now() - apiStartTime
  const totalTime = performance.now() - startTime
  console.log(`📄 [PAGE DEBUG] Page change API calls completed in ${apiTime.toFixed(2)}ms`)
  console.log(`📄 [PAGE DEBUG] handlePageChange completed in ${totalTime.toFixed(2)}ms`)
}

// Handle manual page navigation
const goToManualPage = () => {
  if (!manualPageInput.value) return

  const targetPage = Math.max(1, Math.min(manualPageInput.value, totalPages.value))

  if (targetPage !== pageNumber.value) {
    pageNumber.value = targetPage
    handlePageChange(targetPage)
  }

  // Clear the input
  manualPageInput.value = null
}

// Handle limit change
const handleLimitChange = async () => {
  const startTime = performance.now()
  console.log(`📊 [LIMIT DEBUG] handleLimitChange started - new limit: ${itemsPerPage.value}`)

  pageNumber.value = 1 // Reset to first page when changing limit
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter?.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'

  console.log(`📊 [LIMIT DEBUG] Starting parallel API calls for limit change...`)
  const apiStartTime = performance.now()

  // Fetch jobs and update queue status simultaneously
  await Promise.all([fetchJobsDirectly(1, itemsPerPage.value, statusFilter, subjectUuid, sourceTypeFilter), jobsStore.fetchQueueStatus()])

  const apiTime = performance.now() - apiStartTime
  const totalTime = performance.now() - startTime
  console.log(`📊 [LIMIT DEBUG] Limit change API calls completed in ${apiTime.toFixed(2)}ms`)
  console.log(`📊 [LIMIT DEBUG] handleLimitChange completed in ${totalTime.toFixed(2)}ms`)
}

const viewJobDetails = async jobId => {
  try {
    // Reset video ready states when opening a new job
    outputVideoReady.value = false
    destVideoReady.value = false

    const response = await useApiFetch(`jobs/${jobId}?include_thumbnails=true&thumbnail_size=md`)
    selectedJob.value = response.job // The media server returns {success: true, job: {...}}
    showJobModal.value = true
  } catch (error) {
    console.error('Failed to fetch job details:', error)
  }
}

const getStatusColor = status => {
  switch (status?.toLowerCase()) {
    case 'queued':
      return 'warning'
    case 'active':
      return 'info'
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'cancelled':
      return 'neutral'
    case 'need_input':
      return 'warning'
    default:
      return 'neutral'
  }
}

const formatDateCompact = dateString => {
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
const getStatusDisplayText = status => {
  if (status === 'need_input') {
    return 'input'
  }
  return status
}

// Get job actions for dropdown menu
const getJobActions = job => {
  const actions = []

  // Edit the preset this queued i2v job references. Since queued jobs resolve
  // params live from the preset row, saving the preset propagates to every
  // queued job using it — no per-job edit needed.
  if (job.status === 'queued' && job.job_type === 'i2v' && job.preset_id) {
    actions.push({
      label: 'Edit Preset',
      icon: 'i-heroicons-pencil-square',
      onSelect: async () => {
        if (submitJobModalRef.value?.editPresetFromJob) {
          await submitJobModalRef.value.editPresetFromJob(job)
        }
      }
    })
  }

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

  // Duplicate: open Submit Job modal pre-filled with this job's subject, source image, and params.
  // Only wired up for i2v since that's the flow with a single source image + tweakable params.
  if (job.job_type === 'i2v' && job.subject_uuid && job.source_media_uuid) {
    actions.push({
      label: 'Duplicate (Tweak)',
      icon: 'i-heroicons-document-duplicate',
      onSelect: async () => {
        if (submitJobModalRef.value?.duplicateFromJob) {
          await submitJobModalRef.value.duplicateFromJob(job)
        }
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
const openImageSelectionModal = async job => {
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
const handleJobChanged = newJob => {
  selectedJobForImage.value = newJob
}

// Handle job deletion from the modal
const handleJobDeleted = async () => {
  await refreshJobsWithCurrentState()
  // Refresh the need_input jobs list for the modal
  await fetchAllNeedInputJobs()
}

// Handle jobs created from submit job modal
const handleJobsCreated = async result => {
  // Edit mode shows its own toast inside the modal — don't double up.
  if (!result.edited) {
    const toast = useToast()
    toast.add({
      title: 'Jobs Created Successfully',
      description: `${result.successCount} job${result.successCount !== 1 ? 's' : ''} created successfully!`,
      color: 'green',
      duration: 3000
    })
  }

  // Refresh the jobs list to show new or updated jobs
  await refreshJobsWithCurrentState()
}

const openImageFullscreen = image => {
  // TODO: Implement image fullscreen functionality
  console.log('Opening image fullscreen:', image)
}

// Job cancellation method
const cancelJob = async job => {
  try {
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

    // Use confirm dialog for error messages only
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
const retryJob = async job => {
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
const requeueJob = async job => {
  try {
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

    // Use confirm dialog for error messages only
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
const deleteJob = async job => {
  console.log('🗑️ deleteJob called with job:', job.id)
  try {
    const { confirm } = useConfirmDialog()
    const { formatJobDeletePreview } = useDeletePreview()
    const toast = useToast()

    // Fetch deletion preview
    try {
      const preview = await useApiFetch(`jobs/${job.id}/delete-preview`)

      // Format the preview using the composable
      const { items, thisJobMediaCount } = formatJobDeletePreview(preview, job.id)

      console.log('🤔 Showing confirmation dialog with preview...')
      const result = await confirm({
        title: 'Delete Job',
        message: `Job ID: ${job.id}`,
        confirmLabel: 'Delete All',
        alternateLabel: 'Delete This',
        cancelLabel: 'Cancel',
        variant: 'error',
        items
      })

      console.log('✅ Confirmation result:', result)
      if (result === 'cancel') {
        console.log('❌ User cancelled deletion')
        return
      }

      // Determine if we should cascade based on user choice
      const shouldCascade = result === 'confirm'

      console.log('🚀 Making delete API call with cascade:', shouldCascade)
      const deleteUrl = shouldCascade ? `jobs/${job.id}/delete` : `jobs/${job.id}/delete?cascade=false`
      const deleteResult = await useApiFetch(deleteUrl, {
        method: 'DELETE'
      })
      console.log('✅ Delete API call completed, result:', deleteResult)

      // Show success toast
      if (shouldCascade) {
        toast.add({
          title: 'All Jobs Deleted Successfully',
          description: `Deleted ${preview.totalJobs} job(s) and ${preview.totalMediaRecords} media record(s).`,
          color: 'success',
          duration: 1000
        })
      } else {
        toast.add({
          title: 'Job Deleted Successfully',
          description: `Deleted this job and ${thisJobMediaCount} associated media record(s).`,
          color: 'success',
          duration: 1000
        })
      }

      // Refresh the jobs list after deletion
      await refreshJobsWithCurrentState()
      // Also refresh queue status to update counts
      await jobsStore.fetchQueueStatus()
    } catch (previewError) {
      console.error('Failed to fetch delete preview:', previewError)
      toast.add({
        title: 'Preview Failed',
        description: 'Failed to load deletion preview. Please try again.',
        color: 'error',
        duration: 3000
      })
    }
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
    console.log('🗑️ selectedJob exists, calling deleteJob and navigating to next')

    // Find current job index before deletion
    const currentIndex = jobs.value.findIndex(j => j.id === selectedJob.value.id)

    // Perform deletion (this will refresh the jobs list)
    await deleteJob(selectedJob.value)

    // After deletion, check if there are still jobs
    if (jobs.value.length > 0) {
      // Determine which job to show next
      let nextIndex = currentIndex

      // If current index is now beyond the array, go to the last job
      if (nextIndex >= jobs.value.length) {
        nextIndex = jobs.value.length - 1
      }

      // Navigate to the next job
      const nextJob = jobs.value[nextIndex]
      if (nextJob) {
        // Fetch full job details for the next job
        try {
          const response = await useApiFetch(`jobs/${nextJob.id}?include_thumbnails=true&thumbnail_size=md`)
          selectedJob.value = response.job
        } catch (error) {
          console.error('Failed to fetch next job details:', error)
          // Fallback to basic job data
          selectedJob.value = nextJob
        }
      }
    } else {
      // No more jobs, close the modal
      console.log('🗑️ No more jobs, closing modal')
      showJobModal.value = false
    }
  } else {
    console.log('❌ No selectedJob found!')
  }
}

// Reactively reflect a rating change made in the modal back into the jobs list,
// so the row's stars update without a manual refresh. Matches by media UUID
// against each job's output/dest media records.
const handleRatingChanged = ({ mediaUuid, rating }) => {
  if (!mediaUuid) return
  for (const job of jobs.value) {
    if (job.output_media && job.output_media.uuid === mediaUuid) job.output_media.rating = rating
    if (job.dest_media && job.dest_media.uuid === mediaUuid) job.dest_media.rating = rating
  }
}

// Handle job change from JobDetailsModal
const handleJobDetailsChanged = async newJob => {
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
// In-memory priority queue mirror — populated from /api/jobs/processing/priority-queue
// and updated optimistically on push-to-front actions. Used to render the PRI
// badge and ordinal on prioritized rows.
const priorityQueue = ref([])
const priorityQueueSet = computed(() => new Set(priorityQueue.value))
const priorityIndex = (jobId) => priorityQueue.value.indexOf(jobId)

const fetchPriorityQueue = async () => {
  try {
    const res = await useApiFetch('jobs/processing/priority-queue')
    priorityQueue.value = res?.queue || []
  } catch (e) {
    console.error('Failed to fetch priority queue:', e)
  }
}

const bulkPushToFront = async () => {
  const queuedSelected = selectedJobsArray.value.filter(jobId => {
    const job = jobs.value.find(j => j.id === jobId)
    return job && job.status === 'queued'
  })

  if (queuedSelected.length === 0) {
    const toast = useToast()
    toast.add({
      title: 'Nothing to prioritize',
      description: 'Only jobs in status=queued can be pushed to the front.',
      color: 'warning',
      duration: 3000
    })
    return
  }

  try {
    const response = await useApiFetch('jobs/processing/prioritize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { job_ids: queuedSelected }
    })
    priorityQueue.value = response?.queue || priorityQueue.value
    const toast = useToast()
    toast.add({
      title: 'Pushed to front',
      description: response?.message || `${queuedSelected.length} job(s) prioritized`,
      color: 'success',
      duration: 3000
    })
    clearSelection()
  } catch (error) {
    console.error('Failed to push jobs to front:', error)
    const toast = useToast()
    toast.add({
      title: 'Push to Front Failed',
      description: error?.data?.statusMessage || error?.message || 'Could not prioritize jobs',
      color: 'error',
      duration: 4000
    })
  }
}

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

  if (confirmed !== 'confirm') return

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
  const { formatJobDeletePreview } = useDeletePreview()
  const toast = useToast()

  try {
    // Fetch delete previews for all selected jobs
    const previewsData = await Promise.all(
      selectedJobsArray.value.map(async jobId => {
        try {
          const preview = await useApiFetch(`jobs/${jobId}/delete-preview`)
          return { jobId, preview }
        } catch (err) {
          console.error(`Failed to fetch preview for job ${jobId}:`, err)
          return { jobId, preview: null }
        }
      })
    )

    // Format previews using the composable
    const items = []
    let thisJobMediaCount = 0
    let totalMediaCount = 0
    let totalJobsCount = selectedJobs.value.size
    const validPreviews = previewsData.filter(p => p.preview !== null)

    // Collect all "Delete This" sections
    const thisJobSections = []
    validPreviews.forEach(({ jobId, preview }) => {
      if (!preview.targetJob) return

      const formatted = formatJobDeletePreview(preview, jobId)
      thisJobMediaCount += formatted.thisJobMediaCount

      // Get the "Delete This" section
      const thisSection = formatted.items.find(item => item.label.includes('Delete This'))
      if (thisSection) {
        thisJobSections.push(...thisSection.items)
      }
    })

    // Add "Delete This" section
    if (thisJobSections.length > 0) {
      items.push({
        label: `"Delete This" will remove (${selectedJobs.value.size} jobs):`,
        items: thisJobSections
      })
    }

    // Collect all "Delete All" sections
    const allJobSections = []
    validPreviews.forEach(({ jobId, preview }) => {
      if (!preview.targetJob) return

      const formatted = formatJobDeletePreview(preview, jobId)

      // Get the "Delete All" section if it exists
      const allSection = formatted.items.find(item => item.label.includes('Delete All'))
      if (allSection) {
        allJobSections.push(...allSection.items)
        // Count additional items from cascade
        totalMediaCount += preview.willDelete.mediaRecords.length
        totalJobsCount += preview.willDelete.jobs.length
      }
    })

    // Add "Delete All" section if there are cascade items
    if (allJobSections.length > 0) {
      items.push({
        label: `"Delete All" will remove (${totalJobsCount} jobs + related):`,
        items: allJobSections
      })
    }

    const result = await confirm({
      title: 'Delete Selected Jobs',
      message: `${selectedJobs.value.size} job(s) selected`,
      confirmLabel: 'Delete All',
      alternateLabel: 'Delete This',
      cancelLabel: 'Cancel',
      variant: 'error',
      items
    })

    if (result === 'cancel') return

    // Determine cascade based on user choice
    const shouldCascade = result === 'confirm'

    // Proceed with deletion
    for (const jobId of selectedJobsArray.value) {
      const deleteUrl = shouldCascade ? `jobs/${jobId}/delete` : `jobs/${jobId}/delete?cascade=false`
      await useApiFetch(deleteUrl, { method: 'DELETE' })
    }

    // Show success toast
    if (shouldCascade) {
      toast.add({
        title: 'All Jobs Deleted Successfully',
        description: `Deleted ${totalJobsCount} job(s) and ${totalMediaCount} media record(s).`,
        color: 'success',
        duration: 2000
      })
    } else {
      toast.add({
        title: 'Jobs Deleted Successfully',
        description: `Deleted ${selectedJobs.value.size} job(s) and ${thisJobMediaCount} output media file(s).`,
        color: 'success',
        duration: 2000
      })
    }

    clearSelection()
    await refreshJobsWithCurrentState()
    await jobsStore.fetchQueueStatus()
  } catch (error) {
    console.error('Failed to delete jobs:', error)

    let errorMessage = 'Failed to delete some jobs. Please try again.'
    if (error.data?.statusMessage) {
      errorMessage = error.data.statusMessage
    } else if (error.message) {
      errorMessage = error.message
    }

    await confirm({
      title: 'Error',
      message: errorMessage,
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

// Reset video states when modal is closed
watch(showJobModal, isOpen => {
  if (!isOpen) {
    outputVideoReady.value = false
    destVideoReady.value = false
  }
})

// Clear selection when page changes or filters change
watch([pageNumber, currentFilter, selectedSubjectFilter, selectedSourceTypeFilter], () => {
  clearSelection()
})

// Re-fetch jobs whenever the preset filter changes
watch(selectedPresetFilter, async () => {
  pageNumber.value = 1
  clearSelection()
  const statusFilter = currentFilter.value || ''
  const subjectUuid = selectedSubjectFilter?.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  await fetchJobsDirectly(pageNumber.value, itemsPerPage.value, statusFilter, subjectUuid, sourceTypeFilter)
})

// Watch for processing status changes from the backend
watch(
  () => jobsStore.systemStatus?.comfyuiProcessing?.status,
  newStatus => {
    // If ComfyUI goes idle and we're not in the middle of starting something, reset mode
    if (newStatus === 'idle' && !isStartingSingle.value && !isStartingContinuous.value) {
      processingMode.value = 'idle'
    }
  }
)

// Also reset processing mode when active job count drops to 0
// (covers i2v/t2v cases where comfyui status doesn't transition)
watch(
  () => jobsStore.queueStatus?.queue?.active,
  (newActive) => {
    if (newActive === 0 && !isStartingSingle.value && !isStartingContinuous.value) {
      processingMode.value = 'idle'
    }
  }
)

// Sync local processingMode from shared store state (multi-device sync)
watch(
  () => jobsStore.processingState,
  (state) => {
    if (!state) return
    if (state.isActive) {
      processingMode.value = state.isContinuous ? 'continuous' : 'single'
    } else if (!isStartingSingle.value && !isStartingContinuous.value) {
      processingMode.value = 'idle'
    }
  },
  { deep: true, immediate: true }
)

// WebSocket event listeners for command acknowledgments
const handleCommandAck = event => {
  handleWebSocketAck(event.detail)
}

const handleCommandError = event => {
  handleWebSocketAck({ ...event.detail, success: false })
}

const handleStateCorrection = event => {
  const toast = useToast()
  toast.add({
    title: 'State Corrected',
    description: event.detail.reason || 'Processing state was corrected by server',
    color: 'warning',
    duration: 5000
  })

  // Update local state based on correction
  // Any state correction when oldState was processing means we're now idle
  if (event.detail.oldState?.includes('idle_with_active_jobs') || event.detail.newState === 'jobs_returned_to_queue' || event.detail.newState === 'idle') {
    processingMode.value = 'idle'
  }
}

// Lifecycle
onMounted(async () => {
  // Reset processing mode on page load
  processingMode.value = 'idle'

  // Add WebSocket event listeners
  window.addEventListener('ws-command-ack', handleCommandAck)
  window.addEventListener('ws-command-error', handleCommandError)
  window.addEventListener('ws-state-correction', handleStateCorrection)

  // Fetch initial data (queue status, system status, etc.)
  await jobsStore.fetchInitialData()

  // Determine which filter to use based on queue status counts
  const needInputCount = jobsStore.queueStatus?.queue?.need_input || 0
  const defaultFilter = needInputCount > 0 ? 'need_input' : 'completed'

  // Set the filter and fetch jobs
  currentFilter.value = defaultFilter
  await fetchJobsDirectly(1, itemsPerPage.value, defaultFilter, '', 'all')

  // Load the priority queue so PRI badges/ordinals render on first paint
  await fetchPriorityQueue()
})

onUnmounted(() => {
  // Remove WebSocket event listeners
  window.removeEventListener('ws-command-ack', handleCommandAck)
  window.removeEventListener('ws-command-error', handleCommandError)
  window.removeEventListener('ws-state-correction', handleStateCorrection)

  // WebSocket cleanup is now handled globally by the websocket plugin
  // Just clear any page-specific state here if needed
})

// Page head
useHead({
  title: 'Jobs - Media Server Job System',
  meta: [{ name: 'description', content: 'Monitor and manage video processing jobs' }]
})
</script>
