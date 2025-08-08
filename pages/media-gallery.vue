<template>
  <div class="container mx-auto p-3 sm:p-6 pb-16 sm:pb-24">
    <div class="mb-4 sm:mb-8">
      <h1 class="text-md sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
        Media
      </h1>
    </div>

    <!-- Search Filters -->
    <UCard class="mb-3 sm:mb-6">
      <template #header>
        <div class="flex justify-between items-center">
          <h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            Search Filters
          </h2>
          <div class="flex gap-2 items-center">
            <!-- Upload Videos Button -->
            <UButton
              color="green"
              variant="outline"
              size="xs"
              @click="openUploadModal"
            >
              <UIcon name="i-heroicons-arrow-up-tray" />
              <span class="hidden sm:inline">Upload Videos</span>
            </UButton>
            <!-- Slideshow Button -->
            <UButton
              color="primary"
              variant="outline"
              size="xs"
              @click="startSlideshow"
            >
              <UIcon name="i-heroicons-play" />
              <span class="hidden sm:inline">Slideshow</span>
            </UButton>
            <!-- Collapse Button -->
            <UButton
              variant="ghost"
              size="xs"
              @click="filtersCollapsed = !filtersCollapsed"
            >
              <UIcon :name="filtersCollapsed ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'" />
            </UButton>
          </div>
        </div>
      </template>

      <div v-show="!filtersCollapsed" class="space-y-3 sm:space-y-4">
        <!-- Media Type and Purpose on same line -->
        <div class="grid grid-cols-2 gap-3 sm:gap-4">
          <!-- Media Type Filter -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Media Type
            </label>
            <USelectMenu
              v-model="filters.media_type"
              :items="mediaTypeOptions"
              placeholder="All types"
              class="w-full"
            />
          </div>

          <!-- Purpose Filter -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Purpose
            </label>
            <USelectMenu
              v-model="filters.purpose"
              :items="purposeOptions"
              placeholder="All purposes"
              class="w-full"
            />
          </div>
        </div>

        <!-- Second row for Subject and Tags -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

          <!-- Subject Filter -->
          <div>
            <SubjectSearch
              v-model="selectedSubject"
              placeholder="Subject..."
              @select="handleSubjectSelection"
            />
          </div>

          <!-- Tags Filter -->
          <div>
            <div class="space-y-2">
              <UInputTags
                v-model="selectedTags"
                placeholder="Tags..."
                class="w-full"
              />
            </div>
          </div>
        </div>

        <!-- Third row for Tag Confirmation -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <!-- Tags Confirmed Filter -->
          <div>
            <div class="flex items-center space-x-3">
              <UCheckbox
                v-model="showUnconfirmedOnly"
                label="Only show unconfirmed tags"
                :ui="{
                  label: 'text-sm text-gray-700 dark:text-gray-300'
                }"
              />
            </div>
          </div>
          
          <!-- Completion Filters (only show for videos) -->
          <div v-if="filters.media_type?.value === 'video'">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Min Completions
                </label>
                <UInput
                  v-model.number="completionFilters.min_completions"
                  type="number"
                  placeholder="0"
                  min="0"
                  class="w-full"
                  size="sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Max Completions
                </label>
                <UInput
                  v-model.number="completionFilters.max_completions"
                  type="number"
                  placeholder="No limit"
                  min="0"
                  class="w-full"
                  size="sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sort Options and Limit -->
      <div v-show="!filtersCollapsed" class="grid grid-cols-3 gap-2 sm:gap-4 mt-3 sm:mt-4">
        <div>
          <USelectMenu
            v-model="sortOptions.sort_by"
            :items="sortByOptions"
            placeholder="Sort by..."
            class="w-full"
          />
        </div>
        <div>
          <USelectMenu
            v-model="sortOptions.sort_order"
            :items="sortOrderOptions"
            placeholder="Sort order..."
            class="w-full"
          />
        </div>
        <div>
          <USelectMenu
            v-model="pagination.limit"
            :items="limitOptions"
            placeholder="Results per page..."
            class="w-full"
          />
        </div>
      </div>

      <div v-show="!filtersCollapsed" class="flex gap-2 sm:gap-4 mt-3 sm:mt-4">
        <UButton
          v-if="!isLoading"
          color="primary"
          size="sm"
          @click="searchMedia"
        >
          Search
        </UButton>
        <UButton
          v-else
          color="error"
          variant="outline"
          size="sm"
          @click="cancelSearch"
        >
          <UIcon name="i-heroicons-x-mark" class="mr-1 sm:mr-2" />
          <span class="hidden sm:inline">Cancel Search</span>
          <span class="sm:hidden">Cancel</span>
        </UButton>
        <UButton variant="outline" size="sm" @click="clearFilters">
          Clear
        </UButton>
      </div>
    </UCard>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
    </div>


    <!-- Results -->
    <div v-else-if="mediaResults.length > 0">
      <!-- Results Header -->
      <div class="flex justify-between items-center mb-3 sm:mb-4">
        <p class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Found {{ mediaResults.length }} media files
        </p>
        <div class="flex gap-1 sm:gap-2">
          <UButton
            :variant="viewMode === 'grid' ? 'solid' : 'outline'"
            size="xs"
            @click="viewMode = 'grid'"
          >
            <UIcon name="i-heroicons-squares-2x2" />
          </UButton>
          <UButton
            :variant="viewMode === 'list' ? 'solid' : 'outline'"
            size="xs"
            @click="viewMode = 'list'"
          >
            <UIcon name="i-heroicons-list-bullet" />
          </UButton>
        </div>
      </div>

      <!-- Grid View -->
      <div v-if="viewMode === 'grid'" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-3">
        <div
          v-for="media in mediaResults"
          :key="media.uuid"
          class="bg-neutral-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow group"
        >
          <!-- Image Preview -->
          <div
            v-if="media.type === 'image'"
            class="aspect-[3/4] relative cursor-pointer"
            @click="openModal(media)"
          >
            <img
              v-if="settingsStore.displayImages"
              :src="media.thumbnail ? media.thumbnail : `/api/media/${media.uuid}/image?size=sm`"
              :alt="media.filename"
              class="w-full h-full object-cover object-top"
              loading="lazy"
              @error="handleImageError"
              @load="handleImageLoad"
            >
            <ImagePlaceholder v-else />
            <!-- Delete Button - Top Right Corner -->
            <div class="absolute top-1 right-1 sm:top-2 sm:right-2 z-10">
              <UButton
                icon="i-heroicons-trash"
                color="error"
                variant="solid"
                size="xs"
                class="opacity-0 group-hover:opacity-75 sm:group-hover:opacity-25 transition-opacity duration-200 shadow-lg"
                :loading="deletingIds.includes(media.uuid)"
                @click.stop="confirmDelete(media)"
              />
            </div>
          </div>
          
          <!-- Video Preview (only show when displayImages is true) -->
          <div
            v-else-if="media.type === 'video' && settingsStore.displayImages"
            class="aspect-[3/4] relative cursor-pointer"
            :data-video-uuid="media.uuid"
            @click="openModal(media)"
            @mouseenter="handleVideoHover(media.uuid, true)"
            @mouseleave="handleVideoHover(media.uuid, false)"
          >
            <!-- Video element -->
            <video
              :ref="`video-${media.uuid}`"
              :poster="media.thumbnail ? media.thumbnail : (media.thumbnail_uuid ? `/api/media/${media.thumbnail_uuid}/image?size=sm` : undefined)"
              class="w-full h-full object-cover object-top"
              muted
              loop
              preload="metadata"
              playsinline
              webkit-playsinline
            >
              Your browser does not support the video tag.
            </video>
            
            <!-- Fallback for videos without thumbnails -->
            <div
              v-if="!media.thumbnail_uuid"
              class="absolute inset-0 bg-gray-800 flex items-center justify-center"
            >
              <UIcon name="i-heroicons-play-circle" class="text-4xl text-gray-400" />
            </div>
            
            <!-- Delete Button - Top Right Corner -->
            <div class="absolute top-1 right-1 sm:top-2 sm:right-2 z-10">
              <UButton
                icon="i-heroicons-trash"
                color="error"
                variant="solid"
                size="xs"
                class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg"
                :loading="deletingIds.includes(media.uuid)"
                @click.stop="confirmDelete(media)"
              />
            </div>
          </div>

          <!-- Media Info -->
          <div class="p-2 sm:p-3 cursor-pointer" @click="openModal(media)">
            <h3 class="font-medium text-xs sm:text-sm text-gray-900 dark:text-white truncate">
              {{ media.filename }}
            </h3>
            <p class="text-xs text-gray-500 mt-1 hidden sm:block">
              {{ media.type }} • {{ media.purpose }}
            </p>
            <div v-if="media.tags?.tags && media.tags.tags.length > 0" class="flex flex-wrap gap-1 mt-1 sm:mt-2 hidden sm:flex">
              <span
                v-for="tag in media.tags.tags.slice(0, 2)"
                :key="tag"
                class="px-1 sm:px-2 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 text-xs rounded border border-pink-200 dark:border-pink-800"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- List View -->
      <div v-else class="space-y-1 sm:space-y-2">
        <div
          v-for="media in mediaResults"
          :key="media.uuid"
          class="bg-neutral-800 rounded-lg p-2 sm:p-4 shadow-sm hover:shadow-md transition-shadow group"
        >
          <div class="flex items-center gap-2 sm:gap-4">
            <!-- Thumbnail -->
            <div class="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 dark:bg-gray-700 rounded shrink-0 cursor-pointer" @click="openModal(media)">
              <img
                v-if="media.type === 'image' && settingsStore.displayImages"
                :src="media.thumbnail ? media.thumbnail : `/api/media/${media.uuid}/image?size=sm`"
                :alt="media.filename"
                class="w-full h-full object-cover object-top rounded"
                loading="lazy"
                @error="handleImageError"
              >
              <ImagePlaceholder v-else-if="media.type === 'image'" />
              <div
                v-else-if="media.type === 'video' && settingsStore.displayImages"
                class="w-full h-full relative"
                :data-video-uuid="media.uuid"
                @mouseenter="handleVideoHover(media.uuid, true)"
                @mouseleave="handleVideoHover(media.uuid, false)"
              >
                <!-- Video element -->
                <video
                  :ref="`video-list-${media.uuid}`"
                  :poster="media.thumbnail ? media.thumbnail : (media.thumbnail_uuid ? `/api/media/${media.thumbnail_uuid}/image?size=sm` : undefined)"
                  class="w-full h-full object-cover object-top rounded"
                  muted
                  loop
                  preload="metadata"
                  playsinline
                  webkit-playsinline
                >
                  Your browser does not support the video tag.
                </video>
                
                <!-- Fallback for videos without thumbnails -->
                <div
                  v-if="!media.thumbnail_uuid"
                  class="absolute inset-0 bg-gray-800 flex items-center justify-center rounded"
                >
                  <UIcon name="i-heroicons-play-circle" class="text-2xl text-gray-400" />
                </div>
              </div>
              <div v-else-if="media.type === 'video'" class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-play-circle" class="text-2xl text-gray-400" />
              </div>
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-document" class="text-2xl text-gray-400" />
              </div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 cursor-pointer" @click="openModal(media)">
              <h3 class="font-medium text-sm sm:text-base text-gray-900 dark:text-white truncate">
                {{ media.filename }}
              </h3>
              <p class="text-xs sm:text-sm text-gray-500">
                {{ media.type }} • {{ media.purpose }}<span class="hidden sm:inline"> • {{ formatDate(media.created_at) }}</span>
              </p>
              <div v-if="media.tags?.tags && media.tags.tags.length > 0" class="flex flex-wrap gap-1 mt-1 hidden sm:flex">
                <span
                  v-for="tag in media.tags.tags.slice(0, 3)"
                  :key="tag"
                  class="px-2 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 text-xs rounded border border-pink-200 dark:border-pink-800"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="shrink-0 flex items-center gap-1 sm:gap-2">
              <UButton
                icon="i-heroicons-trash"
                color="error"
                variant="solid"
                size="xs"
                :loading="deletingIds.includes(media.uuid)"
                @click.stop="confirmDelete(media)"
              />
              <UIcon name="i-heroicons-chevron-right" class="text-gray-400 hidden sm:block" />
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="pagination.total > pagination.limit || pagination.has_more" class="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-gray-200 dark:border-gray-700 p-2 sm:p-4 z-50">
        <div class="flex justify-center">
          <UPagination
            v-model:page="currentPage"
            :items-per-page="pagination.limit"
            :total="pagination.total"
            show-last
            show-first
          />
        </div>
      </div>
    </div>

    <!-- No Results -->
    <div v-else-if="!isLoading && hasSearched" class="text-center py-8">
      <UIcon name="i-heroicons-photo" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">No media found matching your criteria</p>
    </div>

    <!-- Initial State -->
    <div v-else class="text-center py-8">
      <UIcon name="i-heroicons-magnifying-glass" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">Use the search filters above to find media</p>
    </div>

    <!-- Media Detail Modal -->
    <UModal v-model:open="isModalOpen">
      <template #body>
        <div v-if="selectedMedia" class="p-3 sm:p-6">
          <!-- Header -->
          <div class="flex justify-between items-center mb-3 sm:mb-6">
            <h3 class="text-base sm:text-lg font-semibold truncate pr-2">{{ selectedMedia.filename }}</h3>
            <div class="flex items-center gap-1 sm:gap-2 shrink-0">
              <span class="text-xs sm:text-sm text-gray-500 hidden sm:inline">{{ currentMediaIndex + 1 }} / {{ allMediaResults.length }}</span>
              <UButton
                variant="solid"
                icon="i-heroicons-trash"
                color="error"
                size="xs"
                :loading="deletingIds.includes(selectedMedia.uuid)"
                @click="confirmDelete(selectedMedia)"
              />
              <UButton
                variant="ghost"
                icon="i-heroicons-x-mark"
                size="xs"
                @click="isModalOpen = false"
              />
            </div>
          </div>

          <div class="space-y-4">
            <!-- Image Display -->
            <div v-if="selectedMedia.type === 'image'" class="max-w-full relative">
              <!-- Previous Button -->
              <UButton
                v-if="currentMediaIndex > 0"
                variant="solid"
                color="white"
                icon="i-heroicons-chevron-left"
                class="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg"
                @click="navigateMedia(-1)"
              />
              
              <img
                v-if="settingsStore.displayImages"
                :src="selectedMedia.thumbnail ? selectedMedia.thumbnail : `/api/media/${selectedMedia.uuid}/image?size=lg`"
                :alt="selectedMedia.filename"
                class="w-full h-auto max-h-[80vh] object-contain rounded"
                @error="handleImageError"
              >
              <div v-else class="w-full h-64 flex items-center justify-center">
                <ImagePlaceholder />
              </div>
              
              <!-- Next Button -->
              <UButton
                v-if="currentMediaIndex < allMediaResults.length - 1"
                variant="solid"
                color="white"
                icon="i-heroicons-chevron-right"
                class="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg"
                @click="navigateMedia(1)"
              />
            </div>

            <!-- Video Display (only show when displayImages is true) -->
            <div v-else-if="selectedMedia.type === 'video' && settingsStore.displayImages" class="max-w-full">
              <video
                ref="modalVideo"
                :src="`/api/stream/${selectedMedia.uuid}`"
                :poster="selectedMedia.thumbnail ? selectedMedia.thumbnail : (selectedMedia.thumbnail_uuid ? `/api/media/${selectedMedia.thumbnail_uuid}/image?size=sm` : undefined)"
                controls
                autoplay
                muted
                loop
                class="w-full h-auto max-h-[80vh] rounded"
                preload="metadata"
              >
                Your browser does not support the video tag.
              </video>
            </div>
            
            <!-- Video placeholder when displayImages is false -->
            <div v-else-if="selectedMedia.type === 'video'" class="w-full h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded">
              <div class="text-center">
                <UIcon name="i-heroicons-play-circle" class="text-6xl text-gray-400 mb-2" />
                <p class="text-gray-500">Video Hidden</p>
              </div>
            </div>

            <!-- Media Details Accordion -->
            <UAccordion :items="mediaDetailsItems">
              <template #details>
                <div class="space-y-3 text-left">
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ selectedMedia.type }}</span>
                    </div>
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Purpose</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ selectedMedia.purpose }}</span>
                    </div>
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ selectedMedia.status }}</span>
                    </div>
                    <div class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Created</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(selectedMedia.created_at) }}</span>
                    </div>
                  </div>

                  <!-- Video Metadata (only show for videos) -->
                  <div v-if="selectedMedia.type === 'video'" class="border-t border-gray-200 dark:border-gray-700 pt-3">
                    <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Video Information</h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
                      <div v-if="selectedMedia.width && selectedMedia.height" class="flex flex-col space-y-1">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Dimensions</span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ selectedMedia.width }} × {{ selectedMedia.height }}</span>
                      </div>
                      <div v-if="selectedMedia.duration" class="flex flex-col space-y-1">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Duration</span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDuration(selectedMedia.duration) }}</span>
                      </div>
                      <div v-if="selectedMedia.file_size" class="flex flex-col space-y-1">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">File Size</span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatFileSize(selectedMedia.file_size) }}</span>
                      </div>
                      <div v-if="selectedMedia.completions !== undefined" class="flex flex-col space-y-1">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Completions</span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ selectedMedia.completions }}</span>
                      </div>
                      <div v-if="getVideoFPS(selectedMedia)" class="flex flex-col space-y-1">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Frame Rate</span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ getVideoFPS(selectedMedia) }} fps</span>
                      </div>
                      <div v-if="getVideoCodec(selectedMedia)" class="flex flex-col space-y-1">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Codec</span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ getVideoCodec(selectedMedia) }}</span>
                      </div>
                      <div v-if="getVideoBitrate(selectedMedia)" class="flex flex-col space-y-1">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Bitrate</span>
                        <span class="text-sm text-gray-600 dark:text-gray-400">{{ getVideoBitrate(selectedMedia) }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Tags -->
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Tags</span>
                    <div v-if="selectedMedia.tags?.tags && selectedMedia.tags.tags.length > 0" class="flex flex-wrap gap-2">
                      <span
                        v-for="tag in selectedMedia.tags.tags"
                        :key="tag"
                        class="px-2 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 text-sm rounded border border-pink-200 dark:border-pink-800"
                      >
                        {{ tag }}
                      </span>
                    </div>
                    <div v-else class="text-sm text-gray-500 italic">
                      No tags available
                    </div>
                  </div>

                  <!-- UUID -->
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">UUID</span>
                    <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ selectedMedia.uuid }}</span>
                  </div>
                </div>
              </template>
            </UAccordion>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Slideshow Overlay -->
    <div v-if="isSlideshow" class="fixed top-0 left-0 w-full h-full z-[99999] bg-black">
      <!-- Video Container -->
      <div id="slideshow-video-container" class="absolute top-0 left-0 w-full h-full">
        <!-- Simple Loading indicator -->
        <div v-if="!slideshowVideo || isLoadingVideo" class="absolute inset-0 flex items-center justify-center text-white bg-black bg-opacity-75">
          <div class="text-center">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin text-6xl mb-4" />
            <p class="text-xl">Loading next video...</p>
          </div>
        </div>
      </div>
      
      <!-- Navigation Controls -->
      <div class="absolute top-4 right-4 z-50 flex gap-2">
        <UButton
          variant="solid"
          color="white"
          :icon="slideshowPaused ? 'i-heroicons-play' : 'i-heroicons-pause'"
          size="sm"
          @click="toggleSlideshowPause"
          @touchstart="toggleSlideshowPause"
          @touchend.prevent
        >
          {{ slideshowPaused ? 'Resume' : 'Pause' }}
        </UButton>
        <UButton
          variant="solid"
          color="white"
          icon="i-heroicons-x-mark"
          size="sm"
          @click="stopSlideshow"
          @touchstart="stopSlideshow"
          @touchend.prevent
        >
          Exit
        </UButton>
      </div>
      
      <!-- Navigation Arrows -->
      <div class="absolute top-0 left-0 w-full h-full flex items-center justify-between px-4 z-40">
        <UButton
          v-if="slideshowCurrentIndex > 0"
          variant="solid"
          color="white"
          icon="i-heroicons-chevron-left"
          size="lg"
          @click="slideshowPrevious"
          @touchstart="slideshowPrevious"
          @touchend.prevent
        />
        <div v-else class="w-12"></div>
        
        <UButton
          variant="solid"
          color="white"
          icon="i-heroicons-chevron-right"
          size="lg"
          @click="slideshowNext"
          @touchstart="slideshowNext"
          @touchend.prevent
        />
      </div>
      
    </div>

    <!-- Tag Edit Modal -->
    <TagEditModal
      v-model="isTagEditModalOpen"
      :media="selectedMediaForTagEdit"
      :current-index="tagEditCurrentIndex"
      :total-count="unconfirmedMediaResults.length"
      :has-next="tagEditCurrentIndex < unconfirmedMediaResults.length - 1"
      :show-skip-button="showUnconfirmedOnly"
      @save="handleTagSave"
      @skip="handleTagSkip"
      @close="closeTagEditModal"
    />

    <!-- Video Upload Modal -->
    <UModal v-model:open="isUploadModalOpen" :ui="{ width: 'sm:max-w-2xl' }">
      <template #body>
        <div class="p-3 sm:p-6">
          <!-- Header -->
          <div class="flex justify-between items-center mb-3 sm:mb-6">
            <h3 class="text-base sm:text-lg font-semibold">Upload Destination Videos</h3>
            <UButton
              variant="ghost"
              icon="i-heroicons-x-mark"
              size="xs"
              @click="closeUploadModal"
            />
          </div>

          <div class="space-y-4">
          <!-- File Selection -->
          <div v-if="!isUploading && uploadedFiles.length === 0">
            <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
              <UIcon name="i-heroicons-folder" class="text-4xl text-gray-400 mb-4" />
              <p class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Select Video Folder
              </p>
              <p class="text-sm text-gray-500 mb-4">
                Choose a folder containing destination videos to upload
              </p>
              <input
                ref="folderInput"
                type="file"
                webkitdirectory
                directory
                multiple
                accept="video/*"
                class="hidden"
                @change="handleFolderSelection"
              >
              <UButton
                color="primary"
                @click="$refs.folderInput?.click()"
              >
                <UIcon name="i-heroicons-folder-open" class="mr-2" />
                Choose Folder
              </UButton>
            </div>
          </div>

          <!-- Selected Files Preview -->
          <div v-if="selectedFiles.length > 0 && !isUploading">
            <div class="mb-4">
              <h4 class="text-md font-medium text-gray-900 dark:text-white mb-2">
                Selected Videos ({{ selectedFiles.length }})
              </h4>
              <p class="text-sm text-gray-500">
                Total size: {{ formatFileSize(totalSize) }}
              </p>
            </div>
            
            <!-- Summary Card -->
            <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    Ready to upload {{ selectedFiles.length }} video{{ selectedFiles.length === 1 ? '' : 's' }}
                  </p>
                  <p class="text-xs text-gray-500">
                    {{ formatFileSize(totalSize) }} total • Will be processed in batches of 5
                  </p>
                </div>
                <UIcon name="i-heroicons-video-camera" class="text-2xl text-gray-400" />
              </div>
            </div>

            <div class="flex gap-2">
              <UButton
                color="primary"
                :loading="isUploading"
                @click="startUpload"
              >
                <UIcon name="i-heroicons-arrow-up-tray" class="mr-2" />
                Upload {{ selectedFiles.length }} Videos
              </UButton>
              <UButton
                variant="outline"
                @click="clearSelection"
              >
                Clear Selection
              </UButton>
            </div>
          </div>

          <!-- Upload Progress -->
          <div v-if="isUploading">
            <div class="mb-4">
              <div class="flex justify-between items-center mb-2">
                <h4 class="text-md font-medium text-gray-900 dark:text-white">
                  Uploading Videos...
                </h4>
                <span class="text-sm text-gray-500">
                  {{ uploadProgress.completed }} / {{ uploadProgress.total }}
                </span>
              </div>
              <UProgress
                :value="(uploadProgress.completed / uploadProgress.total) * 100"
                class="mb-2"
              />
              <p class="text-sm text-gray-500">
                {{ uploadProgress.currentFile || 'Processing...' }}
              </p>
            </div>

            <!-- Upload Results -->
            <div v-if="uploadResults.length > 0" class="max-h-40 overflow-y-auto space-y-2">
              <div
                v-for="result in uploadResults"
                :key="result.filename"
                class="flex items-center justify-between p-2 rounded"
                :class="result.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'"
              >
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="result.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="result.success ? 'text-green-500' : 'text-red-500'"
                  />
                  <span class="text-sm font-medium">{{ result.filename }}</span>
                </div>
                <span v-if="!result.success" class="text-xs text-red-600 dark:text-red-400">
                  {{ result.error }}
                </span>
              </div>
            </div>
          </div>

          <!-- Upload Complete -->
          <div v-if="uploadComplete">
            <div class="text-center py-4">
              <UIcon name="i-heroicons-check-circle" class="text-4xl text-green-500 mb-2" />
              <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Upload Complete!
              </h4>
              <p class="text-sm text-gray-500">
                Successfully uploaded {{ uploadResults.filter(r => r.success).length }} videos
                {{ uploadResults.filter(r => !r.success).length > 0 ?
                  `(${uploadResults.filter(r => !r.success).length} failed)` : '' }}
              </p>
            </div>
            
            <div class="flex gap-2 justify-center">
              <UButton
                color="primary"
                @click="refreshAfterUpload"
              >
                Refresh Gallery
              </UButton>
              <UButton
                variant="outline"
                @click="closeUploadModal"
              >
                Close
              </UButton>
            </div>
          </div>
        </div>
        </div>
      </template>
    </UModal>

  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { nextTick } from 'vue'

// Device detection
const { isMobile } = useDevice()

// Page metadata
definePageMeta({
  title: 'Media Gallery'
})

// Initialize settings store
const settingsStore = useSettingsStore()

// Reactive data
const filters = ref({
  media_type: { label: 'Videos', value: 'video' }, // Default to videos in dropdown format
  purpose: { label: 'Output', value: 'output' }, // Default to output purpose
  subject_uuid: ''
})

// Tag search functionality
const selectedTags = ref([])

// Tag editing functionality
const showUnconfirmedOnly = ref(false)
const isTagEditModalOpen = ref(false)
const selectedMediaForTagEdit = ref(null)
const tagEditCurrentIndex = ref(-1)
const unconfirmedMediaResults = ref([])

// Video upload functionality
const isUploadModalOpen = ref(false)
const selectedFiles = ref([])
const isUploading = ref(false)
const uploadComplete = ref(false)
const uploadProgress = ref({
  completed: 0,
  total: 0,
  currentFile: ''
})
const uploadResults = ref([])
const uploadedFiles = ref([])

// Completion filters with defaults for media gallery (min=0, max=null)
const completionFilters = ref({
  min_completions: 0,
  max_completions: null
})

// Subject selection state
const selectedSubject = ref(null)

const sortOptions = ref({
  sort_by: 'created_at',
  sort_order: 'desc'
})

const mediaResults = ref([])
const isLoading = ref(false)
const hasSearched = ref(false)
const viewMode = ref('grid')
const selectedMedia = ref(null)
const deletingIds = ref([])
const isModalOpen = ref(false)
const currentPage = ref(1)
const pagination = ref({
  total: 0,
  limit: 25,
  offset: 0,
  has_more: false
})

// Video hover state
const hoveredVideoId = ref(null)

// Slideshow state
const isSlideshow = ref(false)
const slideshowVideo = ref(null)
const slideshowVideos = ref([]) // Array of video UUIDs from database
const slideshowCurrentIndex = ref(-1)
const slideshowPaused = ref(false)
const isLoadingNextBatch = ref(false) // Track if we're loading the next batch
const slideshowOffset = ref(0) // Current offset for pagination
const slideshowBatchSize = ref(10) // Number of videos to fetch per batch

// Search filters collapse state
const filtersCollapsed = ref(false)

// Loading state to prevent multiple simultaneous loads
const isLoadingVideo = ref(false)

// Computed properties for navigation
const imageResults = computed(() => {
  return mediaResults.value.filter(media => media.type === 'image')
})

const allMediaResults = computed(() => {
  return mediaResults.value
})


const currentImageIndex = computed(() => {
  if (!selectedMedia.value) return -1
  return imageResults.value.findIndex(media => media.uuid === selectedMedia.value.uuid)
})

const currentMediaIndex = computed(() => {
  if (!selectedMedia.value) return -1
  return allMediaResults.value.findIndex(media => media.uuid === selectedMedia.value.uuid)
})

const mediaDetailsItems = computed(() => {
  if (!selectedMedia.value) return []
  
  return [{
    label: 'Media Details',
    slot: 'details'
  }]
})

// Upload computed properties
const totalSize = computed(() => {
  return selectedFiles.value.reduce((total, file) => total + file.size, 0)
})

// Filter options
const mediaTypeOptions = [
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' }
]

const purposeOptions = [
  { label: 'All Purposes', value: '' },
  { label: 'Source', value: 'source' },
  { label: 'Destination', value: 'dest' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Backup', value: 'backup' },
  { label: 'Output', value: 'output' },
  { label: 'Thumbnail', value: 'thumbnail' }
]

const sortByOptions = [
  { label: 'Random', value: 'random' },
  { label: 'Created Date', value: 'created_at' },
  { label: 'Updated Date', value: 'updated_at' },
  { label: 'Filename', value: 'filename' },
  { label: 'File Size', value: 'file_size' },
  { label: 'Type', value: 'type' },
  { label: 'Purpose', value: 'purpose' },
  { label: 'Status', value: 'status' },
  { label: 'Width', value: 'width' },
  { label: 'Height', value: 'height' },
  { label: 'Duration', value: 'duration' },
  { label: 'Last Accessed', value: 'last_accessed' },
  { label: 'Access Count', value: 'access_count' }
]

const sortOrderOptions = [
  { label: 'Ascending', value: 'asc' },
  { label: 'Descending', value: 'desc' }
]

const limitOptions = [
  { label: '25 results', value: 25 },
  { label: '50 results', value: 50 },
  { label: '100 results', value: 100 },
  { label: '200 results', value: 200 },
  { label: '500 results', value: 500 }
]



// Search cancellation
const searchController = ref(null)

// Methods
const searchMedia = async () => {
  isLoading.value = true
  hasSearched.value = true
  
  // Only collapse filters on mobile devices after search is submitted
  if (isMobile) {
    filtersCollapsed.value = true
  }

  // Create new AbortController for this search
  searchController.value = new AbortController()

  try {
    const params = new URLSearchParams()
    
    // Extract values from objects if needed
    const mediaType = typeof filters.value.media_type === 'object' ? filters.value.media_type.value : filters.value.media_type
    const purpose = typeof filters.value.purpose === 'object' ? filters.value.purpose.value : filters.value.purpose
    
    if (mediaType) params.append('media_type', mediaType)
    if (purpose) params.append('purpose', purpose)
    if (filters.value.subject_uuid) params.append('subject_uuid', filters.value.subject_uuid)
    
    // Add selected tags from UInputTags component
    if (selectedTags.value.length > 0) {
      params.append('tags', selectedTags.value.join(','))
    }
    // Always use partial match mode (API only supports this)
    params.append('tag_match_mode', 'partial')
    
    // Add completion filters (only for video searches)
    if (mediaType === 'video') {
      if (completionFilters.value.min_completions != null) {
        params.append('min_completions', completionFilters.value.min_completions.toString())
      }
      if (completionFilters.value.max_completions != null) {
        params.append('max_completions', completionFilters.value.max_completions.toString())
      }
    }
    
    // Add tags_confirmed filter
    if (showUnconfirmedOnly.value) {
      params.append('tags_confirmed', 'false')
    }
    
    // Handle limit - extract value if it's an object
    const limit = typeof pagination.value.limit === 'object' ? pagination.value.limit.value : pagination.value.limit
    params.append('limit', limit.toString())
    params.append('offset', ((currentPage.value - 1) * limit).toString())
    
    // Add sort parameters
    const sortBy = typeof sortOptions.value.sort_by === 'object' ? sortOptions.value.sort_by.value : sortOptions.value.sort_by
    const sortOrder = typeof sortOptions.value.sort_order === 'object' ? sortOptions.value.sort_order.value : sortOptions.value.sort_order
    
    if (sortBy) {
      params.append('sort_by', sortBy)
      // For random sorting, order doesn't matter but API expects it
      if (sortBy === 'random') {
        params.append('sort_order', 'asc')
      } else if (sortOrder) {
        params.append('sort_order', sortOrder)
      }
    }
    
    params.append('include_thumbnails', 'true')

    const response = await useApiFetch(`media/search?${params.toString()}`, {
      signal: searchController.value.signal
    })
    
    const allResults = response.results || []
    
    // Filter results based on media type selection
    mediaResults.value = allResults.filter(media => {
      // If searching specifically for images, exclude thumbnails to avoid duplicates
      if (mediaType === 'image') {
        return media.type === 'image' && media.purpose !== 'thumbnail'
      }
      // If searching specifically for videos, only include videos
      if (mediaType === 'video') {
        return media.type === 'video'
      }
      // For general searches, exclude thumbnails to avoid duplicates
      return media.purpose !== 'thumbnail'
    })
    
    // Log any videos without thumbnails but don't filter them out
    mediaResults.value.forEach(media => {
      if (media.type === 'video' && !media.thumbnail_uuid) {
        console.warn(`Video ${media.uuid} (${media.filename}) has no thumbnail_uuid`)
      }
    })
    
    // Update pagination info based on API response
    const currentLimit = typeof pagination.value.limit === 'object' ? pagination.value.limit.value : pagination.value.limit
    const currentOffset = response.offset || ((currentPage.value - 1) * currentLimit)
    
    // Check if there are more results by seeing if we got a full page
    const hasMore = response.count === currentLimit
    
    // For pagination display, we need to estimate total based on current results
    // If we have a full page, assume there might be more
    if (hasMore) {
      // Estimate total as at least current offset + current count + 1 (to show next page)
      pagination.value.total = currentOffset + response.count + 1
    } else {
      // This is the last page, so total is offset + actual count
      pagination.value.total = currentOffset + response.count
    }
    
    pagination.value = {
      ...pagination.value,
      limit: currentLimit,
      offset: currentOffset,
      has_more: hasMore
    }
    
    
  } catch (err) {
    // Don't show error if search was cancelled
    if (err.name === 'AbortError') {
      console.log('Search was cancelled')
      return
    }
    
    console.error('Search error:', err)
    const toast = useToast()
    
    let errorMessage = 'Failed to search media'
    if (err.statusCode === 503) {
      errorMessage = 'Media API is not available. Please ensure the service is running on localhost:8000'
    } else if (err.data?.message) {
      errorMessage = err.data.message
    }
    
    toast.add({
      title: 'Media Search Error',
      description: errorMessage,
      color: 'red',
      timeout: 5000
    })
    
    mediaResults.value = []
  } finally {
    isLoading.value = false
    searchController.value = null
  }
}


const cancelSearch = () => {
  if (searchController.value) {
    searchController.value.abort()
    isLoading.value = false
    searchController.value = null
    
    const toast = useToast()
    toast.add({
      title: 'Search Cancelled',
      description: 'Media search has been cancelled.',
      color: 'yellow',
      timeout: 3000
    })
  }
}

const clearFilters = () => {
  // Preserve the current media type selection
  const currentMediaType = filters.value.media_type
  
  filters.value = {
    media_type: currentMediaType, // Keep the currently selected media type
    purpose: { label: 'Output', value: 'output' }, // Reset to output purpose
    subject_uuid: ''
  }
  
  // Clear tag search fields
  selectedTags.value = []
  
  // Reset completion filters to defaults
  completionFilters.value = {
    min_completions: 0,
    max_completions: null
  }
  
  // Clear unconfirmed tags filter
  showUnconfirmedOnly.value = false
  
  // Clear subject selection
  selectedSubject.value = null
  
  sortOptions.value = {
    sort_by: { label: 'Random', value: 'random' },
    sort_order: { label: 'Ascending', value: 'asc' }
  }
  pagination.value.limit = 25
  currentPage.value = 1
  
  // Clear results and reset to initial state
  mediaResults.value = []
  hasSearched.value = false
  
  // Reset pagination
  pagination.value = {
    total: 0,
    limit: 25,
    offset: 0,
    has_more: false
  }
}

// Subject selection handler
const handleSubjectSelection = (selected) => {
  
  // Update filters
  if (selected && selected.value) {
    filters.value.subject_uuid = selected.value // Use the UUID
  } else {
    filters.value.subject_uuid = ''
  }
  
  // Close mobile keyboard by blurring the input
  nextTick(() => {
    const subjectInput = document.querySelector('input[placeholder*="Search for a subject"]')
    if (subjectInput) {
      subjectInput.blur()
    }
  })
}


const handleImageLoad = (event) => {
  console.log('✅ Image loaded successfully:', {
    src: event.target.src.substring(0, 50) + '...',
    isBase64: event.target.src.startsWith('data:'),
    naturalWidth: event.target.naturalWidth,
    naturalHeight: event.target.naturalHeight
  })
}

const handleImageError = (event) => {
  console.error('❌ Image failed to load:', {
    src: event.target.src.substring(0, 100) + '...',
    isBase64: event.target.src.startsWith('data:'),
    displayImages: settingsStore.displayImages,
    error: event
  })
  
  // Hide the broken image and show placeholder instead
  event.target.style.display = 'none'
  
  // Find the parent container and add a placeholder
  const container = event.target.parentElement
  if (container && !container.querySelector('.image-error-placeholder')) {
    const placeholder = document.createElement('div')
    placeholder.className = 'image-error-placeholder w-full h-full bg-muted flex items-center justify-center'
    placeholder.innerHTML = '<div class="text-center"><svg class="w-8 h-8 text-muted-foreground mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>'
    container.appendChild(placeholder)
  }
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return '0:00'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }
}

const getVideoFPS = (media) => {
  if (!media?.fps) return null
  return media.fps
}

const getVideoCodec = (media) => {
  if (!media?.codec) return null
  return media.codec.toUpperCase()
}

const getVideoBitrate = (media) => {
  if (!media?.bitrate) return null
  // Convert bitrate to human readable format (Kbps, Mbps)
  const bitrate = media.bitrate
  if (bitrate >= 1000000) {
    return `${(bitrate / 1000000).toFixed(1)} Mbps`
  } else if (bitrate >= 1000) {
    return `${(bitrate / 1000).toFixed(0)} Kbps`
  } else {
    return `${bitrate} bps`
  }
}

const confirmDelete = async (media) => {
  const { confirm } = useConfirmDialog()
  
  const result = await confirm({
    title: 'Delete Media',
    message: `Are you sure you want to delete "${media.filename}"? This action cannot be undone.`,
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    variant: 'error'
  })
  
  if (result) {
    deleteMedia(media.uuid)
  }
}

const deleteMedia = async (uuid) => {
  const toast = useToast()
  
  try {
    // Add to deleting list
    deletingIds.value.push(uuid)
    
    // Call delete API
    await useApiFetch(`media/${uuid}/delete`, {
      method: 'DELETE'
    })
    
    // Handle modal navigation if deleting current image
    if (isModalOpen.value && selectedMedia.value?.uuid === uuid) {
      const currentIndex = currentImageIndex.value
      const images = imageResults.value
      
      if (images.length > 1) {
        // Navigate to next image, or previous if at end
        const nextIndex = currentIndex < images.length - 1 ? currentIndex : currentIndex - 1
        const nextImage = images.filter(img => img.uuid !== uuid)[nextIndex]
        if (nextImage) {
          selectedMedia.value = nextImage
        } else {
          isModalOpen.value = false
        }
      } else {
        // Close modal if no more images
        isModalOpen.value = false
      }
    }
    
    // Remove from results
    mediaResults.value = mediaResults.value.filter(media => media.uuid !== uuid)
    
    // Show success toast
    toast.add({
      title: 'Media Deleted',
      description: 'Media file has been successfully deleted.',
      color: 'green',
      timeout: 3000
    })
    
  } catch (error) {
    console.error('Delete error:', error)
    
    let errorMessage = 'Failed to delete media'
    if (error.statusCode === 503) {
      errorMessage = 'Media API is not available'
    } else if (error.data?.message) {
      errorMessage = error.data.message
    }
    
    toast.add({
      title: 'Delete Failed',
      description: errorMessage,
      color: 'red',
      timeout: 5000
    })
    
  } finally {
    // Remove from deleting list
    deletingIds.value = deletingIds.value.filter(id => id !== uuid)
  }
}

const openModal = async (media) => {
  // If we're in unconfirmed tags mode, open tag edit modal instead
  if (showUnconfirmedOnly.value) {
    openTagEditModal(media)
    return
  }
  
  selectedMedia.value = media
  isModalOpen.value = true
  
  // If it's a video, ensure it loads and plays
  if (media.type === 'video') {
    await nextTick()
    // Wait a bit for the modal to fully render
    setTimeout(() => {
      const modalVideo = $refs.modalVideo || document.querySelector('video[controls]')
      
      if (modalVideo) {
        // The src is already set in the template, just load and play
        modalVideo.load()
        modalVideo.play().catch(error => {
          console.error('Modal video autoplay failed:', error)
        })
      }
    }, 200)
  }
}

const navigateMedia = (direction) => {
  const newIndex = currentMediaIndex.value + direction
  if (newIndex >= 0 && newIndex < allMediaResults.value.length) {
    selectedMedia.value = allMediaResults.value[newIndex]
  }
}

const handleVideoHover = async (videoId, isHovering) => {
  if (isHovering) {
    hoveredVideoId.value = videoId
    await nextTick()
    
    // Find the video container using the data attribute
    const videoContainer = document.querySelector(`[data-video-uuid="${videoId}"]`)
    
    if (videoContainer) {
      // Find the video element within this container
      const targetVideo = videoContainer.querySelector('video')
      
      if (targetVideo) {
        try {
          // Clear any existing play promise to avoid conflicts
          if (targetVideo._playPromise) {
            await targetVideo._playPromise.catch(() => {})
          }
          
          // Set the video source dynamically using Nuxt streaming endpoint
          const videoSrc = `/api/stream/${videoId}`

          // Ensure video is properly configured for mobile autoplay
          targetVideo.muted = true
          targetVideo.playsInline = true
          targetVideo.autoplay = true
          targetVideo.setAttribute('webkit-playsinline', 'true')
          targetVideo.setAttribute('playsinline', 'true')
          
          // Set the source
          targetVideo.src = videoSrc
          
          // Load the video first
          targetVideo.load()
          
          // Let autoplay handle the video start for mobile compatibility
          // Manual play() calls often fail on mobile browsers
          console.log('Video hover: autoplay enabled, letting browser handle playback')
          
        } catch (error) {
          console.error('Video setup failed:', error)
        }
      }
    }
  } else {
    // Only clear hoveredVideoId if this video was the one being hovered
    if (hoveredVideoId.value === videoId) {
      hoveredVideoId.value = null
    }
    
    // Find and pause the specific video immediately
    const videoContainer = document.querySelector(`[data-video-uuid="${videoId}"]`)
    if (videoContainer) {
      const targetVideo = videoContainer.querySelector('video')
      if (targetVideo && targetVideo.src) {
        // Wait for any pending play promise before pausing
        if (targetVideo._playPromise) {
          targetVideo._playPromise.then(() => {
            targetVideo.pause()
            targetVideo.currentTime = 0
          }).catch(() => {
            // Play was rejected, safe to pause
            targetVideo.pause()
            targetVideo.currentTime = 0
          })
        } else {
          targetVideo.pause()
          targetVideo.currentTime = 0
        }
        
        // Remove the src to stop downloading
        targetVideo.removeAttribute('src')
        targetVideo.load()
        targetVideo._playPromise = null
      }
    }
  }
}

// Tag editing methods
const openTagEditModal = (media) => {
  const currentIndex = mediaResults.value.findIndex(m => m.uuid === media.uuid)
  selectedMediaForTagEdit.value = media
  tagEditCurrentIndex.value = currentIndex
  unconfirmedMediaResults.value = mediaResults.value.filter(m => !m.tags_confirmed)
  isTagEditModalOpen.value = true
}

const handleTagSave = async (data) => {
  const toast = useToast()
  
  try {
    // Call the API to update tags
    await useApiFetch(`media/${data.uuid}/tags`, {
      method: 'PUT',
      body: {
        tags: data.tags,
        tags_confirmed: true
      }
    })
    
    // Update the local media record
    const mediaIndex = mediaResults.value.findIndex(m => m.uuid === data.uuid)
    if (mediaIndex !== -1) {
      mediaResults.value[mediaIndex].tags = { tags: data.tags }
      mediaResults.value[mediaIndex].tags_confirmed = true
    }
    
    // Show success message
    toast.add({
      title: 'Tags Updated',
      description: 'Tags have been saved and confirmed.',
      color: 'green',
      timeout: 2000
    })
    
    // Load next unconfirmed media or refresh search
    await loadNextUnconfirmedMedia()
    
  } catch (error) {
    console.error('Failed to save tags:', error)
    toast.add({
      title: 'Save Failed',
      description: 'Failed to save tags. Please try again.',
      color: 'red',
      timeout: 5000
    })
  }
}

const handleTagSkip = async () => {
  await loadNextUnconfirmedMedia()
}

const loadNextUnconfirmedMedia = async () => {
  // Filter current results for unconfirmed media
  const unconfirmed = mediaResults.value.filter(m => !m.tags_confirmed)
  
  if (unconfirmed.length > 0) {
    // Find next unconfirmed media
    const currentIndex = unconfirmed.findIndex(m => m.uuid === selectedMediaForTagEdit.value?.uuid)
    const nextIndex = currentIndex + 1
    
    if (nextIndex < unconfirmed.length) {
      // Load next unconfirmed media
      selectedMediaForTagEdit.value = unconfirmed[nextIndex]
      tagEditCurrentIndex.value = nextIndex
    } else {
      // No more unconfirmed media, refresh search
      await refreshSearchForUnconfirmed()
    }
  } else {
    // No unconfirmed media left, refresh search
    await refreshSearchForUnconfirmed()
  }
}

const refreshSearchForUnconfirmed = async () => {
  // Close modal first
  isTagEditModalOpen.value = false
  
  // Run search again to get fresh batch of unconfirmed media
  if (showUnconfirmedOnly.value) {
    await searchMedia()
    
    // If we have new results, open the first one
    const unconfirmed = mediaResults.value.filter(m => !m.tags_confirmed)
    if (unconfirmed.length > 0) {
      setTimeout(() => {
        openTagEditModal(unconfirmed[0])
      }, 500)
    } else {
      const toast = useToast()
      toast.add({
        title: 'All Done!',
        description: 'No more unconfirmed media found.',
        color: 'green',
        timeout: 3000
      })
    }
  }
}

const closeTagEditModal = () => {
  isTagEditModalOpen.value = false
  selectedMediaForTagEdit.value = null
  tagEditCurrentIndex.value = -1
}

// Slideshow methods
const startSlideshow = async () => {
  isSlideshow.value = true
  slideshowVideos.value = []
  slideshowCurrentIndex.value = -1
  slideshowPaused.value = false
  slideshowOffset.value = 0
  
  // Wait for the DOM to update
  await nextTick()
  
  // Create and setup video element immediately
  createSlideshowVideo()
  
  // Load the first batch of videos
  await loadSlideshowBatch()
  
  // Start playing the first video
  if (slideshowVideos.value.length > 0) {
    slideshowCurrentIndex.value = 0
    playCurrentSlideshowVideo()
  }
}

const createSlideshowVideo = () => {
  if (!slideshowVideo.value) {
    slideshowVideo.value = document.createElement('video')
    slideshowVideo.value.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      z-index: 10;
      display: block;
      background: transparent;
    `
    
    // Mobile-optimized video settings
    slideshowVideo.value.controls = false
    slideshowVideo.value.autoplay = true  // Enable autoplay since we're muted
    slideshowVideo.value.muted = true  // Required for mobile autoplay
    slideshowVideo.value.playsInline = true
    slideshowVideo.value.loop = false  // Don't loop individual videos
    slideshowVideo.value.setAttribute('webkit-playsinline', 'true')
    slideshowVideo.value.setAttribute('playsinline', 'true')
    slideshowVideo.value.setAttribute('preload', 'none')
    slideshowVideo.value.setAttribute('crossorigin', 'anonymous')
    slideshowVideo.value.setAttribute('x-webkit-airplay', 'allow')
    slideshowVideo.value.setAttribute('disablePictureInPicture', 'true')
    
    // Add error handling for incompatible videos
    slideshowVideo.value.addEventListener('error', (e) => {
      const error = e.target?.error
      console.error('Slideshow video error:', error)
      
      // Auto-advance on any video error
      if (isSlideshow.value && !isLoadingVideo.value) {
        setTimeout(() => {
          if (isSlideshow.value) {
            slideshowNext()
          }
        }, 500)
      }
    })
    
    // Add event listener for when video ends
    slideshowVideo.value.addEventListener('ended', () => {
      if (isSlideshow.value && !slideshowPaused.value) {
        slideshowNext()
      }
    })
    
    // Check if we need to load next batch when getting close to the end
    slideshowVideo.value.addEventListener('timeupdate', () => {
      if (slideshowVideo.value.currentTime > 0.5 && isSlideshow.value) {
        checkAndLoadNextBatch()
      }
    })
    
    // Append to the slideshow container
    const container = document.getElementById('slideshow-video-container')
    if (container) {
      container.appendChild(slideshowVideo.value)
    }
  }
}

const stopSlideshow = () => {
  isSlideshow.value = false
  slideshowPaused.value = false
  
  if (slideshowVideo.value) {
    slideshowVideo.value.pause()
    slideshowVideo.value.src = ''
    slideshowVideo.value.load()
    slideshowVideo.value.remove()
    slideshowVideo.value = null
  }
  
  // Reset slideshow state
  slideshowVideos.value = []
  slideshowCurrentIndex.value = -1
  slideshowOffset.value = 0
  isLoadingNextBatch.value = false
}

const toggleSlideshowPause = () => {
  if (!slideshowVideo.value) {
    return
  }
  
  if (slideshowPaused.value) {
    // Resume: try to play but don't throw errors on mobile
    slideshowVideo.value.play().catch(error => {
      console.warn('Resume play failed (mobile autoplay restriction):', error)
      // On mobile, user might need to tap the video directly
    })
    slideshowPaused.value = false
  } else {
    slideshowVideo.value.pause()
    slideshowPaused.value = true
  }
}

const slideshowPrevious = () => {
  if (slideshowCurrentIndex.value > 0) {
    slideshowCurrentIndex.value--
    playCurrentSlideshowVideo()
  }
}

const slideshowNext = () => {
  if (slideshowCurrentIndex.value < slideshowVideos.value.length - 1) {
    slideshowCurrentIndex.value++
    playCurrentSlideshowVideo()
  } else {
    // We've reached the end, try to load more videos
    if (!isLoadingNextBatch.value) {
      loadSlideshowBatch().then(() => {
        if (slideshowCurrentIndex.value < slideshowVideos.value.length - 1) {
          slideshowCurrentIndex.value++
          playCurrentSlideshowVideo()
        }
      })
    }
  }
}

const playCurrentSlideshowVideo = async () => {
  if (!slideshowVideo.value || slideshowCurrentIndex.value < 0 || slideshowCurrentIndex.value >= slideshowVideos.value.length) {
    return
  }
  
  const currentVideoUuid = slideshowVideos.value[slideshowCurrentIndex.value]
  const streamUrl = `/api/stream/${currentVideoUuid}`
  
  console.log(`🎬 Playing video ${slideshowCurrentIndex.value + 1}/${slideshowVideos.value.length}: ${currentVideoUuid}`)
  
  // Force clear video cache and reset element
  slideshowVideo.value.pause()
  slideshowVideo.value.removeAttribute('src')
  slideshowVideo.value.innerHTML = ''
  
  // Set source and load
  slideshowVideo.value.src = streamUrl
  slideshowVideo.value.load()
  
  // Try to play if not paused
  if (!slideshowPaused.value) {
    try {
      await slideshowVideo.value.play()
    } catch (playError) {
      console.error('Video play failed:', playError)
    }
  }
}

const loadSlideshowBatch = async () => {
  if (isLoadingNextBatch.value) {
    return
  }
  
  isLoadingNextBatch.value = true
  
  try {
    // Build query parameters based on current filters (same as media gallery)
    const params = new URLSearchParams()
    
    // Extract values from objects if needed
    const mediaType = typeof filters.value.media_type === 'object' ? filters.value.media_type.value : filters.value.media_type
    const purpose = typeof filters.value.purpose === 'object' ? filters.value.purpose.value : filters.value.purpose
    
    if (mediaType) params.append('media_type', mediaType)
    if (purpose) params.append('purpose', purpose)
    if (filters.value.subject_uuid) params.append('subject_uuid', filters.value.subject_uuid)
    
    // Add selected tags
    if (selectedTags.value.length > 0) {
      params.append('tags', selectedTags.value.join(','))
    }
    params.append('tag_match_mode', 'partial')
    
    // Add completion filters (only for video searches)
    if (mediaType === 'video') {
      if (completionFilters.value.min_completions != null) {
        params.append('min_completions', completionFilters.value.min_completions.toString())
      }
      if (completionFilters.value.max_completions != null) {
        params.append('max_completions', completionFilters.value.max_completions.toString())
      }
    }
    
    // Add tags_confirmed filter
    if (showUnconfirmedOnly.value) {
      params.append('tags_confirmed', 'false')
    }
    
    // Use the same sort options as the media gallery
    const sortBy = typeof sortOptions.value.sort_by === 'object' ? sortOptions.value.sort_by.value : sortOptions.value.sort_by
    const sortOrder = typeof sortOptions.value.sort_order === 'object' ? sortOptions.value.sort_order.value : sortOptions.value.sort_order
    
    if (sortBy) {
      params.append('sort_by', sortBy)
      if (sortOrder) {
        params.append('sort_order', sortOrder)
      }
    }
    
    // Pagination for slideshow batch
    params.append('limit', slideshowBatchSize.value.toString())
    params.append('offset', slideshowOffset.value.toString())
    
    // Don't include thumbnails for faster loading
    params.append('include_thumbnails', 'false')
    
    console.log(`🔄 Loading slideshow batch: offset=${slideshowOffset.value}, limit=${slideshowBatchSize.value}`)
    
    const response = await useApiFetch(`media/search?${params.toString()}`)
    
    const newVideos = response.results || []
    
    // Filter to only include videos and extract UUIDs
    const videoUuids = newVideos
      .filter(media => media.type === 'video')
      .map(media => media.uuid)
    
    if (videoUuids.length > 0) {
      // Add new video UUIDs to our slideshow array
      slideshowVideos.value.push(...videoUuids)
      slideshowOffset.value += slideshowBatchSize.value
      
      console.log(`✅ Loaded ${videoUuids.length} videos. Total: ${slideshowVideos.value.length}`)
    } else {
      console.log('📭 No more videos found for slideshow')
    }
    
  } catch (error) {
    console.error('Failed to load slideshow batch:', error)
    
    const toast = useToast()
    toast.add({
      title: 'Slideshow Error',
      description: 'Failed to load videos for slideshow',
      color: 'red',
      timeout: 3000
    })
  } finally {
    isLoadingNextBatch.value = false
  }
}

const checkAndLoadNextBatch = () => {
  // Load next batch when we have 5 or fewer videos remaining
  const remainingVideos = slideshowVideos.value.length - slideshowCurrentIndex.value - 1
  
  if (remainingVideos <= 5 && !isLoadingNextBatch.value) {
    console.log(`🔄 ${remainingVideos} videos remaining, loading next batch...`)
    loadSlideshowBatch()
  }
}


// Keyboard shortcuts
defineShortcuts({
  arrowleft: () => {
    if (isSlideshow.value) {
      slideshowPrevious()
    } else if (isModalOpen.value) {
      navigateMedia(-1)
    }
  },
  arrowright: () => {
    if (isSlideshow.value) {
      slideshowNext()
    } else if (isModalOpen.value) {
      navigateMedia(1)
    }
  },
  space: () => {
    if (isSlideshow.value) {
      toggleSlideshowPause()
    }
  },
  escape: () => {
    if (isSlideshow.value) {
      stopSlideshow()
    } else if (isModalOpen.value) {
      isModalOpen.value = false
    }
  }
})

// Handle browser back button for slideshow
onMounted(() => {
  const handlePopState = () => {
    if (isSlideshow.value) {
      stopSlideshow()
    }
  }
  
  window.addEventListener('popstate', handlePopState)
  
  onUnmounted(() => {
    window.removeEventListener('popstate', handlePopState)
  })
})

// Watch for page changes
watch(currentPage, (newPage, oldPage) => {
  if (newPage !== oldPage && hasSearched.value) {
    searchMedia()
  }
})

// Watch for modal close to clean up video sources
watch(isModalOpen, (isOpen) => {
  if (!isOpen) {
    // Clean up modal video when modal closes
    const modalVideo = document.querySelector('.max-w-full video[controls]')
    if (modalVideo) {
      modalVideo.pause()
      modalVideo.currentTime = 0
      // Don't remove src since it's bound to the template, just pause
    }
  }
})

// Video upload methods
const openUploadModal = () => {
  isUploadModalOpen.value = true
  resetUploadState()
}

const closeUploadModal = () => {
  isUploadModalOpen.value = false
  resetUploadState()
}

const resetUploadState = () => {
  selectedFiles.value = []
  isUploading.value = false
  uploadComplete.value = false
  uploadProgress.value = {
    completed: 0,
    total: 0,
    currentFile: ''
  }
  uploadResults.value = []
  uploadedFiles.value = []
}

const handleFolderSelection = (event) => {
  const files = Array.from(event.target.files || [])
  
  // Filter for video files only
  const videoFiles = files.filter(file =>
    file.type.startsWith('video/') &&
    file.size > 0
  )
  
  selectedFiles.value = videoFiles
  
  const toast = useToast()
  toast.add({
    title: 'Files Selected',
    description: `Selected ${videoFiles.length} video files (${formatFileSize(totalSize.value)})`,
    color: 'green',
    timeout: 3000
  })
}

const clearSelection = () => {
  selectedFiles.value = []
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const startUpload = async () => {
  if (selectedFiles.value.length === 0) return
  
  isUploading.value = true
  uploadComplete.value = false
  uploadProgress.value = {
    completed: 0,
    total: selectedFiles.value.length,
    currentFile: ''
  }
  uploadResults.value = []
  
  const toast = useToast()
  const BATCH_SIZE = 5 // Process 5 videos at a time
  
  // Process files in batches
  for (let i = 0; i < selectedFiles.value.length; i += BATCH_SIZE) {
    const batch = selectedFiles.value.slice(i, i + BATCH_SIZE)
    
    try {
      // Create FormData for this batch
      const formData = new FormData()
      batch.forEach(file => {
        formData.append('videos', file)
      })
      
      // Update progress
      uploadProgress.value.currentFile = `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}...`
      
      // Upload batch
      const response = await $fetch('/api/media/upload-videos', {
        method: 'POST',
        body: formData
      })
      
      // Process results
      if (response.results) {
        response.results.forEach(result => {
          uploadResults.value.push({
            filename: result.filename,
            success: true,
            video_uuid: result.video_uuid,
            thumbnail_uuid: result.thumbnail_uuid
          })
          uploadProgress.value.completed++
        })
      }
      
      // Process errors
      if (response.errors) {
        response.errors.forEach(error => {
          uploadResults.value.push({
            filename: error.filename,
            success: false,
            error: error.error
          })
          uploadProgress.value.completed++
        })
      }
      
    } catch (error) {
      console.error('Batch upload error:', error)
      
      // Mark all files in this batch as failed
      batch.forEach(file => {
        uploadResults.value.push({
          filename: file.name,
          success: false,
          error: error.data?.message || error.message || 'Upload failed'
        })
        uploadProgress.value.completed++
      })
      
      toast.add({
        title: 'Batch Upload Error',
        description: `Failed to upload batch: ${error.data?.message || error.message}`,
        color: 'red',
        timeout: 5000
      })
    }
  }
  
  // Upload complete
  isUploading.value = false
  uploadComplete.value = true
  
  const successCount = uploadResults.value.filter(r => r.success).length
  const failCount = uploadResults.value.filter(r => !r.success).length
  
  toast.add({
    title: 'Upload Complete',
    description: `Successfully uploaded ${successCount} videos${failCount > 0 ? `, ${failCount} failed` : ''}`,
    color: successCount > 0 ? 'green' : 'red',
    timeout: 5000
  })
}

const refreshAfterUpload = async () => {
  // Set filters to show destination videos
  filters.value.media_type = { label: 'Videos', value: 'video' }
  filters.value.purpose = { label: 'Destination', value: 'dest' }
  
  // Refresh the search
  await searchMedia()
  
  // Close modal
  closeUploadModal()
  
  const toast = useToast()
  toast.add({
    title: 'Gallery Refreshed',
    description: 'Showing newly uploaded destination videos',
    color: 'green',
    timeout: 3000
  })
}

// Initialize settings on mount (but don't auto-search)
onMounted(async () => {
  await settingsStore.initializeSettings()
})


// Page head
useHead({
  title: 'Media Gallery - AI Job Tracking System',
  meta: [
    { name: 'description', content: 'Browse encrypted media storage' }
  ]
})
</script>