<template>
  <div class="container mx-auto p-3 sm:p-6 pb-16 sm:pb-24">

    <!-- Search Filters -->
    <div class="mb-3 sm:mb-6">
      <!-- Header always visible -->
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3" :class="filtersCollapsed ? 'rounded-lg' : 'rounded-t-lg'">
        <div class="flex justify-between items-center">
          <div class="flex gap-2 items-center">
            <!-- Search and Clear Buttons -->
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
          <div class="flex gap-2 items-center">
            <!-- Upload Videos Button -->
            <UButton
              color="green"
              variant="outline"
              size="xs"
              @click="openUploadModal()"
            >
              <UIcon name="i-heroicons-arrow-up-tray" />
              <span class="hidden sm:inline">Upload</span>
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
      </div>

      <!-- Content only when not collapsed -->
      <div v-if="!filtersCollapsed" class="bg-white dark:bg-gray-800 border-x border-b border-gray-200 dark:border-gray-700 rounded-b-lg px-4 py-3 space-y-3 sm:space-y-4">
        <!-- UUID and Filename Search -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

          <!-- Filename Search -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Filename (Partial Match)
            </label>
            <UInput
              v-model="filenameSearch"
              placeholder="Enter partial filename to search..."
              class="w-full"
              :ui="{ trailing: 'pe-1' }"
              :disabled="!!mediaUuid"
            >
              <template v-if="filenameSearch?.length" #trailing>
                <UButton
                  color="neutral"
                  variant="link"
                  size="sm"
                  icon="i-heroicons-x-mark"
                  aria-label="Clear filename input"
                  @click="filenameSearch = ''"
                />
              </template>
            </UInput>
          </div>
        </div>

        <!-- Media Type and Purpose on same line -->
        <div class="grid grid-cols-2 gap-3 sm:gap-4">
          <!-- Media Type Filter -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Media Type
            </label>
            <USelect
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
            <USelect
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
                :ui="{ trailing: 'pe-1' }"
              >
                <template v-if="selectedTags?.length" #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    icon="i-lucide-circle-x"
                    aria-label="Clear all tags"
                    @click="selectedTags = []"
                  />
                </template>
              </UInputTags>
              <UCheckbox
                v-model="onlyShowUntagged"
                label="Only show untagged"
                class="text-xs"
                :disabled="!!mediaUuid"
              />
            </div>
          </div>
        </div>

        <!-- Sort Options and Limit -->
        <div class="flex gap-2 sm:gap-4 mt-3 sm:mt-4">
          <div class="flex-1 min-w-0">
            <USelect
              v-model="sortBy"
              :items="sortByOptions"
              placeholder="Sort by..."
              class="w-full"
              :disabled="!!mediaUuid"
            />
          </div>
          <div class="w-24 flex-shrink-0">
            <USelect
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

      </div>
    </div>

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
          class="bg-neutral-800 shadow-md overflow-hidden hover:shadow-lg transition-shadow group"
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
              :alt="media.type"
              class="w-full h-full object-cover object-top"
              loading="lazy"
              @error="handleImageError"
              @load="handleImageLoad"
            >
            <ImagePlaceholder v-else class="w-full h-full" />
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
          
          <!-- Video Preview -->
          <div
            v-else-if="media.type === 'video'"
            class="aspect-[3/4] relative cursor-pointer"
            :data-video-uuid="media.uuid"
            @click="openModal(media)"
            @mouseenter="settingsStore.displayImages ? handleVideoHover(media.uuid, true) : null"
            @mouseleave="settingsStore.displayImages ? handleVideoHover(media.uuid, false) : null"
          >
            <!-- Video element (only when displayImages is true) -->
            <video
              v-if="settingsStore.displayImages"
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
            
            <!-- Fallback for videos without thumbnails (when displayImages is true) -->
            <div
              v-if="settingsStore.displayImages && !media.thumbnail_uuid"
              class="absolute inset-0 bg-gray-800 flex items-center justify-center"
            >
              <UIcon name="i-heroicons-play-circle" class="text-4xl text-gray-400" />
            </div>
            
            <!-- Video placeholder (when displayImages is false) -->
            <div
              v-if="!settingsStore.displayImages"
              class="w-full h-full bg-gray-800 flex items-center justify-center"
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

        </div>
      </div>

      <!-- List View -->
      <div v-else class="space-y-1 sm:space-y-2">
        <div
          v-for="media in mediaResults"
          :key="media.uuid"
          class="bg-neutral-800 p-2 sm:p-4 shadow-sm hover:shadow-md transition-shadow group"
        >
          <div class="flex items-center gap-2 sm:gap-4">
            <!-- Thumbnail -->
            <div class="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 dark:bg-gray-700 shrink-0 cursor-pointer" @click="openModal(media)">
              <!-- Image thumbnail -->
              <img
                v-if="media.type === 'image' && settingsStore.displayImages"
                :src="media.thumbnail ? media.thumbnail : `/api/media/${media.uuid}/image?size=sm`"
                :alt="media.type"
                class="w-full h-full object-cover object-top"
                loading="lazy"
                @error="handleImageError"
              >
              <!-- Image placeholder -->
              <div
                v-else-if="media.type === 'image'"
                class="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center"
              >
                <UIcon name="i-heroicons-photo" class="text-2xl text-gray-400" />
              </div>
              <!-- Video thumbnail (when displayImages is true) -->
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
                  <UIcon name="i-heroicons-play-circle" class="text-2xl text-gray-400" />
                </div>
              </div>
              <!-- Video placeholder (when displayImages is false) -->
              <div v-else-if="media.type === 'video'" class="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <UIcon name="i-heroicons-play-circle" class="text-2xl text-gray-400" />
              </div>
              <!-- Other media types -->
              <div v-else class="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <UIcon name="i-heroicons-document" class="text-2xl text-gray-400" />
              </div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 cursor-pointer" @click="openModal(media)">
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
    <MediaDetailsModal
      v-model:is-open="isModalOpen"
      :media="selectedMedia"
      :current-index="currentMediaIndex"
      :total-count="allMediaResults.length"
      :deleting-ids="deletingIds"
      :has-next="currentMediaIndex < allMediaResults.length - 1"
      :has-previous="currentMediaIndex > 0"
      :only-show-untagged="onlyShowUntagged"
      @navigate="navigateMedia"
      @confirm-delete="confirmDelete"
      @close="closeModal"
      @save-edits="handleMediaSaveEdits"
      @save="handleTagSave"
    />

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
      
      <!-- Exit Button -->
      <div class="absolute top-4 right-4 z-50">
        <UButton
          variant="solid"
          color="white"
          icon="i-heroicons-x-mark"
          size="sm"
          @click="stopSlideshow"
          @touchstart="stopSlideshow"
          @touchend.prevent
        />
      </div>
      
      <!-- Navigation Arrows -->
      <div class="absolute top-0 left-0 w-full h-full flex items-center z-40">
        <!-- Left side: Stacked navigation for one-handed mobile use -->
        <div class="flex flex-col gap-3 pl-4">
          <UButton
            variant="solid"
            color="white"
            icon="i-heroicons-chevron-right"
            size="lg"
            @click="slideshowNext"
            @touchstart="slideshowNext"
            @touchend.prevent
          />
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
          <UButton
            variant="solid"
            color="white"
            :icon="slideshowPaused ? 'i-heroicons-play' : 'i-heroicons-pause'"
            size="lg"
            @click="toggleSlideshowPause"
            @touchstart="toggleSlideshowPause"
            @touchend.prevent
          />
        </div>
      </div>
      
    </div>


    <!-- Media Upload Modal -->
    <UploadModal
      v-model:is-open="isUploadModalOpen"
      @close="closeUploadModal"
    />

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
  mediaUuid,
  onlyShowUntagged
} = useMediaGalleryFilters()

// Template refs
const modalVideo = ref(null)



// Upload modal functionality
const isUploadModalOpen = ref(false)



// Subject selection state - default to "None" option
const selectedSubject = ref({ value: '', label: 'None' })

// Filename search state
const filenameSearch = ref('')

const mediaResults = ref([])
const isLoading = ref(false)
const hasSearched = ref(false)
const selectedMedia = ref(null)
const deletingIds = ref([])
const isModalOpen = ref(false)
const currentPage = ref(1)
const pagination = ref({
  total: 0,
  limit: 24,
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




// Filter options
const mediaTypeOptions = [
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' }
]

const purposeOptions = [
  { label: 'All Purposes', value: 'all' },
  { label: 'Source', value: 'source' },
  { label: 'Destination', value: 'dest' },
  { label: 'Output', value: 'output' },
  { label: 'Thumbnail', value: 'thumbnail' },
  { label: 'Voyeur', value: 'voyeur' },
  { label: 'Subject', value: 'subject' },
  { label: 'Porn', value: 'porn' },
  { label: 'Todo', value: 'todo' }
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
  { label: '24', value: 24 },
  { label: '48', value: 48 },
  { label: '96', value: 96 },
  { label: '192', value: 192 },
  { label: '480', value: 480 }
]



// Search cancellation
const searchController = ref(null)

// No longer needed - composable handles saving automatically

// Helper function to build search parameters
const buildSearchParams = () => {
  const params = new URLSearchParams()
  
  // Priority searches that ignore other filters
  if (mediaUuid.value && mediaUuid.value.trim()) {
    params.append('uuid', mediaUuid.value.trim())
    params.append('include_thumbnails', 'true')
    return { params, searchType: 'uuid' }
  }
  
  if (filenameSearch.value && filenameSearch.value.trim()) {
    params.append('filename_pattern', filenameSearch.value.trim())
    params.append('include_thumbnails', 'true')
    return { params, searchType: 'filename' }
  }
  
  // Normal search with all filters
  const mediaTypeValue = typeof mediaType.value === 'object' ? mediaType.value.value : mediaType.value
  const purposeValue = typeof purpose.value === 'object' ? purpose.value.value : purpose.value
  
  if (mediaTypeValue) params.append('media_type', mediaTypeValue)
  if (purposeValue && purposeValue !== 'all') params.append('purpose', purposeValue)
  if (subjectUuid.value) params.append('subject_uuid', subjectUuid.value)
  
  // Add selected tags from UInputTags component
  if (selectedTags.value.length > 0) {
    params.append('tags', selectedTags.value.join(','))
  }
  // Always use partial match mode (API only supports this)
  params.append('tag_match_mode', 'partial')
  
  // Add only show untagged filter
  if (onlyShowUntagged.value) {
    params.append('only_untagged', 'true')
  }
  
  params.append('include_thumbnails', 'true')
  return { params, searchType: 'normal' }
}

// Helper function to add pagination and sorting
const addPaginationAndSorting = (params) => {
  // Handle limit - extract value if it's an object, use paginationLimit from composable
  const limit = typeof paginationLimit.value === 'object' ? paginationLimit.value.value : paginationLimit.value
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
}

// Helper function to update pagination
const updatePagination = (response, searchType) => {
  if (searchType === 'uuid') {
    pagination.value = {
      total: response.results?.length || 0,
      limit: 1,
      offset: 0,
      has_more: false
    }
    return
  }
  
  // For filename and normal searches
  const currentLimit = typeof paginationLimit.value === 'object' ? paginationLimit.value.value : paginationLimit.value
  const currentOffset = response.offset || ((currentPage.value - 1) * currentLimit)
  const hasMore = response.count === currentLimit
  
  pagination.value = {
    total: hasMore ? currentOffset + response.count + 1 : currentOffset + response.count,
    limit: currentLimit,
    offset: currentOffset,
    has_more: hasMore
  }
}

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
    const { params, searchType } = buildSearchParams()
    
    // Add pagination and sorting for non-UUID searches
    if (searchType !== 'uuid') {
      addPaginationAndSorting(params)
    }

    const response = await useApiFetch(`media/search?${params.toString()}`, {
      signal: searchController.value.signal
    })
    
    const allResults = response.results || []
    
    // Filter results based on media type selection (only for normal searches)
    if (searchType === 'normal') {
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
    } else {
      // For direct searches (UUID/filename), use results as-is
      mediaResults.value = allResults
    }
    
    // Update pagination
    updatePagination(response, searchType)
    
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
  
  // Reset subject selection to "None"
  selectedSubject.value = { value: '', label: 'None' }
  subjectUuid.value = ''
  
  // Reset pagination
  pagination.value = {
    total: 0,
    limit: typeof paginationLimit.value === 'object' ? paginationLimit.value.value : paginationLimit.value,
    offset: 0,
    has_more: false
  }
}

// Subject selection handler
const handleSubjectSelection = (selected) => {
  
  // Update filters
  if (selected && selected.value && selected.value !== '') {
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
  console.debug('✅ Image loaded successfully:', {
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
    
    // Update the selected media if it's the same record
    if (selectedMedia.value && selectedMedia.value.uuid === data.uuid) {
      selectedMedia.value.tags = { tags: data.tags }
    }
    
    // Show success message (shorter timeout for rapid tagging)
    toast.add({
      title: 'Tags Saved',
      description: `Tags updated for ${data.tags.length} tag${data.tags.length !== 1 ? 's' : ''}`,
      color: 'green',
      duration: 500
    })
    
  } catch (error) {
    console.error('Failed to save tags:', error)
    toast.add({
      title: 'Save Failed',
      description: 'Failed to save tags. Please try again.',
      color: 'red',
      duration: 1000
    })
    throw error // Re-throw to prevent navigation on error
  }
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
    // Note: When paused, video.loop = true handles looping automatically
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
    slideshowVideo.value.loop = false  // Default to no loop, will be set dynamically based on pause state
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
    // When pausing, enable loop on current video so it keeps playing
    slideshowVideo.value.loop = true
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
    
    // Set loop based on pause state
    slideshowVideo.value.loop = slideshowPaused.value
    
    // Play the swapped video
    if (!slideshowPaused.value) {
      try {
        await slideshowVideo.value.play()
      } catch (playError) {
        console.error('Preloaded video play failed:', playError)
      }
    } else {
      // If paused, still try to play since loop is enabled
      try {
        await slideshowVideo.value.play()
      } catch (playError) {
        console.error('Paused video play failed:', playError)
      }
    }
  } else {
    // Fallback to normal loading if preload didn't work
    slideshowVideo.value.pause()
    slideshowVideo.value.src = streamUrl
    
    // Set loop based on pause state
    slideshowVideo.value.loop = slideshowPaused.value
    
    slideshowVideo.value.load()
    
    // Try to play regardless of pause state (loop will handle paused behavior)
    try {
      await slideshowVideo.value.play()
    } catch (playError) {
      console.error('Video play failed:', playError)
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
    if (purposeValue && purposeValue !== 'all') params.append('purpose', purposeValue)
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

// Upload modal methods
const openUploadModal = () => {
  isUploadModalOpen.value = true
}

const closeUploadModal = () => {
  isUploadModalOpen.value = false
}

// Video editing methods



// Handler for media edits saved from the modal
const handleMediaSaveEdits = (updatedMedia) => {
  // Update the media record in our local state
  const mediaIndex = mediaResults.value.findIndex(m => m.uuid === selectedMedia.value.uuid)
  if (mediaIndex !== -1) {
    mediaResults.value[mediaIndex] = {
      ...mediaResults.value[mediaIndex],
      ...updatedMedia
    }
    
    // Update selected media
    selectedMedia.value = mediaResults.value[mediaIndex]
  }
}

const closeModal = () => {
  isModalOpen.value = false
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