<template>
  <UModal v-model:open="isOpen" :dismissible="presetEditMode" :fullscreen="isMobile" :ui="{ content: 'fixed bg-default divide-y divide-default flex flex-col focus:outline-none w-full h-full sm:w-[95vw] sm:h-auto sm:max-w-7xl lg:w-[90vw]' }">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2 min-w-0">
          <h3 class="text-lg font-semibold">{{ presetEditMode ? 'Edit Preset' : 'Submit Job' }}</h3>
          <UBadge v-if="selectedJobTypeLabel && !presetEditMode" color="primary" variant="soft" size="md" class="truncate">
            {{ selectedJobTypeLabel }}
          </UBadge>
        </div>
        <UButton variant="ghost" size="lg" icon="i-heroicons-x-mark" @click="closeModal" :disabled="isSubmitting" class="ml-4" />
      </div>
    </template>

    <template #body>
      <div class="flex flex-col h-[75vh] min-h-[600px]">
        <!-- Job Type Selection -->
        <div v-if="!selectedJobType" class="flex-shrink-0">
          <div class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">Choose job type:</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <UButton variant="outline" size="sm" class="h-14 flex flex-col items-center justify-center space-y-0.5 text-center" @click="selectedJobType = 'vid_faceswap'">
                <UIcon name="i-heroicons-face-smile-20-solid" class="w-4 h-4" />
                <span class="text-xs font-medium leading-tight">Faceswap I2V Legacy</span>
                <span class="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">src image · dest video</span>
              </UButton>
              <UButton variant="outline" size="sm" class="h-14 flex flex-col items-center justify-center space-y-0.5 text-center" @click="startFsWorkflow">
                <UIcon name="i-heroicons-photo-20-solid" class="w-4 h-4" />
                <span class="text-xs font-medium leading-tight">Faceswap I2I</span>
                <span class="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">src image · dest image</span>
              </UButton>
              <UButton variant="outline" size="sm" class="h-14 flex flex-col items-center justify-center space-y-0.5 text-center" @click="startI2vWorkflow">
                <UIcon name="i-heroicons-video-camera-20-solid" class="w-4 h-4" />
                <span class="text-xs font-medium leading-tight">Wan I2V</span>
                <span class="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">src image · wan presets</span>
              </UButton>
              <UButton variant="outline" size="sm" class="h-14 flex flex-col items-center justify-center space-y-0.5 text-center" @click="startTaggingWorkflow">
                <UIcon name="i-heroicons-tag-20-solid" class="w-4 h-4" />
                <span class="text-xs font-medium leading-tight">Tagging</span>
              </UButton>
            </div>
          </div>
        </div>

        <!-- Face Swap: Workflow Selection -->
        <div v-if="selectedJobType === 'vid_faceswap' && !workflowMode" class="flex-shrink-0">
          <div class="text-center">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">Choose your workflow:</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <UButton variant="outline" size="sm" class="h-12 flex flex-col items-center justify-center space-y-1" @click="startSubjectFirstWorkflow">
                <UIcon name="i-heroicons-user-20-solid" class="w-4 h-4" />
                <span class="text-xs font-medium">Select Subject First</span>
              </UButton>
              <UButton variant="outline" size="sm" class="h-12 flex flex-col items-center justify-center space-y-1" @click="startVideoFirstWorkflow">
                <UIcon name="i-heroicons-film-20-solid" class="w-4 h-4" />
                <span class="text-xs font-medium">Select Video First</span>
              </UButton>
            </div>
          </div>
        </div>

        <!-- I2V Workflow -->
        <div v-if="selectedJobType === 'i2v'" class="flex flex-col flex-1 min-h-0">
          <!-- Preset Edit Mode: form only, the form's own Update button is the action -->
          <div v-if="presetEditMode" class="flex flex-col flex-1 min-h-0">
            <p class="flex-shrink-0 text-xs text-gray-400 mb-2">
              Editing the preset's parameters. Click <span class="font-medium">Update</span> at the top to save — all queued jobs using this preset will pick up the new values automatically.
            </p>
            <div class="flex-1 min-h-0 overflow-y-auto">
              <I2vJobForm v-model="i2vParams" :loras="availableLoras" />
            </div>
          </div>

          <!-- Shared filter section (applies to both bulk and per-subject modes) -->
          <div v-if="!presetEditMode" class="flex-shrink-0 mb-2 p-2 bg-gray-800 rounded-lg flex items-center gap-2">
            <span class="text-xs text-gray-400">Filter:</span>
            <USelect v-model="i2vSourceJobTypeFilter" :items="i2vSourceJobTypeFilterOptions" size="xs" class="w-44" />
          </div>

          <!-- Bulk Mode Toggle -->
          <div v-if="!presetEditMode" class="flex-shrink-0 mb-2 p-2 bg-gray-800 rounded-lg flex items-center gap-2">
            <UCheckbox v-model="bulkMode" />
            <span class="text-sm">
              Auto-queue every favorited
              <template v-if="i2vSourceJobTypeFilter !== 'all'">
                <span class="font-medium text-primary">{{ i2vSourceJobTypeFilterLabel }}</span>
              </template>
              source image
            </span>
          </div>

          <!-- Bulk Mode: parameters only (skips subject + image selection) -->
          <div v-if="!presetEditMode && bulkMode" class="flex flex-col flex-1 min-h-0">
            <p class="flex-shrink-0 text-xs text-gray-400 mb-2">
              One i2v job will be created for every source image marked as favorite (set from the Manage Subject modal). All jobs share the settings below.
            </p>
            <div class="flex-1 min-h-0 overflow-y-auto">
              <I2vJobForm v-model="i2vParams" :loras="availableLoras" />
            </div>
          </div>

          <!-- Step 1: Subject Selection -->
          <div v-if="!presetEditMode && !bulkMode && !i2vSelectedSubject" class="flex flex-col flex-1 min-h-0">
            <SubjectSearchFilters ref="i2vSubjectSearchFilters" @search="searchSubjects" @clear="clearSubjectFilters" class="flex-shrink-0 mb-2" />
            <div v-if="subjectHasSearched || subjectLoading" class="flex-1 min-h-0 overflow-y-auto">
              <SubjectGrid :subjects="subjects" :loading="subjectLoading" :has-searched="subjectHasSearched" :error="subjectError" :selection-mode="true" :display-images="displayImages" @subject-click="handleI2vSubjectSelection" />
            </div>
          </div>

          <!-- Step 2: Source Image Selection + Parameters -->
          <div v-if="!presetEditMode && !bulkMode && i2vSelectedSubject" class="flex flex-col flex-1 min-h-0">
            <!-- Selected subject header -->
            <div class="flex-shrink-0 mb-2 flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
              <UIcon name="i-heroicons-user-20-solid" class="w-4 h-4 text-primary" />
              <span class="text-sm font-medium">{{ i2vSelectedSubject.label }}</span>
              <UButton variant="ghost" size="xs" icon="i-heroicons-x-mark" @click="i2vSelectedSubject = null; i2vSelectedImages = []" />
              <span v-if="i2vSelectedImages.length > 0" class="ml-auto text-xs text-gray-400">
                {{ i2vSelectedImages.length }} image{{ i2vSelectedImages.length !== 1 ? 's' : '' }} selected
              </span>
            </div>

            <!-- Two-column layout: images + params -->
            <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-hidden">
              <!-- Left: Source images grid -->
              <div class="overflow-y-auto">
                <div class="flex items-center gap-2 mb-2">
                  <UCheckbox
                    :model-value="i2vAllVisibleSelected"
                    :disabled="i2vSubjectImages.length === 0"
                    @update:model-value="toggleAllI2vVisible"
                  />
                  <span class="text-xs text-gray-400">
                    Select all visible ({{ i2vSubjectImages.length }})
                  </span>
                </div>
                <SourceImageGrid
                  :images="i2vSubjectImages"
                  :loading="i2vSubjectImagesLoading"
                  :selected-uuids="i2vSelectedImages.map(s => s.uuid)"
                  :job-counts="i2vImageJobCounts"
                  :show-job-count="true"
                  empty-message="No source images found for this subject"
                  @click="toggleI2vImage"
                />
              </div>

              <!-- Right: I2V Parameters -->
              <div class="overflow-y-auto">
                <p class="text-xs text-gray-400 mb-2">Generation settings:</p>
                <I2vJobForm v-model="i2vParams" :loras="availableLoras" />
              </div>
            </div>
          </div>
        </div>

        <!-- Subject First Workflow -->
        <div v-if="workflowMode === 'subject-first'" class="flex flex-col flex-1 min-h-0">
          <!-- Step 1: Subject Selection -->
          <div v-if="!selectedSubject" class="flex flex-col flex-1 min-h-0">
            <!-- Subject Search Filters - Compact -->
            <div class="flex-shrink-0 mb-2">
              <SubjectSearchFilters :selected-subject="selectedSubject" @search="searchSubjects" @clear="clearSubjectFilters" @subject-select="handleSubjectSelection" :loading="subjectLoading" />
            </div>

            <!-- Subject Grid - Scrollable -->
            <div v-if="subjectHasSearched || subjectLoading" class="flex-1 min-h-0 overflow-y-auto">
              <SubjectGrid :subjects="subjects" :loading="subjectLoading" :has-searched="subjectHasSearched" :error="subjectError" :selection-mode="true" :display-images="displayImages" @subject-click="handleSubjectGridSelection" />
            </div>
          </div>

          <!-- Step 2: Video Selection (after subject is selected) -->
          <div v-if="selectedSubject" class="flex flex-col flex-1 min-h-0">
            <!-- Selected Subject Preview - Compact -->
            <div class="flex-shrink-0 mb-2 flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shrink-0">
                  <UIcon name="i-heroicons-user-20-solid" class="w-4 h-4 text-white" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {{ selectedSubject.label }}
                  </p>
                </div>
              </div>
              <UButton variant="ghost" color="error" icon="i-heroicons-x-mark-20-solid" size="xs" @click="clearSelectedSubject" :disabled="isSubmitting" />
            </div>

            <!-- Video Search Filters - Compact -->
            <div class="flex-shrink-0 mb-2">
              <VideoSearchFilters ref="videoSearchFilters" @search="searchVideos" @clear="clearVideoFilters" :loading="videoLoading" />
            </div>

            <!-- Selected Videos Count -->
            <div v-if="selectedVideos.length > 0" class="flex-shrink-0 mb-2 flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span class="text-sm font-medium text-blue-900 dark:text-blue-100"> {{ selectedVideos.length }} video{{ selectedVideos.length !== 1 ? 's' : '' }} selected </span>
              <UButton variant="ghost" color="error" size="xs" @click="clearSelectedVideos"> Clear All </UButton>
            </div>

            <!-- Video Grid - Scrollable -->
            <div class="flex-1 min-h-0 overflow-y-auto">
              <div v-if="videoError" class="text-center py-12">
                <UAlert color="error" title="Error" :description="videoError" variant="subtle" />
              </div>

              <MediaGrid v-else ref="mediaGrid" :media-results="videos" :loading="videoLoading" :has-searched="videoHasSearched" :selection-mode="true" :multi-select="true" :selected-items="selectedVideos" @media-click="toggleVideoSelection" />

              <!-- Loading More Indicator -->
              <div v-if="videoIsLoadingMore" class="flex justify-center py-8">
                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <UIcon name="i-heroicons-arrow-path" class="animate-spin text-xl" />
                  <span class="text-sm">Loading more...</span>
                </div>
              </div>

              <!-- Infinite Scroll Sentinel -->
              <div v-if="videoHasMoreResults && !videoIsLoadingMore" ref="videoScrollSentinel" class="h-px"></div>

              <!-- End of Results -->
              <div v-if="!videoHasMoreResults && videoHasSearched && videos.length > 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
                <p class="text-sm">End of results</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Video First Workflow -->
        <div v-if="workflowMode === 'video-first'" class="flex flex-col flex-1 min-h-0">
          <!-- Step 1: Video Selection -->
          <div v-if="!selectedVideo" class="flex flex-col flex-1 min-h-0">
            <!-- Video Search Filters - Compact -->
            <div class="flex-shrink-0 mb-2">
              <VideoSearchFilters ref="videoSearchFiltersVideoFirst" @search="searchVideos" @clear="clearVideoFilters" :loading="videoLoading" />
            </div>

            <!-- Video Grid - Scrollable -->
            <div class="flex-1 min-h-0 overflow-y-auto">
              <div v-if="videoError" class="text-center py-12">
                <UAlert color="error" title="Error" :description="videoError" variant="subtle" />
              </div>

              <MediaGrid v-else ref="mediaGrid" :media-results="videos" :loading="videoLoading" :has-searched="videoHasSearched" :selection-mode="true" :multi-select="false" :selected-items="selectedVideo ? [selectedVideo] : []" @media-click="handleVideoSelection" />

              <!-- Loading More Indicator -->
              <div v-if="videoIsLoadingMore" class="flex justify-center py-8">
                <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <UIcon name="i-heroicons-arrow-path" class="animate-spin text-xl" />
                  <span class="text-sm">Loading more...</span>
                </div>
              </div>

              <!-- Infinite Scroll Sentinel -->
              <div v-if="videoHasMoreResults && !videoIsLoadingMore" ref="videoScrollSentinel" class="h-px"></div>

              <!-- End of Results -->
              <div v-if="!videoHasMoreResults && videoHasSearched && videos.length > 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
                <p class="text-sm">End of results</p>
              </div>
            </div>
          </div>

          <!-- Step 2: Subject Selection (after video is selected) -->
          <div v-if="selectedVideo" class="flex flex-col flex-1 min-h-0">
            <!-- Selected Video Preview - Compact -->
            <div class="flex-shrink-0 mb-2 flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div class="flex items-center gap-2">
                <div v-if="displayImages" class="w-12 h-9 bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0 relative">
                  <!-- Thumbnail Skeleton -->
                  <USkeleton v-if="selectedVideo.thumbnail_uuid && !selectedVideoThumbnailLoaded" class="absolute inset-0 w-full h-full rounded-none" />

                  <!-- Actual Thumbnail -->
                  <img v-if="selectedVideo.thumbnail_uuid" :src="`/api/media/${selectedVideo.thumbnail_uuid}/image?size=md`" :alt="selectedVideo.filename" class="w-full h-full object-cover object-top transition-opacity duration-300" :class="{ 'opacity-0': !selectedVideoThumbnailLoaded }" @load="selectedVideoThumbnailLoaded = true" @error="selectedVideoThumbnailLoaded = true" />

                  <!-- Fallback for videos without thumbnails -->
                  <div v-else class="w-full h-full flex items-center justify-center">
                    <UIcon name="i-heroicons-film-20-solid" class="w-3 h-3 text-gray-400" />
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {{ selectedVideo.filename }}
                  </p>
                </div>
              </div>
              <UButton variant="ghost" color="error" icon="i-heroicons-x-mark-20-solid" size="xs" @click="clearSelectedVideo" :disabled="isSubmitting" />
            </div>

            <!-- Subject Search Filters - Compact -->
            <div class="flex-shrink-0 mb-2">
              <SubjectSearchFilters :selected-subject="selectedSubject" @search="searchSubjects" @clear="clearSubjectFilters" @subject-select="handleSubjectSelection" :loading="subjectLoading" />
            </div>

            <!-- Selected Subjects Count -->
            <div v-if="selectedSubjects.length > 0" class="flex-shrink-0 mb-2 flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span class="text-sm font-medium text-blue-900 dark:text-blue-100"> {{ selectedSubjects.length }} subject{{ selectedSubjects.length !== 1 ? 's' : '' }} selected </span>
              <UButton variant="ghost" color="error" size="xs" @click="clearSelectedSubjects"> Clear All </UButton>
            </div>

            <!-- Subject Grid - Scrollable -->
            <div class="flex-1 min-h-0 overflow-y-auto">
              <SubjectGrid :subjects="subjects" :loading="subjectLoading" :has-searched="subjectHasSearched" :error="subjectError" :selection-mode="true" :multi-select="true" :selected-items="selectedSubjects" :display-images="displayImages" @subject-click="toggleSubjectSelection" />
            </div>
          </div>
        </div>

        <!-- FS (Image Face Swap → I2V Source) Workflow -->
        <div v-if="selectedJobType === 'fs'" class="flex flex-col flex-1 min-h-0">
          <!-- Step 1: Subject Selection -->
          <div v-if="!fsSelectedSubject" class="flex flex-col flex-1 min-h-0">
            <SubjectSearchFilters ref="fsSubjectSearchFilters" @search="searchSubjects" @clear="clearSubjectFilters" class="flex-shrink-0 mb-2" />
            <div v-if="subjectHasSearched || subjectLoading" class="flex-1 min-h-0 overflow-y-auto">
              <SubjectGrid :subjects="subjects" :loading="subjectLoading" :has-searched="subjectHasSearched" :error="subjectError" :selection-mode="true" :display-images="displayImages" @subject-click="handleFsSubjectSelection" />
            </div>
          </div>

          <!-- Step 2: Face multi-pick + Dest image multi-pick -->
          <div v-if="fsSelectedSubject" class="flex flex-col flex-1 min-h-0">
            <!-- Selected subject header -->
            <div class="flex-shrink-0 mb-2 flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
              <UIcon name="i-heroicons-user-20-solid" class="w-4 h-4 text-primary" />
              <span class="text-sm font-medium">{{ fsSelectedSubject.label }}</span>
              <UButton variant="ghost" size="xs" icon="i-heroicons-x-mark" @click="clearFsSubject" />
              <span class="ml-auto text-xs text-gray-400">
                {{ fsSelectedFaces.length }} face{{ fsSelectedFaces.length !== 1 ? 's' : '' }} × {{ fsSelectedDestImages.length }} dest = {{ fsSelectedFaces.length * fsSelectedDestImages.length }} job{{ fsSelectedFaces.length * fsSelectedDestImages.length !== 1 ? 's' : '' }}
              </span>
            </div>

            <!-- Two-column layout: faces (left) + dest images (right) -->
            <div class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-hidden">
              <!-- Left: Source face multi-pick -->
              <div class="overflow-y-auto">
                <p class="text-xs text-gray-400 mb-2">Select source face(s) — identity to swap IN:</p>
                <SourceImageGrid
                  :images="fsSubjectImages"
                  :loading="fsSubjectImagesLoading"
                  :selected-uuids="fsSelectedFaces.map(s => s.uuid)"
                  empty-message="No source images found for this subject"
                  @click="toggleFsFace"
                />
              </div>

              <!-- Right: Dest image multi-pick -->
              <div class="flex flex-col min-h-0">
                <p class="text-xs text-gray-400 mb-2 flex-shrink-0">Select dest image(s) — target to swap face ONTO:</p>
                <div class="flex-shrink-0 mb-2">
                  <VideoSearchFilters ref="fsDestImageSearchFilters" :loading="destImageLoading" title="Dest Image Filters" />
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto">
                  <div v-if="destImageError" class="text-center py-12">
                    <UAlert color="error" title="Error" :description="destImageError" variant="subtle" />
                  </div>
                  <MediaGrid v-else :media-results="destImages" :loading="destImageLoading" :has-searched="destImageHasSearched" :selection-mode="true" :multi-select="true" :selected-items="fsSelectedDestImages" grid-class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3" @media-click="toggleFsDestImage" />
                  <div v-if="destImageIsLoadingMore" class="flex justify-center py-8">
                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-xl" />
                      <span class="text-sm">Loading more...</span>
                    </div>
                  </div>
                  <div v-if="destImageHasMoreResults && !destImageIsLoadingMore" ref="destImageScrollSentinel" class="h-px"></div>
                  <div v-if="!destImageHasMoreResults && destImageHasSearched && destImages.length > 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
                    <p class="text-sm">End of results</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tagging Workflow -->
        <div v-if="selectedJobType === 'tagging'" class="flex flex-col flex-1 min-h-0">
          <!-- Step 1: Subject Selection -->
          <div v-if="!taggingSelectedSubject" class="flex flex-col flex-1 min-h-0">
            <SubjectSearchFilters ref="taggingSubjectSearchFilters" @search="searchSubjects" @clear="clearSubjectFilters" class="flex-shrink-0 mb-2" />
            <div v-if="subjectHasSearched || subjectLoading" class="flex-1 min-h-0 overflow-y-auto">
              <SubjectGrid :subjects="subjects" :loading="subjectLoading" :has-searched="subjectHasSearched" :error="subjectError" :selection-mode="true" :display-images="displayImages" @subject-click="handleTaggingSubjectSelection" />
            </div>
          </div>

          <!-- Step 2: Subject's images with filter + multi-select -->
          <div v-if="taggingSelectedSubject" class="flex flex-col flex-1 min-h-0">
            <!-- Header: subject + filter dropdown + counts -->
            <div class="flex-shrink-0 mb-2 flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
              <UIcon name="i-heroicons-user-20-solid" class="w-4 h-4 text-primary" />
              <span class="text-sm font-medium">{{ taggingSelectedSubject.label }}</span>
              <UButton variant="ghost" size="xs" icon="i-heroicons-x-mark" @click="clearTaggingSubject" />
              <USelect v-model="taggingFilter" :items="taggingFilterOptions" size="xs" class="ml-2 w-36" />
              <span class="ml-auto text-xs text-gray-400">
                <template v-if="taggingSelectedImages.length > 0">
                  {{ taggingSelectedImages.length }} selected
                </template>
                <template v-else>
                  {{ taggingFilteredImages.length }} {{ taggingFilter }} of {{ taggingSubjectImages.length }}
                </template>
              </span>
            </div>

            <!-- Quick actions -->
            <div class="flex-shrink-0 mb-2 flex gap-2">
              <UButton size="xs" variant="outline" :disabled="taggingFilteredImages.length === 0" @click="selectAllVisibleTaggingImages">
                Select all visible ({{ taggingFilteredImages.length }})
              </UButton>
              <UButton v-if="taggingSelectedImages.length > 0" size="xs" variant="outline" color="error" @click="clearTaggingImageSelection">
                Clear selection
              </UButton>
            </div>

            <!-- Images grid -->
            <div class="flex-1 min-h-0 overflow-y-auto">
              <SourceImageGrid
                :images="taggingFilteredImages"
                :loading="taggingSubjectImagesLoading"
                :selected-uuids="taggingSelectedImages.map(s => s.uuid)"
                empty-message="No images match the current filter"
                @click="toggleTaggingImage"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex flex-col gap-3 w-full">
        <!-- Controls Row -->
        <div class="flex justify-between items-center w-full">
          <!-- Left side: Close and Back buttons -->
          <div class="flex gap-2">
            <UButton variant="outline" @click="closeModal" :disabled="isSubmitting"> Close </UButton>
            <UButton v-if="selectedJobType && !presetEditMode" variant="outline" @click="goBack" :disabled="isSubmitting" size="sm" color="primary"> Back </UButton>
          </div>

          <!-- Right side: Search Actions and Create Jobs -->
          <div class="flex gap-2">
            <!-- Search Actions for Subject First workflow -->
            <template v-if="workflowMode === 'subject-first' && !selectedSubject">
              <UButton v-if="subjectHasSearched || searchStore.subjectSearch.selectedTags.length > 0" color="gray" variant="outline" size="sm" icon="i-heroicons-x-mark" @click="clearSubjectFilters" :disabled="isSubmitting"> Clear </UButton>
              <UButton color="primary" size="sm" icon="i-heroicons-magnifying-glass" @click="searchSubjects" :disabled="isSubmitting"> Search Subjects </UButton>
            </template>

            <!-- Search Actions for Video First workflow (video selection) -->
            <template v-else-if="workflowMode === 'video-first' && !selectedVideo">
              <UButton v-if="videoHasSearched || searchStore.videoSearch.selectedTags.length > 0" color="gray" variant="outline" size="sm" icon="i-heroicons-x-mark" @click="clearVideoFilters" :disabled="isSubmitting"> Clear </UButton>
              <UButton color="primary" size="sm" icon="i-heroicons-magnifying-glass" @click="searchVideos" :disabled="isSubmitting"> Search Videos </UButton>
            </template>

            <!-- Search Actions for Subject First workflow (video selection) -->
            <template v-else-if="workflowMode === 'subject-first' && selectedSubject">
              <UButton v-if="videoHasSearched || searchStore.videoSearch.selectedTags.length > 0" color="gray" variant="outline" size="sm" icon="i-heroicons-x-mark" @click="clearVideoFilters" :disabled="isSubmitting"> Clear </UButton>
              <UButton color="primary" size="sm" icon="i-heroicons-magnifying-glass" @click="searchVideos" :disabled="isSubmitting"> Search Videos </UButton>
            </template>

            <!-- Search Actions for Video First workflow (subject selection) -->
            <template v-else-if="workflowMode === 'video-first' && selectedVideo">
              <UButton v-if="subjectHasSearched || searchStore.subjectSearch.selectedTags.length > 0" color="gray" variant="outline" size="sm" icon="i-heroicons-x-mark" @click="clearSubjectFilters" :disabled="isSubmitting"> Clear </UButton>
              <UButton color="primary" size="sm" icon="i-heroicons-magnifying-glass" @click="searchSubjects" :disabled="isSubmitting"> Search Subjects </UButton>
            </template>

            <!-- Search Actions for FS workflow (dest-image selection) -->
            <template v-else-if="selectedJobType === 'fs' && fsSelectedSubject">
              <UButton v-if="destImageHasSearched || searchStore.videoSearch.selectedTags.length > 0" color="gray" variant="outline" size="sm" icon="i-heroicons-x-mark" @click="clearDestImageFilters" :disabled="isSubmitting"> Clear </UButton>
              <UButton v-if="destImageHasSearched" color="gray" variant="outline" size="sm" icon="i-heroicons-arrow-path" @click="reshuffleDestImages" :disabled="isSubmitting || destImageLoading"> Shuffle </UButton>
              <UButton color="primary" size="sm" icon="i-heroicons-magnifying-glass" @click="searchDestImages" :disabled="isSubmitting"> Search Dest Images </UButton>
            </template>

            <!-- Create Jobs Action -->
            <UButton v-if="!presetEditMode && (workflowMode || selectedJobType === 'i2v' || selectedJobType === 'fs' || selectedJobType === 'tagging') && canCreateJobs" type="button" :loading="isSubmitting" :disabled="!canCreateJobs" size="sm" color="primary" @click="createBatchJobs">
              {{ submitButtonLabel }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useTags } from '~/composables/useTags'
import { useSettings } from '~/composables/useSettings'
import { useSearchStore } from '~/stores/search'
import { applyLoraDisableOverrides, loraOffKey } from '~/utils/loraDisable'
import VideoSearchFilters from '~/components/VideoSearchFilters.vue'
import SubjectSearchFilters from '~/components/SubjectSearchFilters.vue'
import SourceImageGrid from '~/components/SourceImageGrid.vue'

// Use our responsive breakpoints composable
const { isMobile } = useBreakpoints()

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'jobsCreated'])

// Use composables
const { setSubjectTags, setVideoTags, filterHairTags, clearTags } = useTags()
const { displayImages } = useSettings()
const searchStore = useSearchStore()

// Computed
const isOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})

// Job type selection
const selectedJobType = ref(null) // 'vid_faceswap' | 'i2v' | null
const form = ref({
  job_type: 'vid_faceswap'
})

// Workflow state
const workflowMode = ref(null) // 'subject-first' | 'video-first' | null

// I2V workflow state
const i2vSelectedSubject = ref(null)
const i2vSelectedImages = ref([])
const i2vSubjectImages = ref([])
const i2vImageJobCounts = ref({})
const i2vSubjectImagesLoading = ref(false)
const availableLoras = ref([])
// When true, the I2V flow skips per-subject selection and creates one job per
// source image for every subject that already has at least one job.
const bulkMode = ref(false)
// Filter source images by the job type that produced them. 'all' is no filter;
// 'fs' restricts to images created by Faceswap I2I jobs (the typical pipeline
// where FS output feeds into bulk i2v). Applies to BOTH the per-subject image
// grid and bulk auto-queue candidate selection.
const i2vSourceJobTypeFilter = ref('all')
const i2vSourceJobTypeFilterOptions = [
  { label: 'All source images', value: 'all' },
  { label: 'From Faceswap I2I (fs)', value: 'fs' }
]
const i2vSourceJobTypeFilterLabel = computed(
  () => i2vSourceJobTypeFilterOptions.find(o => o.value === i2vSourceJobTypeFilter.value)?.label || ''
)
const i2vParams = ref({
  prompt: '',
  negative_prompt: 'blurry, distorted, low quality, watermark, text, deformed',
  length: 81,
  lora_1_high: null,
  lora_1_low: null,
  lora_1_high_strength: 1,
  lora_1_low_strength: 1,
  lora_2_high: null,
  lora_2_low: null,
  lora_2_high_strength: 1,
  lora_2_low_strength: 1,
  lora_3_high: null,
  lora_3_low: null,
  lora_3_high_strength: 1,
  lora_3_low_strength: 1,
  lora_4_high: null,
  lora_4_low: null,
  lora_4_high_strength: 1,
  lora_4_low_strength: 1,
  lora_5_high: null,
  lora_5_low: null,
  lora_5_high_strength: 1,
  lora_5_low_strength: 1,
})
const isSubmitting = ref(false)

// When true, the modal is in "edit preset" mode: subject/image selection is
// skipped, only the i2v form is shown, and the only meaningful action is the
// Update button inside the form (which PUTs to /api/presets/{id}).
const presetEditMode = ref(false)

// Thumbnail loading states
const selectedVideoThumbnailLoaded = ref(false)

// Component refs
const videoSearchFilters = ref(null)
const videoSearchFiltersVideoFirst = ref(null)

// Subject-first workflow state
const selectedSubject = ref(null)
const selectedVideos = ref([])
const videos = ref([])
const videoLoading = ref(false)
const videoError = ref(null)
const videoCurrentPage = ref(1)
const videoHasSearched = ref(false)
const videoTotalEstimate = ref(0)

// Infinite scroll state
const videoIsLoadingMore = ref(false)
const videoHasMoreResults = ref(false)
const videoScrollObserver = ref(null)
const videoScrollSentinel = ref(null)

// Video-first workflow state
const selectedVideo = ref(null)
const selectedSubjects = ref([])
const subjects = ref([])
const subjectLoading = ref(false)
const subjectError = ref(null)
const subjectCurrentPage = ref(1)
const subjectHasSearched = ref(false)

// FS (Image Face Swap -> I2V source) workflow state
const fsSelectedSubject = ref(null)
const fsSelectedFaces = ref([])
const fsSubjectImages = ref([])
const fsSubjectImagesLoading = ref(false)
const fsSelectedDestImages = ref([])
const destImages = ref([])
const destImageLoading = ref(false)
const destImageError = ref(null)
const destImageHasSearched = ref(false)
const destImageCurrentPage = ref(1)
const destImageHasMoreResults = ref(false)
const destImageIsLoadingMore = ref(false)
const destImageScrollObserver = ref(null)
const destImageScrollSentinel = ref(null)
// Stable random seed for paginated dest-image search — pinned per filter-change
// so `ORDER BY hashtext(uuid || seed)` is consistent across pages and doesn't
// surface duplicates as the user scrolls.
const destImageSeed = ref(null)
const fsDestImageSearchFilters = ref(null)

// Tagging workflow state
const taggingSelectedSubject = ref(null)
const taggingSubjectImages = ref([])
const taggingSubjectImagesLoading = ref(false)
const taggingSelectedImages = ref([])
const taggingFilter = ref('untagged') // 'all' | 'tagged' | 'untagged'
const taggingFilterOptions = [
  { label: 'Show: all', value: 'all' },
  { label: 'Show: tagged', value: 'tagged' },
  { label: 'Show: untagged', value: 'untagged' }
]

// Human-readable label for the currently selected job type, shown as a badge
// in the modal header so you don't lose context when several steps deep.
// For vid_faceswap, also append the active workflow mode (subject-first /
// video-first) once it's been picked.
const selectedJobTypeLabel = computed(() => {
  switch (selectedJobType.value) {
    case 'vid_faceswap': {
      const mode = workflowMode.value === 'subject-first' ? ' · Subject First'
        : workflowMode.value === 'video-first' ? ' · Video First'
        : ''
      return `Faceswap I2V Legacy${mode}`
    }
    case 'fs': return 'Faceswap I2I'
    case 'i2v': return bulkMode.value ? 'Wan I2V · Bulk' : 'Wan I2V'
    case 'tagging': return 'Tagging'
    default: return ''
  }
})

// Tagging: filter the loaded source images by tag presence (client-side).
// An image counts as "tagged" when its tags JSON has a non-empty tags array.
const taggingFilteredImages = computed(() => {
  if (taggingFilter.value === 'all') return taggingSubjectImages.value
  const isTagged = img => Array.isArray(img.tags?.tags) && img.tags.tags.length > 0
  return taggingSubjectImages.value.filter(img =>
    taggingFilter.value === 'tagged' ? isTagged(img) : !isTagged(img)
  )
})

// Computed properties
const canCreateJobs = computed(() => {
  if (selectedJobType.value === 'i2v') {
    if (bulkMode.value) {
      return i2vParams.value.prompt.trim() !== ''
    }
    return i2vSelectedImages.value.length > 0 && i2vParams.value.prompt.trim() !== ''
  }
  if (selectedJobType.value === 'fs') {
    return fsSelectedSubject.value && fsSelectedFaces.value.length > 0 && fsSelectedDestImages.value.length > 0
  }
  if (selectedJobType.value === 'tagging') {
    if (!taggingSelectedSubject.value) return false
    // Either explicitly selected images, or "tag all visible" via the filter
    return taggingSelectedImages.value.length > 0 || taggingFilteredImages.value.length > 0
  }
  if (workflowMode.value === 'subject-first') {
    return selectedSubject.value && selectedVideos.value.length > 0
  } else if (workflowMode.value === 'video-first') {
    return selectedVideo.value && selectedSubjects.value.length > 0
  }
  return false
})

const jobCount = computed(() => {
  if (selectedJobType.value === 'i2v') {
    return i2vSelectedImages.value.length
  }
  if (selectedJobType.value === 'fs') {
    return fsSelectedFaces.value.length * fsSelectedDestImages.value.length
  }
  if (selectedJobType.value === 'tagging') {
    return taggingSelectedImages.value.length > 0
      ? taggingSelectedImages.value.length
      : taggingFilteredImages.value.length
  }
  if (workflowMode.value === 'subject-first') {
    return selectedVideos.value.length
  } else if (workflowMode.value === 'video-first') {
    return selectedSubjects.value.length
  }
  return 0
})

const submitButtonLabel = computed(() => {
  if (isSubmitting.value) return 'Creating Jobs...'
  if (bulkMode.value && selectedJobType.value === 'i2v') return 'Create Bulk Jobs'
  if (selectedJobType.value === 'tagging') {
    return taggingSelectedImages.value.length > 0
      ? `Tag Selected (${taggingSelectedImages.value.length})`
      : `Tag All Visible (${taggingFilteredImages.value.length})`
  }
  return `Create Jobs (${jobCount.value})`
})

// Modal methods
const closeModal = () => {
  isOpen.value = false
  resetWorkflow()
}

// Workflow methods
const startSubjectFirstWorkflow = () => {
  selectedJobType.value = 'vid_faceswap'
  form.value.job_type = 'vid_faceswap'
  workflowMode.value = 'subject-first'
  resetSelections()
  // Auto-load all subjects when starting this workflow
  nextTick(() => {
    searchSubjects()
  })
}

const startVideoFirstWorkflow = () => {
  selectedJobType.value = 'vid_faceswap'
  form.value.job_type = 'vid_faceswap'
  workflowMode.value = 'video-first'
  resetSelections()
  // Auto-load videos when starting this workflow
  nextTick(() => {
    searchVideos()
  })
}

const startI2vWorkflow = () => {
  selectedJobType.value = 'i2v'
  form.value.job_type = 'i2v'
  resetSelections()
  fetchLoras()
  nextTick(() => searchSubjects())
}

const fetchLoras = async () => {
  try {
    const data = await useApiFetch('loras')
    availableLoras.value = data?.loras || []
  } catch (e) {
    console.error('Failed to fetch LoRAs:', e)
    availableLoras.value = []
  }
}

const handleI2vSubjectSelection = (subject) => {
  i2vSelectedSubject.value = {
    value: subject.id,
    label: subject.name,
    tags: subject.tags
  }
  i2vSelectedImages.value = []
  loadI2vSubjectImages(subject.id)
}

const loadI2vSubjectImages = async (subjectUuid) => {
  i2vSubjectImagesLoading.value = true
  try {
    const params = new URLSearchParams({
      subject_uuid: subjectUuid,
      purpose: 'source',
      media_type: 'image',
      limit: '100'
    })
    if (i2vSourceJobTypeFilter.value && i2vSourceJobTypeFilter.value !== 'all') {
      params.append('source_job_type', i2vSourceJobTypeFilter.value)
    }
    const data = await useApiFetch(`media/search?${params.toString()}`)
    const images = data?.results || []

    // Order images by how often they've been used as a job source so the
    // user's favorites land at the top of the grid (which reveals 30 at a
    // time). If the counts fetch fails we still show the images unsorted.
    if (images.length > 0) {
      try {
        const countsRes = await useApiFetch('media/job-counts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { image_uuids: images.map(img => img.uuid) }
        })
        const counts = countsRes?.job_counts || {}
        i2vImageJobCounts.value = counts
        images.sort((a, b) => (counts[b.uuid] || 0) - (counts[a.uuid] || 0))
      } catch (e) {
        console.error('Failed to load job counts for ordering:', e)
        i2vImageJobCounts.value = {}
      }
    } else {
      i2vImageJobCounts.value = {}
    }

    i2vSubjectImages.value = images
  } catch (e) {
    console.error('Failed to load subject images:', e)
    i2vSubjectImages.value = []
    i2vImageJobCounts.value = {}
  } finally {
    i2vSubjectImagesLoading.value = false
  }
}

const toggleI2vImage = (img) => {
  const idx = i2vSelectedImages.value.findIndex(s => s.uuid === img.uuid)
  if (idx >= 0) {
    i2vSelectedImages.value.splice(idx, 1)
  } else {
    i2vSelectedImages.value.push(img)
  }
}

// Checked when every currently-visible image is in the selection. Visible =
// whatever the source-job-type filter loaded for this subject. Empty grid
// reports false so the checkbox can't appear pre-checked with nothing to do.
const i2vAllVisibleSelected = computed(() => {
  if (i2vSubjectImages.value.length === 0) return false
  const selected = new Set(i2vSelectedImages.value.map(s => s.uuid))
  return i2vSubjectImages.value.every(img => selected.has(img.uuid))
})

const toggleAllI2vVisible = (checked) => {
  if (checked) {
    // Union of (already-selected items not in current view) ∪ (all visible).
    // Items selected under a previous filter that are now hidden stay selected.
    const have = new Set(i2vSelectedImages.value.map(s => s.uuid))
    for (const img of i2vSubjectImages.value) {
      if (!have.has(img.uuid)) {
        i2vSelectedImages.value.push(img)
        have.add(img.uuid)
      }
    }
  } else {
    // Remove only the visible ones; keep hidden-but-selected from prior filters.
    const visible = new Set(i2vSubjectImages.value.map(img => img.uuid))
    i2vSelectedImages.value = i2vSelectedImages.value.filter(s => !visible.has(s.uuid))
  }
}

// ---- FS (Image Face Swap -> I2V source) workflow ----
const startFsWorkflow = () => {
  selectedJobType.value = 'fs'
  form.value.job_type = 'fs'
  resetSelections()
  nextTick(() => searchSubjects())
}

const handleFsSubjectSelection = (subject) => {
  fsSelectedSubject.value = {
    value: subject.id,
    label: subject.name,
    tags: subject.tags
  }
  fsSelectedFaces.value = []
  loadFsSubjectImages(subject.id)
  // Pre-fill dest-image filters with the subject's hair tags only — non-hair
  // tags are too sparse on dest images and surface an empty grid.
  const subjectTagList = subject.tags?.tags || []
  searchStore.videoSearch.selectedTags = filterHairTags(subjectTagList)
  nextTick(() => searchDestImages())
}

const loadFsSubjectImages = async (subjectUuid) => {
  fsSubjectImagesLoading.value = true
  try {
    const data = await useApiFetch(`media/search?subject_uuid=${subjectUuid}&purpose=source&media_type=image&limit=100`)
    fsSubjectImages.value = data?.results || []
  } catch (e) {
    console.error('Failed to load fs subject source images:', e)
    fsSubjectImages.value = []
  } finally {
    fsSubjectImagesLoading.value = false
  }
}

const toggleFsFace = (img) => {
  const idx = fsSelectedFaces.value.findIndex(s => s.uuid === img.uuid)
  if (idx >= 0) {
    fsSelectedFaces.value.splice(idx, 1)
  } else {
    fsSelectedFaces.value.push(img)
  }
}

const toggleFsDestImage = (img) => {
  const idx = fsSelectedDestImages.value.findIndex(s => s.uuid === img.uuid)
  if (idx >= 0) {
    fsSelectedDestImages.value.splice(idx, 1)
  } else {
    fsSelectedDestImages.value.push(img)
  }
}

const clearFsSubject = () => {
  fsSelectedSubject.value = null
  fsSelectedFaces.value = []
  fsSelectedDestImages.value = []
  fsSubjectImages.value = []
  destImages.value = []
  destImageHasSearched.value = false
  destImageSeed.value = null
  searchStore.videoSearch.selectedTags = []
}

const rerollDestImageSeed = () => {
  destImageSeed.value = Math.random().toString(36).slice(2, 14)
}

// Dest image search (purpose=dest, media_type=image). Shares the videoSearch
// filter store since the filter semantics (tags/sort/ratings) are identical.
const searchDestImages = () => {
  rerollDestImageSeed()
  destImageCurrentPage.value = 1
  loadDestImages(true)
  if (fsDestImageSearchFilters.value?.collapse) {
    fsDestImageSearchFilters.value.collapse()
  }
}

const reshuffleDestImages = () => {
  rerollDestImageSeed()
  destImageCurrentPage.value = 1
  loadDestImages(true)
}

const clearDestImageFilters = () => {
  searchStore.resetVideoFilters()
  destImages.value = []
  destImageHasSearched.value = false
  destImageSeed.value = null
}

const loadDestImages = async (reset = false) => {
  if (!reset && destImageIsLoadingMore.value) return

  if (reset) {
    destImageLoading.value = true
    destImages.value = []
    destImageCurrentPage.value = 1
  } else {
    destImageIsLoadingMore.value = true
  }

  destImageError.value = null
  destImageHasSearched.value = true

  try {
    const params = new URLSearchParams()
    params.append('media_type', 'image')
    params.append('purpose', 'dest')

    const limit = typeof searchStore.videoSearch.limitOptions === 'object' ? searchStore.videoSearch.limitOptions.value : searchStore.videoSearch.limitOptions || 50
    params.append('limit', limit.toString())
    params.append('offset', ((destImageCurrentPage.value - 1) * limit).toString())

    const sortType = typeof searchStore.videoSearch.sortType === 'object' ? searchStore.videoSearch.sortType.value : searchStore.videoSearch.sortType || 'random'
    const sortOrder = typeof searchStore.videoSearch.sortOrder === 'object' ? searchStore.videoSearch.sortOrder.value : searchStore.videoSearch.sortOrder || 'asc'
    params.append('sort_by', sortType)
    params.append('sort_order', sortOrder)
    if (sortType === 'random') {
      if (!destImageSeed.value) rerollDestImageSeed()
      params.append('seed', destImageSeed.value)
    }

    if (searchStore.videoSearch.selectedTags.length > 0) {
      params.append('tags', searchStore.videoSearch.selectedTags.join(','))
    }
    if (searchStore.videoSearch.selectedRatings.length > 0) {
      params.append('ratings', searchStore.videoSearch.selectedRatings.join(','))
    }
    if (searchStore.videoSearch.showUnrated) {
      params.append('unrated_only', 'true')
    }

    const response = await useApiFetch(`media/search?${params.toString()}`)
    const newResults = response.results || []

    if (reset) {
      destImages.value = newResults
    } else {
      destImages.value = [...destImages.value, ...newResults]
    }

    destImageHasMoreResults.value = newResults.length === limit
  } catch (err) {
    console.error('Error loading dest images:', err)
    destImageError.value = err.message || 'Failed to load dest images'
    if (!reset) {
      destImageHasMoreResults.value = false
    }
  } finally {
    if (reset) {
      destImageLoading.value = false
    } else {
      destImageIsLoadingMore.value = false
    }
  }
}

const loadMoreDestImageResults = async () => {
  if (!destImageHasMoreResults.value || destImageIsLoadingMore.value || destImageLoading.value) {
    return
  }
  destImageCurrentPage.value++
  await loadDestImages(false)
}

const setupDestImageScrollObserver = () => {
  if (destImageScrollObserver.value) {
    destImageScrollObserver.value.disconnect()
  }
  if (!destImageScrollSentinel.value) return

  destImageScrollObserver.value = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !destImageLoading.value && !destImageIsLoadingMore.value && destImageHasMoreResults.value) {
          loadMoreDestImageResults()
        }
      })
    },
    { root: null, rootMargin: '400px', threshold: 0 }
  )
  destImageScrollObserver.value.observe(destImageScrollSentinel.value)
}

// ---- Tagging workflow ----
const startTaggingWorkflow = () => {
  selectedJobType.value = 'tagging'
  form.value.job_type = 'tagging'
  resetSelections()
  nextTick(() => searchSubjects())
}

const handleTaggingSubjectSelection = (subject) => {
  taggingSelectedSubject.value = {
    value: subject.id,
    label: subject.name,
    tags: subject.tags
  }
  taggingSelectedImages.value = []
  loadTaggingSubjectImages(subject.id)
}

const loadTaggingSubjectImages = async (subjectUuid) => {
  taggingSubjectImagesLoading.value = true
  try {
    // Pull up to 200 source images for the subject; the dropdown filter narrows
    // this down client-side so the user can preview tagged/untagged counts without
    // re-querying.
    const data = await useApiFetch(`media/search?subject_uuid=${subjectUuid}&purpose=source&media_type=image&limit=200`)
    taggingSubjectImages.value = data?.results || []
  } catch (e) {
    console.error('Failed to load tagging subject images:', e)
    taggingSubjectImages.value = []
  } finally {
    taggingSubjectImagesLoading.value = false
  }
}

const toggleTaggingImage = (img) => {
  const idx = taggingSelectedImages.value.findIndex(s => s.uuid === img.uuid)
  if (idx >= 0) {
    taggingSelectedImages.value.splice(idx, 1)
  } else {
    taggingSelectedImages.value.push(img)
  }
}

const selectAllVisibleTaggingImages = () => {
  // Union of (currently-selected items still visible) ∪ (everything visible).
  // Items selected under a previous filter that are now hidden stay selected.
  const visible = taggingFilteredImages.value
  const have = new Set(taggingSelectedImages.value.map(s => s.uuid))
  for (const img of visible) {
    if (!have.has(img.uuid)) {
      taggingSelectedImages.value.push(img)
      have.add(img.uuid)
    }
  }
}

const clearTaggingImageSelection = () => {
  taggingSelectedImages.value = []
}

const clearTaggingSubject = () => {
  taggingSelectedSubject.value = null
  taggingSelectedImages.value = []
  taggingSubjectImages.value = []
}

const goBack = () => {
  if (selectedJobType.value === 'i2v') {
    if (i2vSelectedSubject.value) {
      i2vSelectedSubject.value = null
      i2vSelectedImages.value = []
    } else {
      selectedJobType.value = null
    }
  } else if (selectedJobType.value === 'fs') {
    if (fsSelectedSubject.value) {
      clearFsSubject()
    } else {
      selectedJobType.value = null
    }
  } else if (selectedJobType.value === 'tagging') {
    if (taggingSelectedSubject.value) {
      clearTaggingSubject()
    } else {
      selectedJobType.value = null
    }
  } else if (workflowMode.value) {
    workflowMode.value = null
  } else {
    selectedJobType.value = null
  }
}

const resetWorkflow = () => {
  selectedJobType.value = null
  workflowMode.value = null
  presetEditMode.value = false
  resetSelections()
  clearTags()
}

const resetSelections = () => {
  // Clear subject-first workflow
  selectedSubject.value = null
  selectedVideos.value = []
  videos.value = []
  videoHasSearched.value = false

  // Clear video-first workflow
  selectedVideo.value = null
  selectedSubjects.value = []
  subjects.value = []
  subjectHasSearched.value = false

  // Clear i2v workflow
  i2vSelectedSubject.value = null
  i2vSelectedImages.value = []
  i2vSubjectImages.value = []
  i2vImageJobCounts.value = {}
  bulkMode.value = false
  i2vSourceJobTypeFilter.value = 'all'

  // Clear fs workflow
  fsSelectedSubject.value = null
  fsSelectedFaces.value = []
  fsSubjectImages.value = []
  fsSelectedDestImages.value = []
  destImages.value = []
  destImageHasSearched.value = false
  destImageHasMoreResults.value = false

  // Clear tagging workflow
  taggingSelectedSubject.value = null
  taggingSelectedImages.value = []
  taggingSubjectImages.value = []
  taggingFilter.value = 'untagged'
}

// Subject selection handlers
const handleSubjectSelection = selected => {
  selectedSubject.value = selected

  if (selected) {
    storeSubjectTags(selected)

    // Auto-fill video search filters with ALL subject tags (replace existing tags)
    if (selected.tags && selected.tags.tags && Array.isArray(selected.tags.tags)) {
      searchStore.videoSearch.selectedTags = [...selected.tags.tags]
    }

    console.log('🎯 Video search settings configured:', {
      sortType: searchStore.videoSearch.sortType,
      sortOrder: searchStore.videoSearch.sortOrder,
      limitOptions: searchStore.videoSearch.limitOptions,
      tags: searchStore.videoSearch.selectedTags
    })

    // Auto-search videos with the subject's tags
    nextTick(() => {
      searchVideos()
    })
  } else {
    setSubjectTags([])
    // Clear video search tags when no subject is selected
    searchStore.videoSearch.selectedTags = []
  }
}

const handleSubjectGridSelection = subject => {
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

const toggleSubjectSelection = subject => {
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
const handleVideoSelection = video => {
  selectedVideo.value = video
  selectedVideoThumbnailLoaded.value = false
  storeVideoTags(video)

  // Auto-fill subject search filters with ALL video tags (replace existing tags)
  if (video.tags && video.tags.tags && Array.isArray(video.tags.tags)) {
    searchStore.subjectSearch.selectedTags = [...video.tags.tags]
  }
}

const clearSelectedVideo = () => {
  selectedVideo.value = null
  selectedVideoThumbnailLoaded.value = false
  setVideoTags([])
  // Clear subject search tags when no video is selected
  searchStore.subjectSearch.selectedTags = []
}

const toggleVideoSelection = video => {
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
const storeSubjectTags = subject => {
  if (subject && subject.tags && subject.tags.tags) {
    setSubjectTags(subject.tags.tags)
  } else {
    setSubjectTags([])
  }
}

const storeVideoTags = video => {
  if (video && video.tags && video.tags.tags) {
    setVideoTags(video.tags.tags)
  } else {
    setVideoTags([])
  }
}

// Search methods
const searchVideos = () => {
  videoCurrentPage.value = 1
  loadVideos(true)

  // Collapse the video search filters after searching
  if (videoSearchFilters.value?.collapse) {
    videoSearchFilters.value.collapse()
  }
  if (videoSearchFiltersVideoFirst.value?.collapse) {
    videoSearchFiltersVideoFirst.value.collapse()
  }
}

// Load more results for infinite scroll
const loadMoreVideoResults = async () => {
  if (!videoHasMoreResults.value || videoIsLoadingMore.value || videoLoading.value) {
    return
  }

  console.log('🔄 Loading more video results...')
  videoCurrentPage.value++
  await loadVideos(false)
}

// Setup IntersectionObserver for infinite scroll
const setupVideoScrollObserver = () => {
  console.log('📡 Setting up video scroll observer', {
    hasSentinel: !!videoScrollSentinel.value,
    hasMoreResults: videoHasMoreResults.value,
    hasSearched: videoHasSearched.value,
    isLoading: videoLoading.value,
    isLoadingMore: videoIsLoadingMore.value
  })

  // Disconnect existing observer if any
  if (videoScrollObserver.value) {
    videoScrollObserver.value.disconnect()
  }

  // Wait for sentinel to be available
  if (!videoScrollSentinel.value) {
    console.warn('⚠️ Video sentinel element not found, cannot setup observer')
    return
  }

  // Create IntersectionObserver to detect when sentinel becomes visible
  videoScrollObserver.value = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        console.log('👁️ Video sentinel intersection:', {
          isIntersecting: entry.isIntersecting,
          isLoading: videoLoading.value,
          isLoadingMore: videoIsLoadingMore.value,
          hasMoreResults: videoHasMoreResults.value,
          hasSearched: videoHasSearched.value
        })

        if (entry.isIntersecting && !videoLoading.value && !videoIsLoadingMore.value && videoHasMoreResults.value) {
          console.log('🔄 Video IntersectionObserver triggered load more')
          loadMoreVideoResults()
        }
      })
    },
    {
      root: null, // Use viewport as root
      rootMargin: '400px', // Start loading 400px before reaching the sentinel
      threshold: 0
    }
  )

  // Start observing the sentinel
  videoScrollObserver.value.observe(videoScrollSentinel.value)
  console.log('✅ Video observer started observing sentinel')
}

const clearVideoFilters = () => {
  searchStore.resetVideoFilters()
  videos.value = []
  videoHasSearched.value = false
  videoTotalEstimate.value = 0
}

const searchSubjects = () => {
  subjectCurrentPage.value = 1
  loadSubjects()
}

const clearSubjectFilters = () => {
  searchStore.resetSubjectFilters()
  subjects.value = []
  subjectHasSearched.value = false
  subjectCurrentPage.value = 1
  subjectError.value = null
}

// Load videos function with infinite scroll support
const loadVideos = async (reset = false) => {
  // Prevent multiple simultaneous loads
  if (!reset && videoIsLoadingMore.value) {
    return
  }

  if (reset) {
    videoLoading.value = true
    videos.value = []
    videoCurrentPage.value = 1
  } else {
    videoIsLoadingMore.value = true
  }

  videoError.value = null
  videoHasSearched.value = true

  try {
    const params = new URLSearchParams()

    params.append('media_type', 'video')
    params.append('purpose', 'dest')

    // Use limit from search store
    const limit = typeof searchStore.videoSearch.limitOptions === 'object' ? searchStore.videoSearch.limitOptions.value : searchStore.videoSearch.limitOptions || 50
    params.append('limit', limit.toString())
    params.append('offset', ((videoCurrentPage.value - 1) * limit).toString())

    // Handle dynamic sorting - video search uses separate sortType and sortOrder fields
    const sortType = typeof searchStore.videoSearch.sortType === 'object' ? searchStore.videoSearch.sortType.value : searchStore.videoSearch.sortType || 'random'

    const sortOrder = typeof searchStore.videoSearch.sortOrder === 'object' ? searchStore.videoSearch.sortOrder.value : searchStore.videoSearch.sortOrder || 'asc'

    params.append('sort_by', sortType)
    params.append('sort_order', sortOrder)

    // Add selected tags
    if (searchStore.videoSearch.selectedTags.length > 0) {
      params.append('tags', searchStore.videoSearch.selectedTags.join(','))
    }

    // Add rating filter - only if something is selected
    if (searchStore.videoSearch.selectedRatings.length > 0) {
      params.append('ratings', searchStore.videoSearch.selectedRatings.join(','))
    }

    // Add unrated filter - only if showUnrated is true
    if (searchStore.videoSearch.showUnrated) {
      params.append('unrated_only', 'true')
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

    console.log('🌐 Making API request:', {
      reset,
      currentPage: videoCurrentPage.value,
      queryString: params.toString()
    })

    const response = await useApiFetch(`media/search?${params.toString()}`)
    const newResults = response.results || []

    // Append or replace results
    if (reset) {
      videos.value = newResults
    } else {
      videos.value = [...videos.value, ...newResults]
    }

    // Check if there are more results to load
    const gotFullPage = newResults.length === limit
    videoHasMoreResults.value = gotFullPage

    // Estimate total for display
    if (gotFullPage) {
      videoTotalEstimate.value = videoCurrentPage.value * limit + 1
    } else {
      videoTotalEstimate.value = (videoCurrentPage.value - 1) * limit + newResults.length
    }

    console.log('📊 Video search completed:', {
      reset,
      resultsCount: newResults.length,
      totalResults: videos.value.length,
      hasMoreResults: videoHasMoreResults.value
    })
  } catch (err) {
    console.error('Error loading videos:', err)
    videoError.value = err.message || 'Failed to load videos'
    if (!reset) {
      // Don't clear existing results on append error
      videoHasMoreResults.value = false
    }
  } finally {
    if (reset) {
      videoLoading.value = false
    } else {
      videoIsLoadingMore.value = false
    }
  }
}

// Load subjects function - uses cached data with local filtering only
const loadSubjects = async () => {
  subjectLoading.value = true
  subjects.value = []
  subjectCurrentPage.value = 1

  subjectError.value = null
  subjectHasSearched.value = true

  try {
    // Get subjects from cache ONLY - no API calls
    const { store } = useSubjects()
    const cachedSubjects = store.getCachedFullSubjects([]) || []

    if (cachedSubjects.length === 0) {
      // If no cache, show error instead of making API call
      throw new Error('Subjects cache not loaded. Please refresh the page.')
    }

    // Apply LOCAL filtering to cached data (no API calls)
    let filteredSubjects = [...cachedSubjects]

    // Apply name category filters locally
    filteredSubjects = filteredSubjects.filter(subject => {
      const name = subject.name.toLowerCase()
      const isCeleb = name.includes('celeb')
      const isAsmr = name.includes('asmr')

      // If celeb filter is on and this is a celeb subject, include it
      if (searchStore.subjectSearch.nameFilters.celeb && isCeleb) {
        return true
      }

      // If asmr filter is on and this is an asmr subject, include it
      if (searchStore.subjectSearch.nameFilters.asmr && isAsmr) {
        return true
      }

      // If real filter is on and this is NOT celeb or asmr, include it
      if (searchStore.subjectSearch.nameFilters.real && !isCeleb && !isAsmr) {
        return true
      }

      // If none of the filters match, exclude this subject
      return false
    })

    // Apply tag filtering locally (only if tags are selected)
    if (searchStore.subjectSearch.selectedTags.length > 0) {
      filteredSubjects = filteredSubjects.filter(subject => {
        if (!subject.tags || !subject.tags.tags) return false

        const subjectTags = subject.tags.tags.map(tag => tag.toLowerCase())
        return searchStore.subjectSearch.selectedTags.some(selectedTag => subjectTags.some(subjectTag => subjectTag.includes(selectedTag.toLowerCase())))
      })
    }

    // Apply local sorting
    const sortValue = typeof searchStore.subjectSearch.sortOptions === 'object' ? searchStore.subjectSearch.sortOptions.value : searchStore.subjectSearch.sortOptions

    // Fix parsing - split on last underscore, not first
    let sortBy, sortOrder
    if (sortValue.includes('_')) {
      const lastUnderscoreIndex = sortValue.lastIndexOf('_')
      sortBy = sortValue.substring(0, lastUnderscoreIndex)
      sortOrder = sortValue.substring(lastUnderscoreIndex + 1)
    } else {
      sortBy = 'total_jobs'
      sortOrder = 'desc'
    }

    filteredSubjects.sort((a, b) => {
      let aVal, bVal

      switch (sortBy) {
        case 'name':
          aVal = a.name || ''
          bVal = b.name || ''
          break
        case 'created_at':
          aVal = new Date(a.created_at || 0)
          bVal = new Date(b.created_at || 0)
          break
        case 'updated_at':
          aVal = new Date(a.updated_at || 0)
          bVal = new Date(b.updated_at || 0)
          break
        case 'total_jobs':
        default:
          // Use the correct field name from cached subjects
          aVal = Number(a.total_job_count) || 0
          bVal = Number(b.total_job_count) || 0
          break
      }

      if (sortOrder === 'desc') {
        if (sortBy === 'total_jobs') {
          // For numeric values, use proper numeric comparison
          return bVal - aVal
        } else {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
        }
      } else {
        if (sortBy === 'total_jobs') {
          // For numeric values, use proper numeric comparison
          return aVal - bVal
        } else {
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        }
      }
    })

    subjects.value = filteredSubjects
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

    if (selectedJobType.value === 'i2v' && bulkMode.value) {
      // Single bulk request — backend resolves qualifying subjects + their images
      // and inserts every job in one shot.
      try {
        const response = await useApiFetch('jobs/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            job_type: 'i2v',
            source_job_type: i2vSourceJobTypeFilter.value,
            parameters: applyLoraDisableOverrides(i2vParams.value)
          }
        })
        successCount = response?.created || 0
        const subjectsCount = response?.subjects_qualified || 0
        const skipped = response?.skipped_already_queued || 0
        if (successCount === 0) {
          const filterSuffix = i2vSourceJobTypeFilter.value !== 'all'
            ? ` matching the ${i2vSourceJobTypeFilterLabel.value.toLowerCase()} filter`
            : ''
          toast.add({
            title: 'Nothing to queue',
            description: skipped > 0
              ? `All ${skipped} matching favorite${skipped !== 1 ? 's are' : ' is'} already queued for this preset.`
              : `No favorited source images found${filterSuffix}. Mark some from the Manage Subject modal.`,
            color: 'info',
            duration: 4000
          })
        } else {
          const skipNote = skipped > 0 ? ` (skipped ${skipped} already queued)` : ''
          toast.add({
            title: 'Bulk Jobs Queued',
            description: `Created ${successCount} i2v job${successCount !== 1 ? 's' : ''} from favorites across ${subjectsCount} subject${subjectsCount !== 1 ? 's' : ''}${skipNote}.`,
            color: 'success',
            duration: 4000
          })
        }
        if (successCount > 0) {
          emit('jobsCreated', { successCount, errorCount: 0, bulk: true })
          closeModal()
        }
      } catch (error) {
        errorCount = 1
        errors.push(error?.data?.statusMessage || error?.message || 'Unknown error')
        toast.add({
          title: 'Bulk Creation Failed',
          description: error?.data?.statusMessage || error?.message || 'Could not create jobs',
          color: 'error',
          duration: 4000
        })
      }
      isSubmitting.value = false
      return
    } else if (selectedJobType.value === 'i2v') {
      // Create one i2v job per selected source image
      for (const img of i2vSelectedImages.value) {
        try {
          const payload = {
            job_type: 'i2v',
            source_media_uuid: img.uuid,
            subject_uuid: i2vSelectedSubject.value?.value || null,
            parameters: applyLoraDisableOverrides(i2vParams.value)
          }

          await useApiFetch('submit-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          })

          successCount++
        } catch (error) {
          errorCount++
          errors.push(`${img.filename || img.uuid}: ${error.message}`)
        }
      }
    } else if (selectedJobType.value === 'tagging') {
      // Single batch request to /api/media/tag-batch.
      // If the user selected specific images, tag those. Otherwise tag everything
      // currently visible (after the filter).
      const uuids = taggingSelectedImages.value.length > 0
        ? taggingSelectedImages.value.map(i => i.uuid)
        : taggingFilteredImages.value.map(i => i.uuid)

      if (uuids.length === 0) {
        toast.add({
          title: 'Nothing to tag',
          description: 'No images match the current filter or selection.',
          color: 'info',
          duration: 4000
        })
        isSubmitting.value = false
        return
      }

      try {
        const response = await useApiFetch('media/tag-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { media_uuids: uuids }
        })
        successCount = response?.count || uuids.length
        toast.add({
          title: 'Tagging started',
          description: `Queued ${successCount} image${successCount !== 1 ? 's' : ''} for tagging. Tags will appear when ready.`,
          color: 'success',
          duration: 4000
        })
        emit('jobsCreated', { successCount, errorCount: 0 })
        closeModal()
      } catch (error) {
        errorCount = 1
        errors.push(error?.data?.statusMessage || error?.message || 'Unknown error')
        toast.add({
          title: 'Tagging Failed',
          description: error?.data?.statusMessage || error?.message || 'Could not start tagging',
          color: 'error',
          duration: 4000
        })
      }
      isSubmitting.value = false
      return
    } else if (selectedJobType.value === 'fs') {
      // Create one fs job per (selected face × selected dest image) pair.
      // Each face is the ReActor identity (source_media_uuid); each dest
      // image is the swap target (dest_media_uuid). Output lands as a
      // favorited i2v source image so bulk-i2v auto-picks it up.
      for (const face of fsSelectedFaces.value) {
        for (const destImg of fsSelectedDestImages.value) {
          try {
            const payload = {
              job_type: 'fs',
              subject_uuid: fsSelectedSubject.value.value,
              source_media_uuid: face.uuid,
              dest_media_uuid: destImg.uuid,
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
            errors.push(`${face.filename || face.uuid} → ${destImg.filename || destImg.uuid}: ${error.message}`)
          }
        }
      }
    } else if (workflowMode.value === 'subject-first') {
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

    // Emit success event and close modal
    if (successCount > 0) {
      emit('jobsCreated', { successCount, errorCount })
      closeModal()
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

// When the source-job-type filter changes while a subject is selected in the
// i2v flow, reload that subject's images so the grid matches the new filter.
// Bulk mode pulls candidates server-side at submit time, so no reload there.
watch(i2vSourceJobTypeFilter, () => {
  if (selectedJobType.value === 'i2v' && i2vSelectedSubject.value && !bulkMode.value) {
    i2vSelectedImages.value = []
    loadI2vSubjectImages(i2vSelectedSubject.value.value)
  }
})

// Watch for modal opening/closing
watch(
  () => props.modelValue,
  isOpen => {
    if (!isOpen) {
      resetWorkflow()
      // Clean up observers when modal closes
      if (videoScrollObserver.value) {
        videoScrollObserver.value.disconnect()
        videoScrollObserver.value = null
      }
      if (destImageScrollObserver.value) {
        destImageScrollObserver.value.disconnect()
        destImageScrollObserver.value = null
      }
    }
  }
)

// Watch for dest image results to re-setup the fs scroll observer
watch(destImages, newResults => {
  nextTick(() => {
    if (newResults.length > 0 && destImageHasMoreResults.value) {
      setTimeout(() => {
        if (destImageScrollSentinel.value) {
          setupDestImageScrollObserver()
        }
      }, 100)
    }
  })
})

// Watch for video results changes to re-setup observer
watch(videos, newResults => {
  console.log('👀 videos watcher fired:', {
    resultsCount: newResults.length,
    hasSearched: videoHasSearched.value,
    hasMoreResults: videoHasMoreResults.value
  })

  // Re-setup observer when results change to ensure sentinel is observed
  nextTick(() => {
    console.log('⏭️ After nextTick, checking video sentinel:', {
      hasSentinel: !!videoScrollSentinel.value,
      hasSearched: videoHasSearched.value,
      hasMoreResults: videoHasMoreResults.value
    })

    // Set up observer if we have results and more results to load
    if (newResults.length > 0 && videoHasMoreResults.value) {
      setTimeout(() => {
        if (videoScrollSentinel.value) {
          console.log('🎯 Setting up observer with video sentinel')
          setupVideoScrollObserver()
        } else {
          console.warn('⚠️ Video sentinel still not available after timeout')
        }
      }, 100)
    }
  })
})

// Cleanup observers on unmount
onUnmounted(() => {
  if (videoScrollObserver.value) {
    videoScrollObserver.value.disconnect()
    videoScrollObserver.value = null
  }
  if (destImageScrollObserver.value) {
    destImageScrollObserver.value.disconnect()
    destImageScrollObserver.value = null
  }
})

// Pre-fill the i2v workflow from an existing job so the user can tweak and re-submit.
// Currently only supports i2v jobs (the ones that have a single source image + params).
const duplicateFromJob = async (job) => {
  if (!job) return

  if (job.job_type !== 'i2v') {
    const toast = useToast()
    toast.add({
      title: 'Cannot Duplicate',
      description: `Duplicate is only supported for i2v jobs right now (this job is ${job.job_type || 'unknown'}).`,
      color: 'warning',
      duration: 4000
    })
    return
  }

  if (!job.subject_uuid || !job.source_media_uuid) {
    const toast = useToast()
    toast.add({
      title: 'Cannot Duplicate',
      description: 'This job is missing a subject or source image.',
      color: 'warning',
      duration: 4000
    })
    return
  }

  // Reset any prior state and enter the i2v flow
  resetWorkflow()
  selectedJobType.value = 'i2v'
  form.value.job_type = 'i2v'
  await fetchLoras()

  // Seed the subject from the job
  i2vSelectedSubject.value = {
    value: job.subject_uuid,
    label: job.subject?.name || 'Subject',
    tags: job.subject?.tags || null
  }

  // Load the subject's source images, then pick the one from this job
  await loadI2vSubjectImages(job.subject_uuid)
  const match = i2vSubjectImages.value.find(img => img.uuid === job.source_media_uuid)
  if (match) {
    i2vSelectedImages.value = [match]
  } else if (job.source_media) {
    // Fall back to the embedded source_media if the image list doesn't include it
    // (e.g. the source was deleted or filtered out)
    i2vSelectedImages.value = [job.source_media]
  }

  // Seed params — strip internal preset stash markers so we don't show a stale preset
  const params = job.parameters || {}
  const { _preset_id, _preset_name, ...rest } = params
  void _preset_id
  i2vParams.value = {
    ...i2vParams.value,
    ...rest,
    // Preserve the preset identity so the jobs list still shows the preset badge on the clone
    ...(params._preset_id ? { _preset_id: params._preset_id, _preset_name: params._preset_name } : {})
  }

  isOpen.value = true
}

// Open the modal in preset-edit mode for the preset that a queued job references.
// Always fetch the preset definition fresh — queued jobs no longer carry a parameter
// snapshot (that only gets stamped on at queued→active), so job.parameters is either
// synthesized server-side or stale latent data. Either way, the preset row is the
// source of truth for what to show in the form.
const editPresetFromJob = async (job) => {
  const toast = useToast()
  if (!job?.preset_id) {
    toast.add({
      title: 'No preset',
      description: 'This job is not linked to a preset.',
      color: 'warning',
      duration: 3000
    })
    return
  }
  if (job.job_type !== 'i2v') {
    toast.add({
      title: 'Cannot edit preset',
      description: `Preset editing is only supported for i2v jobs (this job is ${job.job_type || 'unknown'}).`,
      color: 'warning',
      duration: 4000
    })
    return
  }

  let preset
  try {
    const data = await $fetch('/api/presets?job_type=i2v')
    preset = data?.presets?.find(p => p.id === job.preset_id)
  } catch (e) {
    console.error('Failed to fetch preset:', e)
  }
  if (!preset) {
    toast.add({
      title: 'Preset not found',
      description: 'Could not load the preset definition for this job.',
      color: 'warning',
      duration: 4000
    })
    return
  }

  resetWorkflow()
  presetEditMode.value = true
  selectedJobType.value = 'i2v'
  form.value.job_type = 'i2v'
  await fetchLoras()

  const seeded = {
    prompt: preset.prompt || '',
    negative_prompt: preset.negativePrompt || i2vParams.value.negative_prompt,
    length: preset.length || 81,
    lora_1_high: preset.lora1High || null,
    lora_1_low: preset.lora1Low || null,
    lora_1_high_strength: preset.lora1HighStrength ?? 1,
    lora_1_low_strength: preset.lora1LowStrength ?? 1,
    lora_2_high: preset.lora2High || null,
    lora_2_low: preset.lora2Low || null,
    lora_2_high_strength: preset.lora2HighStrength ?? 1,
    lora_2_low_strength: preset.lora2LowStrength ?? 1,
    lora_3_high: preset.lora3High || null,
    lora_3_low: preset.lora3Low || null,
    lora_3_high_strength: preset.lora3HighStrength ?? 1,
    lora_3_low_strength: preset.lora3LowStrength ?? 1,
    lora_4_high: preset.lora4High || null,
    lora_4_low: preset.lora4Low || null,
    lora_4_high_strength: preset.lora4HighStrength ?? 1,
    lora_4_low_strength: preset.lora4LowStrength ?? 1,
    lora_5_high: preset.lora5High || null,
    lora_5_low: preset.lora5Low || null,
    lora_5_high_strength: preset.lora5HighStrength ?? 1,
    lora_5_low_strength: preset.lora5LowStrength ?? 1,
    _preset_id: preset.id,
    _preset_name: preset.name,
  }
  if (preset.lora1HighStrengthOff) seeded[loraOffKey('lora_1_high_strength')] = true
  if (preset.lora1LowStrengthOff) seeded[loraOffKey('lora_1_low_strength')] = true
  if (preset.lora2HighStrengthOff) seeded[loraOffKey('lora_2_high_strength')] = true
  if (preset.lora2LowStrengthOff) seeded[loraOffKey('lora_2_low_strength')] = true
  if (preset.lora3HighStrengthOff) seeded[loraOffKey('lora_3_high_strength')] = true
  if (preset.lora3LowStrengthOff) seeded[loraOffKey('lora_3_low_strength')] = true
  if (preset.lora4HighStrengthOff) seeded[loraOffKey('lora_4_high_strength')] = true
  if (preset.lora4LowStrengthOff) seeded[loraOffKey('lora_4_low_strength')] = true
  if (preset.lora5HighStrengthOff) seeded[loraOffKey('lora_5_high_strength')] = true
  if (preset.lora5LowStrengthOff) seeded[loraOffKey('lora_5_low_strength')] = true
  i2vParams.value = seeded

  isOpen.value = true
}

defineExpose({ duplicateFromJob, editPresetFromJob })
</script>

<style scoped>
.custom-scrollbar {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* Internet Explorer 10+ */
}

.custom-scrollbar::-webkit-scrollbar {
  display: none; /* Safari and Chrome */
}
</style>
