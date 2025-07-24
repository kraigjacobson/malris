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
            <!-- Play/Pause Toggle -->
            <UButton
              type="button"
              size="xs"
              :variant="jobsStore.isProcessing ? 'solid' : 'outline'"
              :color="jobsStore.isProcessing ? 'red' : 'green'"
              @click.prevent="jobsStore.toggleProcessing()"
              :disabled="jobsStore.isLoading"
            >
              <UIcon
                :name="jobsStore.isProcessing ? 'i-heroicons-pause' : 'i-heroicons-play'"
                class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2"
              />
              <span class="hidden sm:inline">{{ jobsStore.isProcessing ? 'Pause' : 'Play' }}</span>
            </UButton>
            
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
              @click.prevent="() => refreshJobsWithCurrentState()"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" :class="{ 'animate-spin': jobsStore.isLoading }" />
              <span class="hidden sm:inline">Refresh</span>
            </UButton>
          </div>
        </div>
      </template>

      <!-- Mobile: Compact grid layout with more buttons per row -->
      <div class="grid grid-cols-4 gap-1 sm:hidden">
        <div
          class="text-center p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          :class="{ 'border-2 border-blue-500': jobsStore.filters.status === '' }"
          @click="filterByStatus('')"
        >
          <div class="text-sm font-bold text-blue-600 dark:text-blue-400">
            {{ jobsStore.queueStatus?.queue?.total || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Total</div>
        </div>
        <div
          class="text-center p-1.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-md cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
          :class="{ 'border-2 border-yellow-500': jobsStore.filters.status === 'queued' }"
          @click="filterByStatus('queued')"
        >
          <div class="text-sm font-bold text-yellow-600 dark:text-yellow-400">
            {{ jobsStore.queueStatus?.queue?.queued || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Queue</div>
        </div>
        <div
          class="text-center p-1.5 bg-green-50 dark:bg-green-900/20 rounded-md cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          :class="{ 'border-2 border-green-500': jobsStore.filters.status === 'active' }"
          @click="filterByStatus('active')"
        >
          <div class="text-sm font-bold text-green-600 dark:text-green-400">
            {{ jobsStore.queueStatus?.queue?.active || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Active</div>
        </div>
        <div
          class="text-center p-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-md cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          :class="{ 'border-2 border-purple-500': jobsStore.filters.status === 'completed' }"
          @click="filterByStatus('completed')"
        >
          <div class="text-sm font-bold text-purple-600 dark:text-purple-400">
            {{ jobsStore.queueStatus?.queue?.completed || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Done</div>
        </div>
        <div
          class="text-center p-1.5 bg-red-50 dark:bg-red-900/20 rounded-md cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          :class="{ 'border-2 border-red-500': jobsStore.filters.status === 'failed' }"
          @click="filterByStatus('failed')"
        >
          <div class="text-sm font-bold text-red-600 dark:text-red-400">
            {{ jobsStore.queueStatus?.queue?.failed || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Failed</div>
        </div>
        <div
          class="text-center p-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-md cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          :class="{ 'border-2 border-orange-500': jobsStore.filters.status === 'need_input' }"
          @click="filterByStatus('need_input')"
        >
          <div class="text-sm font-bold text-orange-600 dark:text-orange-400">
            {{ jobsStore.queueStatus?.queue?.need_input || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Input</div>
        </div>
        <div
          class="text-center p-1.5 bg-gray-200 dark:bg-gray-700 rounded-md cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          :class="{ 'border-2 border-gray-500': jobsStore.filters.status === 'canceled' }"
          @click="filterByStatus('canceled')"
        >
          <div class="text-sm font-bold text-gray-700 dark:text-gray-300">
            {{ jobsStore.queueStatus?.queue?.canceled || 0 }}
          </div>
          <div class="text-xs text-gray-700 dark:text-gray-300">Cancel</div>
        </div>
      </div>

      <!-- Desktop: Original grid layout -->
      <div class="hidden sm:grid grid-cols-3 md:grid-cols-7 gap-4">
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
          :class="{ 'border-2 border-gray-500': jobsStore.filters.status === 'canceled' }"
          @click="filterByStatus('canceled')"
        >
          <div class="text-2xl font-bold text-gray-700 dark:text-gray-300">
            {{ jobsStore.queueStatus?.queue?.canceled || 0 }}
          </div>
          <div class="text-sm text-gray-700 dark:text-gray-300">Canceled</div>
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
            @click="clearSubjectFilter"
            :disabled="!selectedSubjectFilter"
          >
            <span class="inline">Clear Subject</span>
          </UButton>
          <UButton
            type="button"
            variant="outline"
            size="xs"
            @click="clearSourceTypeFilter"
            :disabled="selectedSourceTypeFilter === 'all'"
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
              color="red"
              variant="outline"
              @click="bulkCancel"
            >
              Cancel Selected
            </UButton>
            <UButton
              size="xs"
              color="red"
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
      </template>

      <div v-if="jobsStore.jobs.length === 0 && !jobsStore.isLoading" class="text-center py-8 text-gray-500 dark:text-gray-400">
        No jobs found
      </div>

      <div v-else-if="jobsStore.jobs.length === 0 && jobsStore.isLoading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
      </div>

      <div v-else class="h-80 sm:h-96 overflow-y-auto space-y-1 sm:space-y-2 pr-1 sm:pr-2">
        <div
          v-for="job in jobsStore.jobs"
          :key="job.id"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative cursor-pointer"
          :class="{ 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600': selectedJobs.has(job.id) }"
          @click="viewJobDetails(job.id)"
        >
          <!-- Main job info row -->
          <div class="flex items-center justify-between" :class="['queued', 'active'].includes(job.status) ? 'pr-24' : 'pr-12'">
            <div class="flex items-center space-x-1 sm:space-x-3 min-w-0 flex-1">
              <!-- Checkbox -->
              <UCheckbox
                :model-value="selectedJobs.has(job.id)"
                @update:model-value="(checked) => toggleJobSelection(job.id, checked)"
                @click.stop
              />
              <UBadge
                :color="getStatusColor(job.status)"
                variant="solid"
                size="xs"
              >
                {{ job.status }}
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
                color="blue"
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
              <!-- Desktop: Show progress bar when available -->
              <div v-if="job.progress && job.progress > 0 && job.progress < 100" class="hidden sm:flex items-center space-x-2">
                <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <div
                    class="bg-blue-600 h-1 rounded-full transition-all duration-300"
                    :style="{ width: `${job.progress}%` }"
                  />
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ job.progress }}%</span>
              </div>
              <!-- Mobile: Always show time since updated (never progress bar) -->
              <div class="sm:hidden ml-auto">
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatDateCompact(job.updated_at) }}</span>
              </div>
            </div>
            
            <div class="flex items-center space-x-1 sm:space-x-2 shrink-0">
              <span class="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
                {{ formatDateCompact(job.updated_at) }}
              </span>
              <div class="flex gap-1 ml-2">
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
             </div>
            </div>
          </div>
          
          <!-- Full-height cancel button positioned absolutely (when applicable) -->
          <div
            v-if="['queued', 'active'].includes(job.status)"
            class="absolute top-0 right-12 h-full w-12 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 flex items-center justify-center border-l border-gray-200 dark:border-gray-700 cursor-pointer"
            @click.stop="cancelJob(job)"
          >
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-red-500 dark:text-red-400" />
          </div>
          
          <!-- Full-height dropdown button positioned absolutely -->
          <div class="absolute top-0 right-0 h-full w-12 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center rounded-r-lg">
            <UDropdownMenu
              :items="getJobActions(job)"
              :ui="{ content: 'w-48' }"
            >
              <div
                class="h-full w-full flex items-center justify-center cursor-pointer"
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
          v-model:page="currentPage"
          :total="jobsStore.totalJobs"
          :items-per-page="itemsPerPage"
          :max="5"
          @update:page="handlePageChange"
        />
      </div>
    </UCard>

    <!-- Job Details Modal -->
    <UModal v-model:open="showJobModal">
      <template #header>
        <h3 class="text-lg font-semibold">Job Details</h3>
      </template>
      
      <template #body>
        <div v-if="selectedJob">
          <!-- Thumbnails Section (only show when displayImages is true) -->
          <div v-if="settingsStore.displayImages" class="space-y-3">
            <h4 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white">Media Thumbnails</h4>
            <div class="flex flex-wrap gap-2 sm:gap-4 justify-center">
              <!-- Subject Thumbnail -->
              <div v-if="selectedJob.subject_thumbnail_uuid" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
                <div class="mb-1 sm:mb-2 text-center">
                  <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Subject</span>
                </div>
                <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4]">
                  <img
                    :src="`/api/media/${selectedJob.subject_thumbnail_uuid}/image`"
                    alt="Subject thumbnail"
                    class="w-full h-full object-cover object-top"
                  />
                </div>
              </div>
              
              <!-- Source Image Thumbnail -->
              <div v-if="selectedJob.source_media_thumbnail_uuid" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
                <div class="mb-1 sm:mb-2 text-center">
                  <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Source Image</span>
                </div>
                <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4]">
                  <img
                    :src="`/api/media/${selectedJob.source_media_thumbnail_uuid}/image`"
                    alt="Source image thumbnail"
                    class="w-full h-full object-cover object-top"
                  />
                </div>
              </div>
              
              <!-- Destination Media Thumbnail -->
              <div v-if="selectedJob.dest_media_thumbnail_uuid" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
                <div class="mb-1 sm:mb-2 text-center">
                  <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Destination Video</span>
                </div>
                <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4] relative group">
                  <!-- Show thumbnail first, then replace with video when ready -->
                  <img
                    v-if="selectedJob.dest_media_thumbnail_uuid && (!destVideoReady)"
                    :src="`/api/media/${selectedJob.dest_media_thumbnail_uuid}/image`"
                    alt="Destination media thumbnail"
                    class="w-full h-full object-cover object-top"
                  />
                  <!-- Video player for destination video -->
                  <video
                    v-if="selectedJob.dest_media_uuid"
                    :src="`/api/stream/${selectedJob.dest_media_uuid}`"
                    autoplay
                    loop
                    muted
                    class="w-full h-full object-cover object-top group-hover:[&::-webkit-media-controls]:opacity-100 [&::-webkit-media-controls]:opacity-0 [&::-webkit-media-controls]:transition-opacity"
                    preload="metadata"
                    controls
                    @loadeddata="destVideoReady = true"
                    @error="destVideoReady = false"
                  >
                    <source :src="`/api/stream/${selectedJob.dest_media_uuid}`" type="video/mp4">
                    Your browser does not support the video tag.
                  </video>
                </div>
              </div>
              
              <!-- Output Images/Video Section -->
              <div v-if="selectedJob.status === 'completed' && selectedJob.output_uuid" class="flex-1 min-w-0 max-w-32 sm:max-w-40">
                <div class="mb-1 sm:mb-2 text-center">
                  <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Output Video</span>
                </div>
                <div class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-[3/4] relative group">
                  <!-- Show thumbnail first, then replace with video when ready -->
                  <img
                    v-if="selectedJob.output_thumbnail_uuid && (!outputVideoReady)"
                    :src="`/api/media/${selectedJob.output_thumbnail_uuid}/image`"
                    alt="Output thumbnail"
                    class="w-full h-full object-cover object-top"
                  />
                  <!-- Video player for completed jobs -->
                  <video
                    :src="`/api/stream/${selectedJob.output_uuid}`"
                    autoplay
                    loop
                    muted
                    class="w-full h-full object-cover object-top group-hover:[&::-webkit-media-controls]:opacity-100 [&::-webkit-media-controls]:opacity-0 [&::-webkit-media-controls]:transition-opacity"
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
            
            <!-- Job Output Images Section (for need_input status, only show when displayImages is true) -->
            <div v-if="selectedJob.status === 'need_input' && jobOutputImages.length > 0 && settingsStore.displayImages" class="mt-6">
              <h4 class="text-sm sm:text-base font-medium text-gray-900 dark:text-white mb-3">Generated Images</h4>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
                <div
                  v-for="image in jobOutputImages"
                  :key="image.uuid"
                  class="bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-square relative group cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                  @click="openImageFullscreen(image)"
                >
                  <img
                    v-if="image.thumbnail"
                    :src="image.thumbnail"
                    :alt="image.filename"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <UIcon name="i-heroicons-photo" class="w-8 h-8 text-gray-400" />
                  </div>
                  <!-- Overlay with filename -->
                  <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {{ image.filename }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Job Details Accordion -->
          <div class="mt-4">
            <UAccordion :items="jobDetailsAccordionItems">
              <template #job-details>
                <div class="space-y-3 text-left">
                  <!-- Basic Info Grid -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Created</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(selectedJob.created_at) }}</span>
                    </div>
                    <div v-if="selectedJob.updated_at" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Updated</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(selectedJob.updated_at) }}</span>
                    </div>
                    <div v-if="selectedJob.completed_at" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Completed</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(selectedJob.completed_at) }}</span>
                    </div>
                  </div>
                  
                  <!-- ID -->
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">ID</span>
                    <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedJob.id }}</span>
                  </div>
                  
                  <!-- UUIDs Grid -->
                  <div v-if="selectedJob.source_media_uuid || selectedJob.dest_media_uuid || selectedJob.subject_uuid || selectedJob.output_uuid" class="space-y-2">
                    <div v-if="selectedJob.subject_uuid" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Subject UUID</span>
                      <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedJob.subject_uuid }}</span>
                    </div>
                    <div v-if="selectedJob.source_media_uuid" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Source UUID</span>
                      <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedJob.source_media_uuid }}</span>
                    </div>
                    <div v-if="selectedJob.dest_media_uuid" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Destination UUID</span>
                      <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedJob.dest_media_uuid }}</span>
                    </div>
                    <div v-if="selectedJob.output_uuid" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Output UUID</span>
                      <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedJob.output_uuid }}</span>
                    </div>
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
      </template>
      
      <template #footer>
        <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-between">
          <!-- Action buttons - left side on desktop, full width on mobile -->
          <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 order-2 sm:order-1">
            <UButton
              v-if="selectedJob && ['queued', 'active'].includes(selectedJob.status)"
              color="red"
              variant="outline"
              icon="i-heroicons-x-mark"
              size="sm"
              @click="cancelJobFromModal"
              class="w-full sm:w-auto"
            >
              <span class="hidden sm:inline">Cancel Job</span>
              <span class="sm:hidden">Cancel</span>
            </UButton>
            <UButton
              v-if="selectedJob && ['canceled', 'failed', 'completed', 'need_input'].includes(selectedJob.status)"
              color="primary"
              variant="outline"
              icon="i-heroicons-arrow-path"
              size="sm"
              @click="retryJobFromModal"
              class="w-full sm:w-auto"
            >
              <span class="hidden sm:inline">Retry Job</span>
              <span class="sm:hidden">Retry</span>
            </UButton>
            <UButton
              v-if="selectedJob"
              color="red"
              variant="outline"
              icon="i-heroicons-trash"
              size="sm"
              @click="deleteJobFromModal"
              class="w-full sm:w-auto"
            >
              <span class="hidden sm:inline">Delete Job</span>
              <span class="sm:hidden">Delete</span>
            </UButton>
          </div>
          
          <!-- Close button - right side on desktop, full width on mobile -->
          <div class="order-1 sm:order-2">
            <UButton
              variant="outline"
              @click="showJobModal = false"
              class="w-full sm:w-auto"
            >
              Close
            </UButton>
          </div>
        </div>
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
import { useSettingsStore } from '~/stores/settings'

// Page metadata
definePageMeta({
  title: 'Jobs'
})

// Use the jobs store
const jobsStore = useJobsStore()
const settingsStore = useSettingsStore()

// Local modal state
const showJobModal = ref(false)
const selectedJob = ref(null)
const outputVideoReady = ref(false)
const destVideoReady = ref(false)
const jobOutputImages = ref([])

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

// Bulk selection state
const selectedJobs = ref(new Set())

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

// Subject filter handlers
const handleSubjectFilterSelection = async (selected) => {
  handleSubjectSelection(selected)
  if (selected && selected.value) {
    // Filter jobs by subject UUID
    currentFilter.value = `subject:${selected.value}`
    currentPage.value = 1
    const statusFilter = jobsStore.filters.status || ''
    const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
    await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, selected.value, sourceTypeFilter)
  } else {
    await clearSubjectFilter()
  }
}

const clearSubjectFilter = async () => {
  clearSubject()
  currentFilter.value = ''
  currentPage.value = 1
  const statusFilter = jobsStore.filters.status || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, '', sourceTypeFilter)
}

// Source type filter handlers
const handleSourceTypeFilterSelection = async (selected) => {
  selectedSourceTypeFilter.value = selected
  currentPage.value = 1
  const statusFilter = jobsStore.filters.status || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, subjectUuid, selected)
}

const clearSourceTypeFilter = async () => {
  selectedSourceTypeFilter.value = 'all'
  currentPage.value = 1
  const statusFilter = jobsStore.filters.status || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, subjectUuid, 'all')
}

// Computed properties
const totalPages = computed(() => Math.ceil(jobsStore.totalJobs / itemsPerPage))

// Bulk selection computed properties
const visibleJobIds = computed(() => jobsStore.jobs.map(job => job.id))
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
  // Update local filter immediately
  currentFilter.value = status
  currentPage.value = 1
  
  // Also update store for UI consistency
  jobsStore.filters.status = status
  jobsStore.filters.jobId = ''
  jobsStore.filters.jobType = ''
  
  // Fetch jobs with new filter
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, status, subjectUuid, sourceTypeFilter)
}

const refreshJobsWithCurrentState = async () => {
  const statusFilter = jobsStore.filters.status || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  await Promise.all([
    jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, subjectUuid, sourceTypeFilter),
    jobsStore.fetchQueueStatus()
  ])
}

// Handle pagination page changes
const handlePageChange = async (newPage) => {
  currentPage.value = newPage
  const statusFilter = jobsStore.filters.status || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  await jobsStore.fetchJobs(true, newPage, itemsPerPage, statusFilter, subjectUuid, sourceTypeFilter)
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

// Image selection methods
const openImageSelection = (job) => {
  selectedJobForImage.value = job
  showImageModal.value = true
}

const handleImageSelected = async () => {
  await refreshJobsWithCurrentState()
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

// Bulk operation methods
const bulkQueue = async () => {
  const jobsToQueue = selectedJobsArray.value.filter(jobId => {
    const job = jobsStore.jobs.find(j => j.id === jobId)
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
    const job = jobsStore.jobs.find(j => j.id === jobId)
    return job && ['queued', 'active'].includes(job.status)
  })
  
  if (jobsToCancel.length === 0) {
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'No Jobs to Cancel',
      message: 'Selected jobs cannot be canceled. Only queued or active jobs can be canceled.',
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

// Handle page visibility changes
const handleVisibilityChange = () => {
  if (document.hidden) {
    jobsStore.stopAutoRefresh()
  } else if (jobsStore.autoRefreshEnabled) {
    jobsStore.startAutoRefresh()
  }
}


// Reset video states when modal is closed
watch(showJobModal, (isOpen) => {
  if (!isOpen) {
    outputVideoReady.value = false
    destVideoReady.value = false
  }
})

// Clear selection when page changes or filters change
watch([currentPage, () => jobsStore.filters.status, selectedSubjectFilter, selectedSourceTypeFilter], () => {
  clearSelection()
})


// Lifecycle
onMounted(() => {
  jobsStore.fetchInitialData()
  
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

