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
            <!-- Upload Videos Dropdown -->
            <UDropdownMenu
              :items="uploadMenuItems"
              :ui="{ content: 'w-48' }"
            >
              <UButton
                color="green"
                variant="outline"
                size="xs"
                trailing-icon="i-heroicons-chevron-down"
              >
                <UIcon name="i-heroicons-arrow-up-tray" />
                <span class="hidden sm:inline">Upload</span>
              </UButton>
            </UDropdownMenu>
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
        <!-- UUID Search (priority filter) -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Media UUID (Direct Lookup)
          </label>
          <UInput
            v-model="mediaUuid"
            placeholder="Enter media record UUID to find specific record..."
            class="w-full"
            :ui="{ trailing: 'pe-1' }"
          >
            <template v-if="mediaUuid?.length" #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-heroicons-x-mark"
                aria-label="Clear UUID input"
                @click="mediaUuid = ''"
              />
            </template>
          </UInput>
          <p v-if="mediaUuid" class="text-xs text-blue-600 dark:text-blue-400 mt-1">
            When UUID is set, all other filters are ignored
          </p>
        </div>

        <!-- Media Type and Purpose on same line -->
        <div class="grid grid-cols-2 gap-3 sm:gap-4">
          <!-- Media Type Filter -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Media Type
            </label>
            <USelectMenu
              v-model="mediaType"
              :items="mediaTypeOptions"
              placeholder="All types"
              class="w-full"
              :disabled="!!mediaUuid"
            />
          </div>

          <!-- Purpose Filter -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Purpose
            </label>
            <USelectMenu
              v-model="purpose"
              :items="purposeOptions"
              placeholder="All purposes"
              class="w-full"
              :disabled="!!mediaUuid"
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
              :disabled="!!mediaUuid"
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
                :disabled="!!mediaUuid"
              />
            </div>
          </div>
        </div>

      </div>

      <!-- Sort Options and Limit -->
      <div v-show="!filtersCollapsed" class="flex gap-2 sm:gap-4 mt-3 sm:mt-4">
        <div class="flex-1 min-w-0">
          <USelectMenu
            v-model="sortBy"
            :items="sortByOptions"
            placeholder="Sort by..."
            class="w-full"
            :disabled="!!mediaUuid"
          />
        </div>
        <div class="w-24 flex-shrink-0">
          <USelectMenu
            v-model="sortOrder"
            :items="sortOrderOptions"
            placeholder="Order..."
            class="w-full"
            :disabled="!!mediaUuid"
          />
        </div>
        <div class="w-20 flex-shrink-0">
          <USelect
            v-model="paginationLimit"
            :items="limitOptions"
            placeholder="Limit..."
            class="w-full"
            :disabled="!!mediaUuid"
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
          Clear Results
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
              preload="none"
              playsinline
              webkit-playsinline
              :data-video-id="media.uuid"
              disablePictureInPicture
            >
              <source :src="`/api/stream/${media.uuid}`" type="video/mp4">
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
                  preload="none"
                  playsinline
                  webkit-playsinline
                  :data-video-id="media.uuid"
                  disablePictureInPicture
                >
                  <source :src="`/api/stream/${media.uuid}`" type="video/mp4">
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
                v-if="selectedMedia.type === 'video' && !isEditingMode"
                variant="solid"
                icon="i-heroicons-pencil-square"
                color="primary"
                size="xs"
                @click="enterEditMode"
              >
                Edit
              </UButton>
              <UButton
                v-if="!isEditingMode"
                variant="outline"
                icon="i-heroicons-tag"
                color="blue"
                size="xs"
                @click="openTagEditModal(selectedMedia)"
              >
                Tags
              </UButton>
              <UButton
                v-if="isEditingMode"
                variant="solid"
                color="green"
                size="xs"
                :loading="isSavingEdits"
                @click="confirmSaveEdits"
              >
                Save
              </UButton>
              <UButton
                v-if="isEditingMode"
                variant="outline"
                size="xs"
                @click="confirmCancelEdits"
              >
                Cancel
              </UButton>
              <UButton
                v-if="!isEditingMode"
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
                @click="closeModal"
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
              <div class="relative">
                <video
                  :ref="modalVideo"
                  :poster="selectedMedia.thumbnail ? selectedMedia.thumbnail : (selectedMedia.thumbnail_uuid ? `/api/media/${selectedMedia.thumbnail_uuid}/image?size=sm` : undefined)"
                  controls
                  muted
                  loop
                  class="w-full h-auto max-h-[80vh] rounded"
                  preload="metadata"
                  playsinline
                  webkit-playsinline
                  :data-video-id="selectedMedia.uuid"
                  disablePictureInPicture
                  crossorigin="anonymous"
                  @loadedmetadata="onVideoLoaded"
                  @timeupdate="onTimeUpdate"
                >
                  <source :src="`/api/stream/${selectedMedia.uuid}`" type="video/mp4">
                  Your browser does not support the video tag.
                </video>
                
                <!-- Custom Crop overlay (only visible in edit mode) -->
                <div
                  v-if="isEditingMode && showCropOverlay"
                  class="absolute inset-0 cursor-crosshair"
                  style="z-index: 20;"
                  @mousedown="startCropDrag"
                  @mousemove="updateCropDrag"
                  @mouseup="endCropDrag"
                  @mouseleave="endCropDrag"
                >
                  <!-- Dark overlay -->
                  <div class="absolute inset-0" :ui="{opacity:50}"/>
                  
                  <!-- Crop selection rectangle -->
                  <div
                    class="absolute border-2 border-white shadow-lg"
                    :style="{
                      left: cropOverlayStyle.left + 'px',
                      top: cropOverlayStyle.top + 'px',
                      width: cropOverlayStyle.width + 'px',
                      height: cropOverlayStyle.height + 'px'
                    }"
                  >
                    <!-- Clear area inside crop -->
                    <div class="absolute inset-0 bg-transparent"></div>
                    
                    <!-- Corner handles -->
                    <div class="absolute -top-1 -left-1 w-3 h-3 bg-white border border-gray-400 cursor-nw-resize" @mousedown.stop="startResize('nw')"></div>
                    <div class="absolute -top-1 -right-1 w-3 h-3 bg-white border border-gray-400 cursor-ne-resize" @mousedown.stop="startResize('ne')"></div>
                    <div class="absolute -bottom-1 -left-1 w-3 h-3 bg-white border border-gray-400 cursor-sw-resize" @mousedown.stop="startResize('sw')"></div>
                    <div class="absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-gray-400 cursor-se-resize" @mousedown.stop="startResize('se')"></div>
                    
                    <!-- Edge handles -->
                    <div class="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-white border border-gray-400 cursor-n-resize" @mousedown.stop="startResize('n')"></div>
                    <div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-white border border-gray-400 cursor-s-resize" @mousedown.stop="startResize('s')"></div>
                    <div class="absolute -left-1 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white border border-gray-400 cursor-w-resize" @mousedown.stop="startResize('w')"></div>
                    <div class="absolute -right-1 top-1/2 transform -translate-y-1/2 w-3 h-3 bg-white border border-gray-400 cursor-e-resize" @mousedown.stop="startResize('e')"></div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Video placeholder when displayImages is false -->
            <div v-else-if="selectedMedia.type === 'video'" class="w-full h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded">
              <div class="text-center">
                <UIcon name="i-heroicons-play-circle" class="text-6xl text-gray-400 mb-2" />
                <p class="text-gray-500">Video Hidden</p>
              </div>
            </div>

            <!-- Video Editing Controls (only visible in edit mode) -->
            <div v-if="isEditingMode && selectedMedia.type === 'video'" class="space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6">
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                <!-- Trim Controls -->
                <UCard>
                  <template #header>
                    <h4 class="font-semibold text-gray-900 dark:text-white">Trim Video</h4>
                  </template>
                  
                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Time (seconds)</label>
                      <div class="flex gap-2">
                        <UInput
                          v-model.number="editSettings.trimStart"
                          type="number"
                          step="0.1"
                          min="0"
                          :max="videoDuration"
                          placeholder="0.0"
                          class="flex-1"
                          size="sm"
                        />
                        <UButton
                          size="sm"
                          variant="outline"
                          @click="setCurrentTimeAsStart"
                        >
                          Current
                        </UButton>
                      </div>
                      <p class="text-xs text-gray-500 mt-1">{{ formatTime(editSettings.trimStart || 0) }}</p>
                    </div>
                    
                    <div>
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Time (seconds)</label>
                      <div class="flex gap-2">
                        <UInput
                          v-model.number="editSettings.trimEnd"
                          type="number"
                          step="0.1"
                          min="0"
                          :max="videoDuration"
                          :placeholder="videoDuration?.toString() || ''"
                          class="flex-1"
                          size="sm"
                        />
                        <UButton
                          size="sm"
                          variant="outline"
                          @click="setCurrentTimeAsEnd"
                        >
                          Current
                        </UButton>
                      </div>
                      <p class="text-xs text-gray-500 mt-1">{{ formatTime(editSettings.trimEnd || videoDuration || 0) }}</p>
                    </div>
                    
                    <div class="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                      New Duration: {{ formatTime((editSettings.trimEnd || videoDuration || 0) - (editSettings.trimStart || 0)) }}
                    </div>
                  </div>
                </UCard>

                <!-- Crop Controls -->
                <UCard>
                  <template #header>
                    <div class="flex justify-between items-center">
                      <h4 class="font-semibold text-gray-900 dark:text-white">Crop Video</h4>
                      <USwitch
                        v-model="showCropOverlay"
                        label="Show Overlay"
                      />
                    </div>
                  </template>
                  
                  <div class="space-y-4">
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">X Position</label>
                        <UInput
                          v-model.number="editSettings.crop.x"
                          type="number"
                          min="0"
                          :max="videoWidth"
                          size="sm"
                        />
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Y Position</label>
                        <UInput
                          v-model.number="editSettings.crop.y"
                          type="number"
                          min="0"
                          :max="videoHeight"
                          size="sm"
                        />
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Width</label>
                        <UInput
                          v-model.number="editSettings.crop.width"
                          type="number"
                          min="1"
                          :max="videoWidth"
                          size="sm"
                        />
                      </div>
                      <div>
                        <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Height</label>
                        <UInput
                          v-model.number="editSettings.crop.height"
                          type="number"
                          min="1"
                          :max="videoHeight"
                          size="sm"
                        />
                      </div>
                    </div>
                    
                    <div class="flex gap-2">
                      <UButton
                        size="sm"
                        variant="outline"
                        @click="resetCrop"
                      >
                        Reset
                      </UButton>
                      <UButton
                        size="sm"
                        variant="outline"
                        @click="centerCrop"
                      >
                        Center
                      </UButton>
                    </div>
                  </div>
                </UCard>

                <!-- Frame Management -->
                <UCard>
                  <template #header>
                    <h4 class="font-semibold text-gray-900 dark:text-white">Frame Operations</h4>
                  </template>
                  
                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Time</label>
                      <p class="text-lg font-mono text-gray-900 dark:text-white">{{ formatTime(currentTime) }}</p>
                      <p class="text-xs text-gray-500">Frame: {{ Math.floor(currentTime * (videoFPS || 30)) }}</p>
                    </div>
                    
                    <div class="space-y-2">
                      <UButton
                        size="sm"
                        color="red"
                        variant="outline"
                        block
                        @click="deleteCurrentFrame"
                      >
                        Delete Current Frame
                      </UButton>
                      
                      <UButton
                        size="sm"
                        variant="outline"
                        block
                        @click="deleteFrameRange"
                      >
                        Delete Frame Range
                      </UButton>
                    </div>
                    
                    <!-- Deleted frames list -->
                    <div v-if="editSettings.deletedFrames.length > 0" class="mt-4">
                      <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Deleted Frames ({{ editSettings.deletedFrames.length }})
                      </h5>
                      <div class="max-h-32 overflow-y-auto space-y-1">
                        <div
                          v-for="(frame, index) in editSettings.deletedFrames"
                          :key="index"
                          class="flex justify-between items-center text-xs bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 p-2 rounded"
                        >
                          <span>{{ formatTime(frame.time) }}</span>
                          <UButton
                            size="xs"
                            variant="ghost"
                            icon="i-heroicons-x-mark"
                            @click="restoreFrame(index)"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </UCard>
              </div>

              <!-- Operations Summary -->
              <div v-if="hasEditOperations" class="mt-6">
                <UCard>
                  <template #header>
                    <h4 class="font-semibold text-gray-900 dark:text-white">Edit Summary</h4>
                  </template>
                  
                  <div class="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <div v-if="editSettings.trimStart || editSettings.trimEnd">
                      <strong>Trim:</strong> {{ formatTime(editSettings.trimStart || 0) }} - {{ formatTime(editSettings.trimEnd || videoDuration || 0) }}
                    </div>
                    <div v-if="hasCropChanges">
                      <strong>Crop:</strong> {{ editSettings.crop.width }}×{{ editSettings.crop.height }} at ({{ editSettings.crop.x }}, {{ editSettings.crop.y }})
                    </div>
                    <div v-if="editSettings.deletedFrames.length > 0">
                      <strong>Deleted Frames:</strong> {{ editSettings.deletedFrames.length }} frames removed
                    </div>
                  </div>
                </UCard>
              </div>
            </div>

            <!-- Media Details Accordion -->
            <UAccordion v-if="!isEditingMode" :items="mediaDetailsItems">
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
      :total-count="1"
      :has-next="false"
      :show-skip-button="false"
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
            <h3 class="text-base sm:text-lg font-semibold">
              Upload {{ uploadMode === 'single' ? 'Video File' : 'Destination Videos' }}
            </h3>
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
              <UIcon :name="uploadMode === 'single' ? 'i-heroicons-document-plus' : 'i-heroicons-folder'" class="text-4xl text-gray-400 mb-4" />
              <p class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {{ uploadMode === 'single' ? 'Select Video File' : 'Select Video Folder' }}
              </p>
              <p class="text-sm text-gray-500 mb-4">
                {{ uploadMode === 'single' ? 'Choose a single video file to upload' : 'Choose a folder containing destination videos to upload' }}
              </p>
              
              <!-- Hidden file inputs -->
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
              <input
                ref="singleFileInput"
                type="file"
                accept="video/*"
                class="hidden"
                @change="handleSingleFileSelection"
              >
              
              <!-- Upload buttons -->
              <div class="flex gap-2 justify-center">
                <UButton
                  v-if="uploadMode === 'folder'"
                  color="primary"
                  @click="folderInput?.click()"
                >
                  <UIcon name="i-heroicons-folder-open" class="mr-2" />
                  Choose Folder
                </UButton>
                <UButton
                  v-if="uploadMode === 'single'"
                  color="primary"
                  @click="singleFileInput?.click()"
                >
                  <UIcon name="i-heroicons-document-plus" class="mr-2" />
                  Choose File
                </UButton>
                
                <!-- Switch mode button -->
                <UButton
                  variant="outline"
                  @click="switchUploadMode"
                >
                  <UIcon :name="uploadMode === 'single' ? 'i-heroicons-folder' : 'i-heroicons-document'" class="mr-2" />
                  {{ uploadMode === 'single' ? 'Upload Folder' : 'Upload Single File' }}
                </UButton>
              </div>
            </div>
          </div>

          <!-- Upload Configuration -->
          <div v-if="selectedFiles.length === 0 && !isUploading">
            <div class="space-y-4">
              <!-- Purpose Selection -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Purpose
                </label>
                <USelectMenu
                  v-model="uploadConfig.purpose"
                  :items="uploadPurposeOptions"
                  placeholder="Select purpose..."
                  class="w-full"
                />
              </div>

              <!-- Category Selection -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categories (Optional)
                </label>
                <UInputMenu
                  v-model="uploadConfig.categories"
                  multiple
                  creatable
                  :items="availableCategories"
                  :loading="loadingCategories"
                  placeholder="Select or create categories..."
                  class="w-full"
                />
                <p class="text-xs text-gray-500 mt-1">
                  Select from existing categories or type to create new ones
                </p>
              </div>
            </div>
          </div>

          <!-- Selected Files Preview -->
          <div v-if="selectedFiles.length > 0 && !isUploading">
            <div class="mb-4">
              <h4 class="text-md font-medium text-gray-900 dark:text-white mb-2">
                Selected {{ uploadMode === 'single' ? 'Video' : 'Videos' }} ({{ selectedFiles.length }})
              </h4>
              <p class="text-sm text-gray-500">
                {{ uploadMode === 'single' ? 'File size:' : 'Total size:' }} {{ formatFileSize(totalSize) }}
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
                    {{ formatFileSize(totalSize) }} total{{ selectedFiles.length > 1 ? ' • Will be processed in batches of 5' : '' }}
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
import { useMediaGalleryFilters } from '~/composables/useMediaGalleryFilters'

// Device detection
const { isMobile } = useDevice()

// Page metadata
definePageMeta({
  title: 'Media Gallery'
})

// Initialize stores and composables
const settingsStore = useSettingsStore()
const {
  filters: _persistentFilters,
  loadFilters,
  resetFilters: _resetFilters,
  mediaType,
  purpose,
  selectedTags,
  sortBy,
  sortOrder,
  paginationLimit,
  viewMode,
  filtersCollapsed,
  subjectUuid,
  mediaUuid
} = useMediaGalleryFilters()

// Template refs
const folderInput = ref(null)
const singleFileInput = ref(null)
const modalVideo = ref(null)
// Custom crop overlay state
const isDragging = ref(false)
const isResizing = ref(false)
const resizeHandle = ref('')
const dragStart = ref({ x: 0, y: 0 })
const cropStart = ref({ x: 0, y: 0, width: 0, height: 0 })

// Reactive data
const filters = ref({
  media_type: { label: 'Videos', value: 'video' }, // Default to videos in dropdown format
  purpose: { label: 'Output', value: 'output' }, // Default to output purpose
  subject_uuid: ''
})

// Tag editing functionality
const isTagEditModalOpen = ref(false)
const selectedMediaForTagEdit = ref(null)
const tagEditCurrentIndex = ref(-1)

// Video upload functionality
const isUploadModalOpen = ref(false)
const uploadMode = ref('folder') // 'single' or 'folder'
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

// Upload configuration
const uploadConfig = ref({
  purpose: { label: 'Destination', value: 'dest' },
  categories: []
})

// Categories management
const availableCategories = ref([])
const loadingCategories = ref(false)

// Video editing state
const isEditingMode = ref(false)
const isSavingEdits = ref(false)
const showCropOverlay = ref(false)
const currentTime = ref(0)
const videoDuration = ref(0)
const videoWidth = ref(0)
const videoHeight = ref(0)
const videoFPS = ref(30)

// Edit settings
const editSettings = ref({
  trimStart: null,
  trimEnd: null,
  crop: {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  },
  deletedFrames: []
})


// Subject selection state
const selectedSubject = ref(null)


const mediaResults = ref([])
const isLoading = ref(false)
const hasSearched = ref(false)
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
const slideshowNextVideo = ref(null) // Preload next video for seamless transitions
const slideshowVideos = ref([]) // Array of video UUIDs from database
const slideshowCurrentIndex = ref(-1)
const slideshowPaused = ref(false)
const isLoadingNextBatch = ref(false) // Track if we're loading the next batch
const slideshowOffset = ref(0) // Current offset for pagination
const slideshowBatchSize = ref(10) // Number of videos to fetch per batch
const slideshowTotalCount = ref(0) // Total number of videos available from API

// Filters collapsed state is now handled by the composable

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

// Video editing computed properties
const hasCropChanges = computed(() => {
  const crop = editSettings.value.crop
  return crop.x !== 0 || crop.y !== 0 ||
         crop.width !== videoWidth.value ||
         crop.height !== videoHeight.value
})

const hasEditOperations = computed(() => {
  return editSettings.value.trimStart ||
         editSettings.value.trimEnd ||
         hasCropChanges.value ||
         editSettings.value.deletedFrames.length > 0
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
  { label: 'Created', value: 'created_at' },
  { label: 'Updated', value: 'updated_at' },
  { label: 'Filename', value: 'filename' },
  { label: 'File Size', value: 'file_size' },
  { label: 'Type', value: 'type' },
  { label: 'Purpose', value: 'purpose' },
  { label: 'Status', value: 'status' },
  { label: 'Width', value: 'width' },
  { label: 'Height', value: 'height' },
  { label: 'Duration', value: 'duration' }
]

const sortOrderOptions = [
  { label: 'Asc', value: 'asc' },
  { label: 'Desc', value: 'desc' }
]

const limitOptions = [
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '200', value: 200 },
  { label: '500', value: 500 }
]

// Upload purpose options
const uploadPurposeOptions = [
  { label: 'Source', value: 'source' },
  { label: 'Destination', value: 'dest' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Backup', value: 'backup' },
  { label: 'Output', value: 'output' }
]

// Upload menu items
const uploadMenuItems = [
  [{
    label: 'Upload Single File',
    icon: 'i-heroicons-document-plus',
    onSelect: (_e) => {
      console.log('Single file upload selected')
      openUploadModal('single')
    }
  }],
  [{
    label: 'Upload Folder',
    icon: 'i-heroicons-folder-open',
    onSelect: (_e) => {
      console.log('Folder upload selected')
      openUploadModal('folder')
    }
  }]
]

// Search cancellation
const searchController = ref(null)

// No longer needed - composable handles saving automatically

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
    
    // If UUID is provided, ignore all other filters and search by UUID only
    if (mediaUuid.value && mediaUuid.value.trim()) {
      params.append('uuid', mediaUuid.value.trim())
      params.append('include_thumbnails', 'true')
      
      const response = await useApiFetch(`media/search?${params.toString()}`, {
        signal: searchController.value.signal
      })
      
      // For UUID search, we expect either 1 result or 0 results
      const allResults = response.results || []
      mediaResults.value = allResults
      
      // Update pagination for UUID search (should be 1 or 0 results)
      pagination.value = {
        total: allResults.length,
        limit: 1,
        offset: 0,
        has_more: false
      }
      
    } else {
      // Normal search with all filters
      // Extract values from objects if needed
      const mediaTypeValue = typeof mediaType.value === 'object' ? mediaType.value.value : mediaType.value
      const purposeValue = typeof purpose.value === 'object' ? purpose.value.value : purpose.value
      
      if (mediaTypeValue) params.append('media_type', mediaTypeValue)
      if (purposeValue) params.append('purpose', purposeValue)
      if (subjectUuid.value) params.append('subject_uuid', subjectUuid.value)
      
      // Add selected tags from UInputTags component
      if (selectedTags.value.length > 0) {
        params.append('tags', selectedTags.value.join(','))
      }
      // Always use partial match mode (API only supports this)
      params.append('tag_match_mode', 'partial')
      
      
      
      // Handle limit - extract value if it's an object
      const limit = typeof pagination.value.limit === 'object' ? pagination.value.limit.value : pagination.value.limit
      params.append('limit', limit.toString())
      params.append('offset', ((currentPage.value - 1) * limit).toString())
      
      // Add sort parameters
      const sortByValue = typeof sortBy.value === 'object' ? sortBy.value.value : sortBy.value
      const sortOrderValue = typeof sortOrder.value === 'object' ? sortOrder.value.value : sortOrder.value
      
      if (sortByValue) {
        params.append('sort_by', sortByValue)
        // For random sorting, order doesn't matter but API expects it
        if (sortByValue === 'random') {
          params.append('sort_order', 'asc')
        } else if (sortOrderValue) {
          params.append('sort_order', sortOrderValue)
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
  // Only clear the search results, not the filter settings
  mediaResults.value = []
  hasSearched.value = false
  currentPage.value = 1
  
  // Reset pagination
  pagination.value = {
    total: 0,
    limit: paginationLimit,
    offset: 0,
    has_more: false
  }
}

// Subject selection handler
const handleSubjectSelection = (selected) => {
  
  // Update filters
  if (selected && selected.value) {
    subjectUuid.value = selected.value // Use the UUID
  } else {
    subjectUuid.value = ''
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
  selectedMedia.value = media
  isModalOpen.value = true
  
  // If it's a video, try to autoplay after modal opens
  if (media.type === 'video') {
    await nextTick()
    setTimeout(() => {
      const modalVideoEl = modalVideo.value || document.querySelector('video[controls]')
      
      if (modalVideoEl) {
        console.log('🎬 Modal video ready, attempting autoplay for:', {
          uuid: media.uuid,
          src: modalVideoEl.src || modalVideoEl.querySelector('source')?.src,
          preload: modalVideoEl.preload,
          crossOrigin: modalVideoEl.crossOrigin
        })
        
        // Add event listeners for debugging
        const onModalLoadStart = () => console.log('🌐 Modal video loadstart')
        const onModalProgress = () => console.log('📊 Modal video progress')
        const onModalLoadedMetadata = () => console.log('📋 Modal video loadedmetadata')
        const onModalLoadedData = () => console.log('✅ Modal video loadeddata')
        const onModalCanPlay = () => console.log('▶️ Modal video canplay')
        const onModalError = (e) => {
          console.error('❌ Modal video error:', {
            code: e.target.error?.code,
            message: e.target.error?.message,
            src: e.target.src,
            networkState: e.target.networkState,
            readyState: e.target.readyState
          })
        }
        
        modalVideoEl.addEventListener('loadstart', onModalLoadStart, { once: true })
        modalVideoEl.addEventListener('progress', onModalProgress)
        modalVideoEl.addEventListener('loadedmetadata', onModalLoadedMetadata, { once: true })
        modalVideoEl.addEventListener('loadeddata', onModalLoadedData, { once: true })
        modalVideoEl.addEventListener('canplay', onModalCanPlay, { once: true })
        modalVideoEl.addEventListener('error', onModalError, { once: true })
        
        // The source is already set in the template, just try to play
        modalVideoEl.load()
        modalVideoEl.play().catch(error => {
          console.log('Modal autoplay prevented (normal):', error.message)
        })
      }
    }, 300)
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
        console.log('🎬 Hover video ready, attempting autoplay')
        
        // Keep poster visible during loading - don't remove it yet
        const originalPoster = targetVideo.poster
        
        // Store original poster for potential restoration
        targetVideo.dataset.originalPoster = originalPoster
        
        // Ensure the video has a proper src attribute set from the source element
        const sourceElement = targetVideo.querySelector('source')
        if (sourceElement && sourceElement.src && !targetVideo.src) {
          targetVideo.src = sourceElement.src
          console.log('🔧 Set video src from source element:', sourceElement.src)
        }
        
        // Add event listeners for debugging
        const onLoadedData = () => {
          console.log('✅ Video loadeddata - ready to play')
          // Now remove poster since video is ready
          targetVideo.removeAttribute('poster')
          // Try to play once data is loaded
          targetVideo.play().catch(error => {
            console.log('❌ Autoplay prevented:', error.message)
          })
        }
        const onCanPlay = () => console.log('▶️ Video canplay')
        const onError = (e) => {
          console.error('❌ Video error:', e.target.error)
          console.error('❌ Video error details:', {
            code: e.target.error?.code,
            message: e.target.error?.message,
            src: e.target.src,
            networkState: e.target.networkState,
            readyState: e.target.readyState
          })
          // Restore poster on error
          if (targetVideo.dataset.originalPoster) {
            targetVideo.poster = targetVideo.dataset.originalPoster
          }
        }
        
        // Add more detailed logging for network events
        const onLoadStart = () => console.log('🌐 Video loadstart - browser started loading')
        const onProgress = () => console.log('📊 Video progress - downloading')
        const onLoadedMetadata = () => console.log('📋 Video loadedmetadata - metadata loaded')
        const onSuspend = () => console.log('⏸️ Video suspend - loading suspended')
        const onStalled = () => console.log('🚫 Video stalled - loading stalled')
        const onAbort = () => console.log('🛑 Video abort - loading aborted')
        
        targetVideo.addEventListener('loadeddata', onLoadedData, { once: true })
        targetVideo.addEventListener('canplay', onCanPlay, { once: true })
        targetVideo.addEventListener('error', onError, { once: true })
        targetVideo.addEventListener('loadstart', onLoadStart, { once: true })
        targetVideo.addEventListener('progress', onProgress)
        targetVideo.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
        targetVideo.addEventListener('suspend', onSuspend, { once: true })
        targetVideo.addEventListener('stalled', onStalled, { once: true })
        targetVideo.addEventListener('abort', onAbort, { once: true })
        
        console.log('🎬 Starting video load for:', {
          uuid: videoId,
          src: targetVideo.src || sourceElement?.src,
          preload: targetVideo.preload,
          crossOrigin: targetVideo.crossOrigin
        })
        
        // Load the video
        targetVideo.load()
        
      } else {
        console.error('❌ No video element found in container')
      }
    } else {
      console.error('❌ No video container found for UUID:', videoId)
    }
  } else {
    // Only clear hoveredVideoId if this video was the one being hovered
    if (hoveredVideoId.value === videoId) {
      hoveredVideoId.value = null
    }
    
    // Find and stop the specific video
    const videoContainer = document.querySelector(`[data-video-uuid="${videoId}"]`)
    if (videoContainer) {
      const targetVideo = videoContainer.querySelector('video')
      if (targetVideo) {
        targetVideo.pause()
        targetVideo.currentTime = 0
        
        // Restore poster image
        if (targetVideo.dataset.originalPoster) {
          targetVideo.poster = targetVideo.dataset.originalPoster
        }
      }
    }
  }
}

// Tag editing methods
const openTagEditModal = (media) => {
  selectedMediaForTagEdit.value = media
  tagEditCurrentIndex.value = 0
  isTagEditModalOpen.value = true
}

const handleTagSave = async (data) => {
  const toast = useToast()
  
  try {
    // Call the API to update tags
    await useApiFetch(`media/${data.uuid}/tags`, {
      method: 'PUT',
      body: {
        tags: data.tags
      }
    })
    
    // Update the local media record
    const mediaIndex = mediaResults.value.findIndex(m => m.uuid === data.uuid)
    if (mediaIndex !== -1) {
      mediaResults.value[mediaIndex].tags = { tags: data.tags }
    }
    
    // Show success message
    toast.add({
      title: 'Tags Updated',
      description: 'Tags have been saved.',
      color: 'green',
      timeout: 2000
    })
    
    // Close the modal
    closeTagEditModal()
    
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
  // Just close the modal since we don't have unconfirmed workflow anymore
  closeTagEditModal()
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

const addVideoEventListeners = (videoElement) => {
  // Add error handling for incompatible videos
  videoElement.addEventListener('error', (e) => {
    const error = e.target?.error
    
    // Ignore errors when slideshow is not active (during cleanup)
    if (!isSlideshow.value) {
      return
    }
    
    // Ignore empty src errors (happens during cleanup)
    if (error?.code === 4 && error?.message?.includes('Empty src')) {
      return
    }
    
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
  videoElement.addEventListener('ended', () => {
    console.log('Video ended, advancing to next...')
    if (isSlideshow.value && !slideshowPaused.value) {
      slideshowNext()
    }
  })
  
  // Check if we need to load next batch when getting close to the end
  videoElement.addEventListener('timeupdate', () => {
    if (!isSlideshow.value) return
    
    if (videoElement.currentTime > 0.5) {
      checkAndLoadNextBatch()
    }
  })
  
  // Preload next video when current video is halfway through
  videoElement.addEventListener('timeupdate', () => {
    if (!isSlideshow.value) return
    
    if (videoElement.duration > 0 &&
        videoElement.currentTime / videoElement.duration > 0.5) {
      preloadNextVideo()
    }
  })
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
    slideshowVideo.value.setAttribute('preload', 'metadata')
    slideshowVideo.value.setAttribute('crossorigin', 'anonymous')
    slideshowVideo.value.setAttribute('x-webkit-airplay', 'allow')
    slideshowVideo.value.setAttribute('disablePictureInPicture', 'true')
    
    // Add event listeners
    addVideoEventListeners(slideshowVideo.value)
    
    // Append to the slideshow container
    const container = document.getElementById('slideshow-video-container')
    if (container) {
      container.appendChild(slideshowVideo.value)
    }
  }
  
  // Create next video element for preloading
  if (!slideshowNextVideo.value) {
    slideshowNextVideo.value = document.createElement('video')
    slideshowNextVideo.value.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      z-index: 5;
      display: none;
      background: transparent;
    `
    
    // Same settings as main video
    slideshowNextVideo.value.controls = false
    slideshowNextVideo.value.muted = true
    slideshowNextVideo.value.playsInline = true
    slideshowNextVideo.value.loop = false
    slideshowNextVideo.value.setAttribute('webkit-playsinline', 'true')
    slideshowNextVideo.value.setAttribute('playsinline', 'true')
    slideshowNextVideo.value.setAttribute('preload', 'auto')
    slideshowNextVideo.value.setAttribute('crossorigin', 'anonymous')
    
    // Add event listeners to next video as well
    addVideoEventListeners(slideshowNextVideo.value)
    
    // Append to the slideshow container
    const container = document.getElementById('slideshow-video-container')
    if (container) {
      container.appendChild(slideshowNextVideo.value)
    }
  }
}

const stopSlideshow = () => {
  // Set slideshow to false first to prevent event handlers from firing
  isSlideshow.value = false
  slideshowPaused.value = false
  
  if (slideshowVideo.value) {
    slideshowVideo.value.pause()
    slideshowVideo.value.src = ''
    slideshowVideo.value.load()
    slideshowVideo.value.remove()
    slideshowVideo.value = null
  }
  
  if (slideshowNextVideo.value) {
    slideshowNextVideo.value.pause()
    slideshowNextVideo.value.src = ''
    slideshowNextVideo.value.load()
    slideshowNextVideo.value.remove()
    slideshowNextVideo.value = null
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
  } else if (slideshowVideos.value.length > 0) {
    // Loop to the last video when going backwards from the first
    console.log('🔄 At beginning, looping to last video')
    slideshowCurrentIndex.value = slideshowVideos.value.length - 1
    playCurrentSlideshowVideo()
  }
}

const slideshowNext = () => {
  if (slideshowCurrentIndex.value < slideshowVideos.value.length - 1) {
    slideshowCurrentIndex.value++
    playCurrentSlideshowVideo()
  } else {
    // We've reached the end of loaded videos
    const hasMoreVideos = slideshowVideos.value.length < slideshowTotalCount.value
    if (!isLoadingNextBatch.value && hasMoreVideos) {
      // Try to load more videos if available
      loadSlideshowBatch().then(() => {
        if (slideshowCurrentIndex.value < slideshowVideos.value.length - 1) {
          slideshowCurrentIndex.value++
          playCurrentSlideshowVideo()
        } else {
          // No more videos to load, loop back to beginning
          console.log('🔄 Reached end of all videos, looping back to start')
          slideshowCurrentIndex.value = 0
          playCurrentSlideshowVideo()
        }
      })
    } else {
      // No more videos to load, loop back to beginning
      console.log('🔄 Reached end of all videos, looping back to start')
      slideshowCurrentIndex.value = 0
      playCurrentSlideshowVideo()
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
  
  // Check if next video is already preloaded and ready
  if (slideshowNextVideo.value && slideshowNextVideo.value.src.includes(currentVideoUuid)) {
    // Swap the videos for seamless transition
    const tempVideo = slideshowVideo.value
    slideshowVideo.value = slideshowNextVideo.value
    slideshowNextVideo.value = tempVideo
    
    // Update z-index to show the new current video
    slideshowVideo.value.style.zIndex = '10'
    slideshowVideo.value.style.display = 'block'
    slideshowNextVideo.value.style.zIndex = '5'
    slideshowNextVideo.value.style.display = 'none'
    
    // Play the swapped video
    if (!slideshowPaused.value) {
      try {
        await slideshowVideo.value.play()
      } catch (playError) {
        console.error('Preloaded video play failed:', playError)
      }
    }
  } else {
    // Fallback to normal loading if preload didn't work
    slideshowVideo.value.pause()
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
}

const preloadNextVideo = () => {
  if (!slideshowNextVideo.value || !isSlideshow.value) return
  
  const nextIndex = slideshowCurrentIndex.value + 1
  if (nextIndex >= slideshowVideos.value.length) {
    // Check if we should loop back to start
    if (slideshowVideos.value.length > 0) {
      const nextVideoUuid = slideshowVideos.value[0]
      const nextStreamUrl = `/api/stream/${nextVideoUuid}`
      
      // Only preload if not already loaded
      if (!slideshowNextVideo.value.src.includes(nextVideoUuid)) {
        console.log(`🔄 Preloading first video for loop: ${nextVideoUuid}`)
        slideshowNextVideo.value.src = nextStreamUrl
        slideshowNextVideo.value.load()
      }
    }
    return
  }
  
  const nextVideoUuid = slideshowVideos.value[nextIndex]
  const nextStreamUrl = `/api/stream/${nextVideoUuid}`
  
  // Only preload if not already loaded
  if (!slideshowNextVideo.value.src.includes(nextVideoUuid)) {
    console.log(`⏳ Preloading next video: ${nextVideoUuid}`)
    slideshowNextVideo.value.src = nextStreamUrl
    slideshowNextVideo.value.load()
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
    const mediaTypeValue = typeof mediaType.value === 'object' ? mediaType.value.value : mediaType.value
    const purposeValue = typeof purpose.value === 'object' ? purpose.value.value : purpose.value
    
    if (mediaTypeValue) params.append('media_type', mediaTypeValue)
    if (purposeValue) params.append('purpose', purposeValue)
    if (subjectUuid.value) params.append('subject_uuid', subjectUuid.value)
    
    // Add selected tags
    if (selectedTags.value.length > 0) {
      params.append('tags', selectedTags.value.join(','))
    }
    params.append('tag_match_mode', 'partial')
    
    
    
    // Use the same sort options as the media gallery
    const sortByValue = typeof sortBy.value === 'object' ? sortBy.value.value : sortBy.value
    const sortOrderValue = typeof sortOrder.value === 'object' ? sortOrder.value.value : sortOrder.value
    
    if (sortByValue) {
      params.append('sort_by', sortByValue)
      if (sortOrderValue) {
        params.append('sort_order', sortOrderValue)
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
    
    // Update total count from API response
    slideshowTotalCount.value = response.total_count || 0
    
    // Filter to only include videos and extract UUIDs
    const videoUuids = newVideos
      .filter(media => media.type === 'video')
      .map(media => media.uuid)
    
    if (videoUuids.length > 0) {
      // Add new video UUIDs to our slideshow array
      slideshowVideos.value.push(...videoUuids)
      slideshowOffset.value += slideshowBatchSize.value
      
      console.log(`✅ Loaded ${videoUuids.length} videos. Total loaded: ${slideshowVideos.value.length}/${slideshowTotalCount.value}`)
    } else {
      console.log(`📭 No more videos found for slideshow. Total available: ${slideshowTotalCount.value}`)
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
  // Load next batch when we have 5 or fewer videos remaining and more are available
  const remainingVideos = slideshowVideos.value.length - slideshowCurrentIndex.value - 1
  const hasMoreVideos = slideshowVideos.value.length < slideshowTotalCount.value
  
  if (remainingVideos <= 5 && !isLoadingNextBatch.value && hasMoreVideos) {
    console.log(`🔄 ${remainingVideos} videos remaining (${slideshowVideos.value.length}/${slideshowTotalCount.value} loaded), loading next batch...`)
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
const openUploadModal = async (mode = 'folder') => {
  uploadMode.value = mode
  isUploadModalOpen.value = true
  resetUploadState()
  await loadCategories()
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

const switchUploadMode = () => {
  uploadMode.value = uploadMode.value === 'single' ? 'folder' : 'single'
  selectedFiles.value = [] // Clear selection when switching modes
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

const handleSingleFileSelection = (event) => {
  const files = Array.from(event.target.files || [])
  
  // Filter for video files only
  const videoFiles = files.filter(file =>
    file.type.startsWith('video/') &&
    file.size > 0
  )
  
  selectedFiles.value = videoFiles
  
  const toast = useToast()
  if (videoFiles.length > 0) {
    toast.add({
      title: 'File Selected',
      description: `Selected "${videoFiles[0].name}" (${formatFileSize(videoFiles[0].size)})`,
      color: 'green',
      timeout: 3000
    })
  } else {
    toast.add({
      title: 'No Valid Files',
      description: 'Please select a valid video file',
      color: 'red',
      timeout: 3000
    })
  }
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
  const BATCH_SIZE = uploadMode.value === 'single' ? 1 : 5 // Process single files individually, folders in batches of 5
  
  // Process files in batches
  for (let i = 0; i < selectedFiles.value.length; i += BATCH_SIZE) {
    const batch = selectedFiles.value.slice(i, i + BATCH_SIZE)
    
    try {
      // Create FormData for this batch
      const formData = new FormData()
      batch.forEach(file => {
        formData.append('videos', file)
      })
      
      // Add upload configuration
      const purposeValue = typeof uploadConfig.value.purpose === 'object' ? uploadConfig.value.purpose.value : uploadConfig.value.purpose
      formData.append('purpose', purposeValue)
      
      // Add categories (extract values from objects if needed)
      const categoryValues = uploadConfig.value.categories.map(cat =>
        typeof cat === 'object' ? cat.value || cat.label : cat
      )
      formData.append('categories', JSON.stringify(categoryValues))
      
      // Update progress
      if (uploadMode.value === 'single') {
        uploadProgress.value.currentFile = `Uploading ${batch[0].name}...`
      } else {
        uploadProgress.value.currentFile = `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}...`
      }
      
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

// Categories management methods
const loadCategories = async () => {
  loadingCategories.value = true
  try {
    const response = await $fetch('/api/categories')
    if (response.success) {
      // Transform categories for UInputMenu format
      availableCategories.value = response.categories.map(cat => ({
        label: cat.name,
        value: cat.name,
        id: cat.id,
        color: cat.color
      }))
    }
  } catch (error) {
    console.error('Failed to load categories:', error)
    const toast = useToast()
    toast.add({
      title: 'Categories Load Error',
      description: 'Failed to load categories. You can still create new ones.',
      color: 'yellow',
      timeout: 3000
    })
  } finally {
    loadingCategories.value = false
  }
}

// Video editing methods

const exitEditMode = () => {
  isEditingMode.value = false
  showCropOverlay.value = false
  resetEditSettings()
}

const resetEditSettings = () => {
  editSettings.value = {
    trimStart: null,
    trimEnd: null,
    crop: {
      x: 0,
      y: 0,
      width: videoWidth.value,
      height: videoHeight.value
    },
    deletedFrames: []
  }
}

const closeModal = async () => {
  if (isEditingMode.value && hasEditOperations.value) {
    await confirmCancelEdits()
  } else {
    isModalOpen.value = false
    exitEditMode()
  }
}

const confirmSaveEdits = async () => {
  const { confirm } = useConfirmDialog()
  
  const result = await confirm({
    title: 'Save Video Edits',
    message: 'Are you sure you want to save these edits? This will permanently modify the video file and cannot be undone.',
    confirmLabel: 'Save Changes',
    cancelLabel: 'Cancel',
    variant: 'primary'
  })
  
  if (result) {
    await saveVideoEdits()
  }
}

const confirmCancelEdits = async () => {
  if (!hasEditOperations.value) {
    exitEditMode()
    return
  }
  
  const { confirm } = useConfirmDialog()
  
  const result = await confirm({
    title: 'Cancel Video Edits',
    message: 'Are you sure you want to cancel? All unsaved changes will be lost.',
    confirmLabel: 'Discard Changes',
    cancelLabel: 'Keep Editing',
    variant: 'error'
  })
  
  if (result) {
    exitEditMode()
  }
}

const saveVideoEdits = async () => {
  if (!selectedMedia.value || !hasEditOperations.value) return
  
  isSavingEdits.value = true
  const toast = useToast()
  
  try {
    const response = await useApiFetch(`media/${selectedMedia.value.uuid}/edit`, {
      method: 'POST',
      body: {
        operations: {
          trim: editSettings.value.trimStart || editSettings.value.trimEnd ? {
            start: editSettings.value.trimStart || 0,
            end: editSettings.value.trimEnd || videoDuration.value
          } : null,
          crop: hasCropChanges.value ? editSettings.value.crop : null,
          deletedFrames: editSettings.value.deletedFrames.length > 0 ? editSettings.value.deletedFrames : null
        }
      }
    })
    
    if (response.success) {
      // Update the media record in our local state
      const mediaIndex = mediaResults.value.findIndex(m => m.uuid === selectedMedia.value.uuid)
      if (mediaIndex !== -1) {
        mediaResults.value[mediaIndex] = {
          ...mediaResults.value[mediaIndex],
          ...response.updatedMedia
        }
        
        // Update selected media
        selectedMedia.value = mediaResults.value[mediaIndex]
      }
      
      toast.add({
        title: 'Video Saved',
        description: 'Your video edits have been saved successfully.',
        color: 'green',
        timeout: 3000
      })
      
      exitEditMode()
    }
    
  } catch (error) {
    console.error('Failed to save video edits:', error)
    toast.add({
      title: 'Save Failed',
      description: error.data?.message || 'Failed to save video edits. Please try again.',
      color: 'red',
      timeout: 5000
    })
  } finally {
    isSavingEdits.value = false
  }
}

const onVideoLoaded = (event) => {
  const video = event.target
  videoDuration.value = video.duration
  videoWidth.value = video.videoWidth
  videoHeight.value = video.videoHeight
  
  // Initialize crop settings to full video size
  if (isEditingMode.value) {
    editSettings.value.crop = {
      x: 0,
      y: 0,
      width: video.videoWidth,
      height: video.videoHeight
    }
    
    // Capture current frame for cropper
    captureVideoFrame(video)
  }
}

const onTimeUpdate = (event) => {
  currentTime.value = event.target.currentTime
}

const formatTime = (seconds) => {
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

const setCurrentTimeAsStart = () => {
  editSettings.value.trimStart = currentTime.value
}

const setCurrentTimeAsEnd = () => {
  editSettings.value.trimEnd = currentTime.value
}

const resetCrop = () => {
  editSettings.value.crop = {
    x: 0,
    y: 0,
    width: videoWidth.value,
    height: videoHeight.value
  }
}

const centerCrop = () => {
  const cropWidth = Math.floor(videoWidth.value * 0.8)
  const cropHeight = Math.floor(videoHeight.value * 0.8)
  
  editSettings.value.crop = {
    x: Math.floor((videoWidth.value - cropWidth) / 2),
    y: Math.floor((videoHeight.value - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight
  }
}

const deleteCurrentFrame = () => {
  const frameTime = currentTime.value
  const frameNumber = Math.floor(frameTime * (videoFPS.value || 30))
  
  // Check if frame is already deleted
  const existingFrame = editSettings.value.deletedFrames.find(f =>
    Math.abs(f.time - frameTime) < 0.1
  )
  
  if (!existingFrame) {
    editSettings.value.deletedFrames.push({
      time: frameTime,
      frame: frameNumber
    })
    
    // Sort by time
    editSettings.value.deletedFrames.sort((a, b) => a.time - b.time)
    
    const toast = useToast()
    toast.add({
      title: 'Frame Deleted',
      description: `Frame at ${formatTime(frameTime)} marked for deletion`,
      color: 'yellow',
      timeout: 2000
    })
  }
}

const deleteFrameRange = async () => {
  // This would open a dialog to select start/end times for frame range deletion
  const toast = useToast()
  toast.add({
    title: 'Feature Coming Soon',
    description: 'Frame range deletion will be implemented in a future update',
    color: 'blue',
    timeout: 3000
  })
}

const restoreFrame = (index) => {
  editSettings.value.deletedFrames.splice(index, 1)
  
  const toast = useToast()
  toast.add({
    title: 'Frame Restored',
    description: 'Frame has been restored',
    color: 'green',
    timeout: 2000
  })
}


// Custom crop drag functionality
const cropOverlayStyle = computed(() => {
  const crop = editSettings.value.crop
  const videoEl = modalVideo.value || document.querySelector('.max-w-full video[controls]')
  
  if (!videoEl) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }
  
  const videoRect = videoEl.getBoundingClientRect()
  const scaleX = videoRect.width / videoWidth.value
  const scaleY = videoRect.height / videoHeight.value
  
  return {
    left: crop.x * scaleX,
    top: crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY
  }
})

const startCropDrag = (event) => {
  if (isResizing.value) return
  
  isDragging.value = true
  dragStart.value = { x: event.clientX, y: event.clientY }
  cropStart.value = { ...editSettings.value.crop }
  event.preventDefault()
}

const updateCropDrag = (event) => {
  if (!isDragging.value && !isResizing.value) return
  
  const videoEl = modalVideo.value || document.querySelector('.max-w-full video[controls]')
  if (!videoEl) return
  
  const videoRect = videoEl.getBoundingClientRect()
  const scaleX = videoWidth.value / videoRect.width
  const scaleY = videoHeight.value / videoRect.height
  
  if (isDragging.value) {
    const deltaX = (event.clientX - dragStart.value.x) * scaleX
    const deltaY = (event.clientY - dragStart.value.y) * scaleY
    
    const newX = Math.max(0, Math.min(cropStart.value.x + deltaX, videoWidth.value - cropStart.value.width))
    const newY = Math.max(0, Math.min(cropStart.value.y + deltaY, videoHeight.value - cropStart.value.height))
    
    editSettings.value.crop.x = Math.round(newX)
    editSettings.value.crop.y = Math.round(newY)
  }
  
  if (isResizing.value) {
    const deltaX = (event.clientX - dragStart.value.x) * scaleX
    const deltaY = (event.clientY - dragStart.value.y) * scaleY
    
    const handle = resizeHandle.value
    const newCrop = { ...cropStart.value }
    
    if (handle.includes('n')) {
      newCrop.y = Math.max(0, cropStart.value.y + deltaY)
      newCrop.height = Math.max(10, cropStart.value.height - deltaY)
    }
    if (handle.includes('s')) {
      newCrop.height = Math.max(10, Math.min(cropStart.value.height + deltaY, videoHeight.value - cropStart.value.y))
    }
    if (handle.includes('w')) {
      newCrop.x = Math.max(0, cropStart.value.x + deltaX)
      newCrop.width = Math.max(10, cropStart.value.width - deltaX)
    }
    if (handle.includes('e')) {
      newCrop.width = Math.max(10, Math.min(cropStart.value.width + deltaX, videoWidth.value - cropStart.value.x))
    }
    
    editSettings.value.crop = {
      x: Math.round(newCrop.x),
      y: Math.round(newCrop.y),
      width: Math.round(newCrop.width),
      height: Math.round(newCrop.height)
    }
  }
}

const endCropDrag = () => {
  isDragging.value = false
  isResizing.value = false
  resizeHandle.value = ''
}

const startResize = (handle) => {
  isResizing.value = true
  resizeHandle.value = handle
  dragStart.value = { x: event.clientX, y: event.clientY }
  cropStart.value = { ...editSettings.value.crop }
  event.preventDefault()
}

// Update enterEditMode to initialize crop area
const enterEditMode = () => {
  isEditingMode.value = true
  resetEditSettings()
}

// Initialize settings and load filters on mount (but don't auto-search)
onMounted(async () => {
  await settingsStore.initializeSettings()
  await loadFilters()
})


// Page head
useHead({
  title: 'Media Gallery - AI Job Tracking System',
  meta: [
    { name: 'description', content: 'Browse encrypted media storage' }
  ]
})
</script>

<style scoped>
/* Custom crop overlay styles */
.cursor-crosshair {
  cursor: crosshair;
}

.cursor-nw-resize {
  cursor: nw-resize;
}

.cursor-ne-resize {
  cursor: ne-resize;
}

.cursor-sw-resize {
  cursor: sw-resize;
}

.cursor-se-resize {
  cursor: se-resize;
}

.cursor-n-resize {
  cursor: n-resize;
}

.cursor-s-resize {
  cursor: s-resize;
}

.cursor-w-resize {
  cursor: w-resize;
}

.cursor-e-resize {
  cursor: e-resize;
}
</style>