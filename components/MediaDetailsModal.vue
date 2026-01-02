<template>
  <!-- Media Detail Modal -->
  <UModal :open="isOpen" @update:open="$emit('update:isOpen', $event)" :fullscreen="isMobile">
    <template #header>
      <div v-if="media" class="flex justify-between items-center w-full gap-3">
        <div class="flex items-center gap-2 sm:gap-3">
          <span v-if="currentIndex !== undefined && totalCount !== undefined" class="text-sm sm:text-sm text-gray-500 hidden sm:inline"> {{ currentIndex + 1 }} / {{ totalCount }} </span>

          <!-- Total Untagged Count (only in tag mode) -->
          <span v-if="currentMode === 'tag' && totalUntaggedInDatabase > 0" class="text-sm sm:text-sm text-blue-600 dark:text-blue-400 font-medium"> {{ totalUntaggedInDatabase }} untagged </span>
        </div>

        <div class="flex items-center gap-2 sm:gap-2 shrink-0">
          <!-- Purpose Selector -->
          <USelect v-model="currentPurpose" :items="purposeOptions" :size="isMobile ? 'sm' : 'xs'" :class="isMobile ? 'w-24' : 'w-20'" :loading="isSavingPurpose" @update:model-value="updatePurpose" />

          <!-- Mode Selector -->
          <USelect v-model="currentMode" :items="modeOptions" :size="isMobile ? 'sm' : 'xs'" :class="isMobile ? 'w-24' : 'w-20'" :disabled="isSavingEdits || isSavingTags" />

          <!-- Save/Cancel buttons for edit mode -->
          <UButton v-if="currentMode === 'edit'" variant="solid" color="success" :size="isMobile ? 'md' : 'xs'" :loading="isSavingEdits" @click="confirmSaveEdits"> Save </UButton>
          <UButton v-if="currentMode === 'edit'" variant="outline" :size="isMobile ? 'md' : 'xs'" @click="confirmCancelEdits"> Cancel </UButton>

          <!-- Duplicate button (only in none mode) -->
          <UButton v-if="currentMode === 'none'" variant="solid" icon="i-heroicons-document-duplicate" color="primary" :size="isMobile ? 'lg' : 'xs'" :class="isMobile ? 'min-w-[44px] min-h-[44px] flex items-center justify-center' : ''" :loading="isDuplicating" @click="duplicateMedia" square />

          <!-- Delete button (only in none mode) -->
          <UButton v-if="currentMode === 'none'" variant="solid" icon="i-heroicons-trash" color="error" :size="isMobile ? 'lg' : 'xs'" :class="isMobile ? 'min-w-[44px] min-h-[44px] flex items-center justify-center' : ''" :loading="deletingIds.includes(media.uuid)" @click="$emit('confirmDelete', media)" square />

          <UButton variant="ghost" icon="i-heroicons-x-mark" :size="isMobile ? 'xl' : 'xs'" :class="isMobile ? 'min-w-[44px] min-h-[44px]' : ''" @click="closeModal" />
        </div>
      </div>
    </template>

    <template #body>
      <div v-if="media" :class="currentMode === 'tag' ? '' : 'p-3 sm:p-6'" @touchstart="handleGestureTouchStart" @touchmove="handleGestureTouchMove" @touchend="handleGestureTouchEnd">
        <!-- Tag Mode Layout -->
        <div v-if="currentMode === 'tag'" class="grid grid-cols-1 lg:grid-cols-2 gap-6 p-0">
          <!-- Media Display -->
          <div class="space-y-4 flex flex-col">
            <!-- Fixed height media container -->
            <div class="relative touch-pan-y" style="height: 70vh; min-height: 400px">
              <!-- Image display -->
              <img v-if="media.type === 'image' && settingsStore.displayImages" :key="`tag-image-${media.uuid}`" :src="media.thumbnail || `/api/media/${media.uuid}/image?size=md`" :alt="media.filename" class="w-full h-full object-contain rounded-lg shadow-md" @error="handleImageError" />
              <!-- Image placeholder -->
              <div v-else-if="media.type === 'image'" :key="`tag-image-placeholder-${media.uuid}`" class="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                <div class="text-center">
                  <UIcon name="i-heroicons-photo" class="text-6xl text-gray-400 mb-2" />
                </div>
              </div>
              <!-- Video display -->
              <video v-else-if="media.type === 'video' && settingsStore.displayImages && media.thumbnail_uuid" :key="`tag-video-${media.uuid}`" :poster="media.thumbnail || `/api/media/${media.thumbnail_uuid}/image?size=md`" class="w-full h-full object-contain rounded-lg shadow-md" controls preload="metadata" autoplay>
                <source :src="`/api/stream/${media.uuid}`" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              <!-- Video placeholder (when displayImages is false or no thumbnail) -->
              <div v-else-if="media.type === 'video'" :key="`tag-video-placeholder-${media.uuid}`" class="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                <div class="text-center">
                  <UIcon name="i-heroicons-play-circle" class="text-6xl text-gray-400 mb-2" />
                </div>
              </div>

              <!-- Overlaid Current/Total Counter (Tag Mode Only) -->
              <div v-if="currentMode === 'tag' && currentIndex !== undefined && totalCount !== undefined" class="absolute top-2 left-2 z-20">
                <div class="bg-black/70 text-white px-2 py-1 rounded text-sm font-medium backdrop-blur-sm">{{ currentIndex + 1 }} / {{ totalCount }}</div>
              </div>

              <!-- Overlaid Navigation Buttons (Desktop Only) -->
              <div class="absolute left-2 top-1/2 transform -translate-y-1/2 flex flex-col gap-2 z-10 hidden md:flex">
                <UButton :disabled="!props.hasPrevious" variant="solid" color="white" icon="i-heroicons-chevron-left" size="lg" class="shadow-lg w-12 h-12" @click="navigatePrevious" />
                <UButton :disabled="!props.hasNext" variant="solid" color="white" icon="i-heroicons-chevron-right" size="lg" class="shadow-lg w-12 h-12" @click="navigateNext" />
              </div>
            </div>

            <!-- Save & Close button -->
            <div class="flex justify-between items-center">
              <UButton v-if="!props.hasNext" variant="solid" color="success" trailing-icon="i-heroicons-check" :loading="isSavingTags" @click="saveAndClose"> Save & Close </UButton>
            </div>
          </div>

          <!-- Tag Selection Panel -->
          <div class="space-y-6">
            <!-- Quick Tags -->
            <div>
              <div class="space-y-2">
                <!-- Hair Color Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton v-for="tag in hairColorTags" :key="tag" variant="solid" :color="selectedTags.includes(tag) ? 'primary' : 'neutral'" size="sm" @click="toggleTag(tag)">
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>

                <!-- Hair Style Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton v-for="tag in hairStyleTags" :key="tag" variant="solid" :color="selectedTags.includes(tag) ? 'primary' : 'neutral'" size="sm" @click="toggleTag(tag)">
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>

                <!-- Age/Body Type Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton v-for="tag in ageBodyTags" :key="tag" variant="solid" :color="selectedTags.includes(tag) ? 'primary' : 'neutral'" size="sm" @click="toggleTag(tag)">
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>

                <!-- Action/Other Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton v-for="tag in actionTags" :key="tag" variant="solid" :color="selectedTags.includes(tag) ? 'primary' : 'neutral'" size="sm" @click="toggleTag(tag)">
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>
              </div>
            </div>

            <!-- Current Tags Display -->
            <div>
              <h5 class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">Current Tags</h5>
              <UInputTags v-model="selectedTags" :ui="{ trailing: 'pe-1' }">
                <template #trailing>
                  <UButton v-if="selectedTags.length > 0" color="neutral" variant="link" size="sm" icon="i-lucide-circle-x" aria-label="Clear all tags" @click="clearAllTags" />
                </template>
              </UInputTags>
            </div>
          </div>
        </div>

        <!-- Normal/Edit Mode Layout -->
        <div v-else class="space-y-4">
          <!-- Image Display -->
          <div v-if="media.type === 'image'" :key="`image-${media.uuid}`" class="w-full relative">
            <!-- Previous Button -->
            <UButton v-if="currentIndex > 0" variant="solid" color="white" icon="i-heroicons-chevron-left" class="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg" @click="$emit('navigate', -1)" />

            <img v-if="settingsStore.displayImages" :src="media.thumbnail ? media.thumbnail : `/api/media/${media.uuid}/image?size=lg`" :alt="media.type" class="w-full object-contain rounded" @error="handleImageError" />
            <div v-else class="w-full bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center min-h-96">
              <div class="text-center">
                <UIcon name="i-heroicons-photo" class="text-6xl text-gray-400 mb-2" />
              </div>
            </div>

            <!-- Next Button -->
            <UButton v-if="currentIndex < totalCount - 1" variant="solid" color="white" icon="i-heroicons-chevron-right" class="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg" @click="$emit('navigate', 1)" />
          </div>

          <!-- Video Display -->
          <div v-else-if="media.type === 'video'" :key="`video-display-${media.uuid}-${media._cacheBuster || 0}`" class="w-full">
            <div class="relative">
              <video v-if="settingsStore.displayImages" :ref="modalVideo" :poster="media.thumbnail ? media.thumbnail : media.thumbnail_uuid ? `/api/media/${media.thumbnail_uuid}/image?size=sm` : undefined" controls muted loop class="w-full object-contain rounded" preload="metadata" playsinline webkit-playsinline :data-video-id="media.uuid" disablePictureInPicture crossorigin="anonymous" @loadedmetadata="onVideoLoaded" @timeupdate="onTimeUpdate">
                <source :src="`/api/stream/${media.uuid}?v=${media._cacheBuster || 0}`" type="video/mp4" />
                Your browser does not support the video tag.
              </video>

              <!-- Video placeholder when displayImages is false -->
              <div v-else class="w-full bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center min-h-96">
                <div class="text-center">
                  <UIcon name="i-heroicons-play-circle" class="text-6xl text-gray-400 mb-2" />
                </div>
              </div>

              <!-- Star Rating Overlay -->
              <StarRating v-if="currentMode === 'none'" :media-uuid="media.uuid" :rating="currentRating" @updated="handleRatingUpdate" />

              <!-- Cropper overlay (only visible in edit mode) -->
              <div v-if="currentMode === 'edit'" class="absolute inset-0 z-20 bg-black">
                <Cropper ref="cropperRef" class="h-full w-full" :src="media.thumbnail || `/api/media/${media.uuid}/image?size=lg`" @change="onCropperChange" />
              </div>
            </div>
          </div>

          <!-- Video Editing Controls (only visible in edit mode) -->
          <div v-if="currentMode === 'edit' && media.type === 'video'" class="space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6">
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
                      <UInput v-model.number="editSettings.trimStart" type="number" step="0.1" min="0" :max="videoDuration" placeholder="0.0" class="flex-1" size="sm" />
                      <UButton size="sm" variant="outline" @click="setCurrentTimeAsStart"> Current </UButton>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">{{ formatTime(editSettings.trimStart || 0) }}</p>
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Time (seconds)</label>
                    <div class="flex gap-2">
                      <UInput v-model.number="editSettings.trimEnd" type="number" step="0.1" min="0" :max="videoDuration" :placeholder="videoDuration?.toString() || ''" class="flex-1" size="sm" />
                      <UButton size="sm" variant="outline" @click="setCurrentTimeAsEnd"> Current </UButton>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">{{ formatTime(editSettings.trimEnd || videoDuration || 0) }}</p>
                  </div>

                  <div class="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">New Duration: {{ formatTime((editSettings.trimEnd || videoDuration || 0) - (editSettings.trimStart || 0)) }}</div>
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
                    <UButton size="sm" color="red" variant="outline" block @click="deleteCurrentFrame"> Delete Current Frame </UButton>

                    <UButton size="sm" variant="outline" block @click="deleteFrameRange"> Delete Frame Range </UButton>
                  </div>

                  <!-- Deleted frames list -->
                  <div v-if="editSettings.deletedFrames.length > 0" class="mt-4">
                    <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Deleted Frames ({{ editSettings.deletedFrames.length }})</h5>
                    <div class="max-h-32 overflow-y-auto space-y-1">
                      <div v-for="(frame, index) in editSettings.deletedFrames" :key="index" class="flex justify-between items-center text-xs bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 p-2 rounded">
                        <span>{{ formatTime(frame.time) }}</span>
                        <UButton size="xs" variant="ghost" icon="i-heroicons-x-mark" @click="restoreFrame(index)" />
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
                  <div v-if="editSettings.trimStart || editSettings.trimEnd"><strong>Trim:</strong> {{ formatTime(editSettings.trimStart || 0) }} - {{ formatTime(editSettings.trimEnd || videoDuration || 0) }}</div>
                  <div v-if="hasCropChanges"><strong>Crop:</strong> {{ editSettings.crop.width }}×{{ editSettings.crop.height }} at ({{ editSettings.crop.x }}, {{ editSettings.crop.y }})</div>
                  <div v-if="editSettings.deletedFrames.length > 0"><strong>Deleted Frames:</strong> {{ editSettings.deletedFrames.length }} frames removed</div>
                </div>
              </UCard>
            </div>
          </div>

          <!-- Media Details Accordion -->
          <UAccordion v-if="currentMode === 'none'" :items="mediaDetailsItems">
            <template #details>
              <div class="space-y-3 text-left">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ media.type }}</span>
                  </div>
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Purpose</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ media.purpose }}</span>
                  </div>
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ media.status }}</span>
                  </div>
                  <div class="flex flex-col space-y-1">
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Created</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDate(media.created_at) }}</span>
                  </div>
                </div>

                <!-- Video Metadata (only show for videos) -->
                <div v-if="media.type === 'video'" class="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Video Information</h4>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
                    <div v-if="media.width && media.height" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Dimensions</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ media.width }} × {{ media.height }}</span>
                    </div>
                    <div v-if="media.duration" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Duration</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatDuration(media.duration) }}</span>
                    </div>
                    <div v-if="media.file_size" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">File Size</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ formatFileSize(media.file_size) }}</span>
                    </div>
                    <div v-if="media.completions !== undefined" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Completions</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ media.completions }}</span>
                    </div>
                    <div v-if="getVideoFPS(media)" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Frame Rate</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ getVideoFPS(media) }} fps</span>
                    </div>
                    <div v-if="getVideoCodec(media)" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Codec</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ getVideoCodec(media) }}</span>
                    </div>
                    <div v-if="getVideoBitrate(media)" class="flex flex-col space-y-1">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Bitrate</span>
                      <span class="text-sm text-gray-600 dark:text-gray-400">{{ getVideoBitrate(media) }}</span>
                    </div>
                  </div>
                </div>

                <!-- Tags -->
                <div class="flex flex-col space-y-1">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Tags</span>
                  <div v-if="media.tags?.tags && media.tags.tags.length > 0" class="flex flex-wrap gap-2">
                    <span v-for="tag in media.tags.tags" :key="tag" class="px-2 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 text-sm rounded border border-pink-200 dark:border-pink-800">
                      {{ tag }}
                    </span>
                  </div>
                  <div v-else class="text-sm text-gray-500 italic">No tags available</div>
                </div>

                <!-- UUID -->
                <div class="flex flex-col space-y-1">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">UUID</span>
                  <span class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">{{ media.uuid }}</span>
                </div>
              </div>
            </template>
          </UAccordion>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

// Device detection
const { isMobile } = useDevice()

// Props
const props = defineProps({
  media: {
    type: Object,
    default: null
  },
  isOpen: {
    type: Boolean,
    default: false
  },
  currentIndex: {
    type: Number,
    default: -1
  },
  totalCount: {
    type: Number,
    default: 0
  },
  deletingIds: {
    type: Array,
    default: () => []
  },
  hasNext: {
    type: Boolean,
    default: false
  },
  hasPrevious: {
    type: Boolean,
    default: false
  },
  onlyShowUntagged: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['update:isOpen', 'navigate', 'confirmDelete', 'close', 'saveEdits', 'save', 'purposeUpdated', 'mediaDuplicated'])

// Stores
const settingsStore = useSettingsStore()

// Template refs
const modalVideo = ref(null)

// Mode state
const currentMode = ref('none')
const modeOptions = computed(() => [
  { label: 'None', value: 'none' },
  { label: 'Edit', value: 'edit', disabled: props.media?.type !== 'video' },
  { label: 'Tag', value: 'tag' }
])

// Purpose state
const currentPurpose = ref('')
const isSavingPurpose = ref(false)
const purposeOptions = computed(() => [
  { label: 'Dest', value: 'dest' },
  { label: 'Output', value: 'output' },
  { label: 'Voyeur', value: 'voyeur' },
  { label: 'Subject', value: 'subject' },
  { label: 'Porn', value: 'porn' },
  { label: 'Todo', value: 'todo' }
])

// Video editing state
const isSavingEdits = ref(false)
const currentTime = ref(0)
const videoDuration = ref(0)
const videoWidth = ref(0)
const videoHeight = ref(0)
const videoFPS = ref(30)

// Tag editing state
const isSavingTags = ref(false)
const selectedTags = ref([])
const originalTags = ref([])
const totalUntaggedInDatabase = ref(0)

// Rating state
const currentRating = ref(null)

// Duplicate state
const isDuplicating = ref(false)

// Media navigation gesture handling
const {
  handleTouchStart: handleGestureTouchStart,
  handleTouchMove: handleGestureTouchMove,
  handleTouchEnd: handleGestureTouchEnd
} = useGesture({
  minSwipeDistance: 50,
  onSwipeLeft: () => {
    if (props.hasNext) {
      navigateNext()
    }
  },
  onSwipeRight: () => {
    if (props.hasPrevious) {
      navigatePrevious()
    }
  },
  debug: true
})

// Predefined quick tags organized by category
const hairColorTags = ['ginger', 'blonde', 'brunette', 'colored_hair']
const hairStyleTags = ['braid', 'bangs', 'curly']
const ageBodyTags = ['teen', 'milf', 'chub', 'glasses']
const actionTags = ['rough', 'ass', 'bj', 'multi', 'rule34', 'scat']

// Custom crop overlay state
const cropperRef = ref(null)
const isUpdatingFromCropper = ref(false)

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

// Computed properties
const mediaDetailsItems = computed(() => {
  if (!props.media) return []

  return [
    {
      label: 'Media Details',
      slot: 'details'
    }
  ]
})

const hasCropChanges = computed(() => {
  const crop = editSettings.value.crop
  return crop.x !== 0 || crop.y !== 0 || crop.width !== videoWidth.value || crop.height !== videoHeight.value
})

const hasEditOperations = computed(() => {
  return editSettings.value.trimStart || editSettings.value.trimEnd || hasCropChanges.value || editSettings.value.deletedFrames.length > 0
})

// Computed to check if tags have changed
const hasTagChanges = computed(() => {
  if (selectedTags.value.length !== originalTags.value.length) return true
  return !selectedTags.value.every(tag => originalTags.value.includes(tag))
})

// Method to fetch total untagged dest videos count from database
const fetchTotalUntaggedCount = async () => {
  try {
    const params = new URLSearchParams()
    params.append('media_type', 'video')
    params.append('purpose', 'dest')
    params.append('only_untagged', 'true')
    params.append('limit', '1') // We only need the count, not the actual results
    params.append('include_thumbnails', 'false')

    const response = await useApiFetch(`media/search?${params.toString()}`)
    totalUntaggedInDatabase.value = response.total_count || 0
  } catch (error) {
    console.error('Failed to fetch total untagged count:', error)
    totalUntaggedInDatabase.value = 0
  }
}

// Purpose update method
const updatePurpose = async newPurpose => {
  if (!props.media || newPurpose === props.media.purpose) return

  isSavingPurpose.value = true
  const toast = useToast()

  try {
    const response = await useApiFetch(`media/${props.media.uuid}/purpose`, {
      method: 'PUT',
      body: {
        purpose: newPurpose
      }
    })

    if (response.success) {
      toast.add({
        title: 'Purpose Updated',
        description: `Media purpose changed to ${newPurpose}`,
        color: 'success',
        duration: 2000
      })

      // Emit a specific event for purpose updates
      emit('purposeUpdated', { ...props.media, purpose: newPurpose })
    }
  } catch (error) {
    console.error('Failed to update purpose:', error)
    toast.add({
      title: 'Update Failed',
      description: error.data?.message || 'Failed to update purpose. Please try again.',
      color: 'error',
      duration: 3000
    })

    // Revert the dropdown to the original value
    currentPurpose.value = props.media.purpose
  } finally {
    isSavingPurpose.value = false
  }
}

// Methods
const closeModal = async () => {
  if (currentMode.value === 'edit' && hasEditOperations.value) {
    await confirmCancelEdits()
  } else if (currentMode.value === 'tag' && hasTagChanges.value) {
    await confirmCancelTags()
  } else {
    emit('update:isOpen', false)
    emit('close')
    resetMode()
  }
}

const resetMode = () => {
  currentMode.value = 'none'
  exitEditMode()
  resetTagState()
}

const handleImageError = event => {
  console.error('Image failed to load:', event.target.src)
  event.target.style.display = 'none'

  const container = event.target.parentElement
  if (container && !container.querySelector('.image-error-placeholder')) {
    const placeholder = document.createElement('div')
    placeholder.className = 'image-error-placeholder w-full h-full bg-muted flex items-center justify-center'
    placeholder.innerHTML = '<div class="text-center"><svg class="w-8 h-8 text-muted-foreground mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>'
    container.appendChild(placeholder)
  }
}

const formatDate = dateString => {
  return new Date(dateString).toLocaleDateString()
}

const formatDuration = seconds => {
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

const formatFileSize = bytes => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const getVideoFPS = media => {
  if (!media?.fps) return null
  return media.fps
}

const getVideoCodec = media => {
  if (!media?.codec) return null
  return media.codec.toUpperCase()
}

const getVideoBitrate = media => {
  if (!media?.bitrate) return null
  const bitrate = media.bitrate
  if (bitrate >= 1000000) {
    return `${(bitrate / 1000000).toFixed(1)} Mbps`
  } else if (bitrate >= 1000) {
    return `${(bitrate / 1000).toFixed(0)} Kbps`
  } else {
    return `${bitrate} bps`
  }
}

// Duplicate media method
const duplicateMedia = async () => {
  if (!props.media) return

  const { confirm } = useConfirmDialog()

  const result = await confirm({
    title: 'Duplicate Media',
    message: 'Create a copy of this media record and its thumbnail? The copy will have "_copy" appended to the filename.',
    confirmLabel: 'Duplicate',
    cancelLabel: 'Cancel',
    variant: 'primary'
  })

  if (result !== 'confirm') return

  isDuplicating.value = true
  const toast = useToast()

  try {
    const response = await useApiFetch(`media/${props.media.uuid}/duplicate`, {
      method: 'POST'
    })

    if (response.success) {
      toast.add({
        title: 'Media Duplicated',
        description: 'Media and thumbnail have been duplicated successfully.',
        color: 'success',
        duration: 3000
      })

      emit('mediaDuplicated', response.duplicatedMedia)
    }
  } catch (error) {
    console.error('Failed to duplicate media:', error)
    toast.add({
      title: 'Duplication Failed',
      description: error.data?.message || 'Failed to duplicate media. Please try again.',
      color: 'error',
      duration: 3000
    })
  } finally {
    isDuplicating.value = false
  }
}

// Video editing methods
const exitEditMode = () => {
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

const confirmSaveEdits = async () => {
  const { confirm } = useConfirmDialog()

  const result = await confirm({
    title: 'Save Video Edits',
    message: 'Are you sure you want to save these edits? This will permanently modify the video file and cannot be undone.',
    confirmLabel: 'Save Changes',
    cancelLabel: 'Cancel',
    variant: 'primary'
  })

  if (result === 'confirm') {
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

  if (result === 'confirm') {
    exitEditMode()
  }
}

const saveVideoEdits = async () => {
  if (!props.media || !hasEditOperations.value) return

  isSavingEdits.value = true
  const toast = useToast()

  try {
    const operations = {}

    if (editSettings.value.trimStart || editSettings.value.trimEnd) {
      operations.trim = {
        start: editSettings.value.trimStart || 0,
        end: editSettings.value.trimEnd || videoDuration.value
      }
    }

    if (hasCropChanges.value) {
      operations.crop = editSettings.value.crop
    }

    if (editSettings.value.deletedFrames.length > 0) {
      operations.deletedFrames = editSettings.value.deletedFrames
    }

    const response = await useApiFetch(`media/${props.media.uuid}/edit`, {
      method: 'POST',
      body: {
        operations
      }
    })

    if (response.success) {
      toast.add({
        title: 'Video Saved',
        description: 'Your video edits have been saved successfully.',
        color: 'green',
        timeout: 3000
      })

      emit('saveEdits', response.updatedMedia)
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

const onVideoLoaded = event => {
  const video = event.target
  videoDuration.value = video.duration
  videoWidth.value = video.videoWidth
  videoHeight.value = video.videoHeight

  if (currentMode.value === 'edit') {
    editSettings.value.crop = {
      x: 0,
      y: 0,
      width: video.videoWidth,
      height: video.videoHeight
    }
  }
}

const onTimeUpdate = event => {
  currentTime.value = event.target.currentTime
}

const formatTime = seconds => {
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

const deleteCurrentFrame = () => {
  const frameTime = currentTime.value
  const frameNumber = Math.floor(frameTime * (videoFPS.value || 30))

  const existingFrame = editSettings.value.deletedFrames.find(f => Math.abs(f.time - frameTime) < 0.1)

  if (!existingFrame) {
    editSettings.value.deletedFrames.push({
      time: frameTime,
      frame: frameNumber
    })

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
  const toast = useToast()
  toast.add({
    title: 'Feature Coming Soon',
    description: 'Frame range deletion will be implemented in a future update',
    color: 'blue',
    timeout: 3000
  })
}

const restoreFrame = index => {
  editSettings.value.deletedFrames.splice(index, 1)

  const toast = useToast()
  toast.add({
    title: 'Frame Restored',
    description: 'Frame has been restored',
    color: 'green',
    timeout: 2000
  })
}

// Cropper methods
const onCropperChange = ({ coordinates, image }) => {
  if (!coordinates || !image || !image.width || !image.height) return

  isUpdatingFromCropper.value = true

  const scaleX = videoWidth.value / image.width
  const scaleY = videoHeight.value / image.height

  editSettings.value.crop = {
    x: Math.round(coordinates.left * scaleX),
    y: Math.round(coordinates.top * scaleY),
    width: Math.round(coordinates.width * scaleX),
    height: Math.round(coordinates.height * scaleY)
  }

  // Reset flag after a tick to allow watcher to skip
  nextTick(() => {
    isUpdatingFromCropper.value = false
  })
}

// Watcher for manual input changes to update cropper
watch(
  () => editSettings.value.crop,
  newCrop => {
    if (isUpdatingFromCropper.value) return
    if (!cropperRef.value) return

    // We need the image dimensions to scale back.
    // We can get them from the cropper instance if it's loaded.
    const result = cropperRef.value.getResult()
    if (!result || !result.image) return

    const image = result.image
    const scaleX = image.width / videoWidth.value
    const scaleY = image.height / videoHeight.value

    cropperRef.value.setCoordinates({
      left: newCrop.x * scaleX,
      top: newCrop.y * scaleY,
      width: newCrop.width * scaleX,
      height: newCrop.height * scaleY
    })
  },
  { deep: true }
)

// Tag editing methods
const formatTagDisplay = tag => {
  // Convert underscores to spaces and capitalize
  return tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const toggleTag = tag => {
  const index = selectedTags.value.indexOf(tag)
  if (index > -1) {
    selectedTags.value.splice(index, 1)
  } else {
    selectedTags.value.push(tag)
  }
}

const clearAllTags = () => {
  selectedTags.value = []
}

const navigatePrevious = async () => {
  if (hasTagChanges.value) {
    try {
      await saveTags(false) // Don't show toast for auto-save on navigation
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // Don't navigate if save failed
      return
    }
  }
  emit('navigate', -1)
}

const navigateNext = async () => {
  if (hasTagChanges.value) {
    try {
      await saveTags(false) // Don't show toast for auto-save on navigation
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // Don't navigate if save failed
      return
    }
  }
  emit('navigate', 1)
}

const saveTags = async (showToast = true) => {
  if (!props.media) return

  // Only save if there are changes
  if (!hasTagChanges.value) return

  isSavingTags.value = true

  try {
    await emit('save', {
      uuid: props.media.uuid,
      tags: selectedTags.value
    })

    // Update original tags after successful save
    originalTags.value = [...selectedTags.value]

    // Refresh the total untagged count since we just tagged something
    if (currentMode.value === 'tag') {
      fetchTotalUntaggedCount()
    }

    if (showToast) {
      const toast = useToast()
      toast.add({
        title: 'Tags Saved',
        description: `Tags updated for ${selectedTags.value.length} tag${selectedTags.value.length !== 1 ? 's' : ''}`,
        color: 'success',
        duration: 2000
      })
    }
  } catch (error) {
    console.error('Failed to save tags:', error)
    const toast = useToast()
    toast.add({
      title: 'Save Failed',
      description: 'Failed to save tags. Please try again.',
      color: 'error',
      duration: 3000
    })
    throw error // Re-throw to prevent navigation on error
  } finally {
    isSavingTags.value = false
  }
}

const saveAndClose = async () => {
  try {
    await saveTags(true) // Show toast for manual save
    emit('update:isOpen', false)
    emit('close')
    resetMode()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // Error handling is already done in saveTags method
    // Don't close modal if save failed
  }
}

const confirmCancelTags = async () => {
  if (!hasTagChanges.value) {
    resetTagState()
    return
  }

  const { confirm } = useConfirmDialog()

  const result = await confirm({
    title: 'Cancel Tag Changes',
    message: 'Are you sure you want to cancel? All unsaved tag changes will be lost.',
    confirmLabel: 'Discard Changes',
    cancelLabel: 'Keep Editing',
    variant: 'error'
  })

  if (result === 'confirm') {
    resetTagState()
  }
}

const resetTagState = () => {
  selectedTags.value = []
  originalTags.value = []
}

// Rating update handler
const handleRatingUpdate = rating => {
  currentRating.value = rating
}

// Watch for media changes to update tags and purpose
watch(
  () => props.media,
  newMedia => {
    if (newMedia) {
      const tags = newMedia.tags?.tags || []
      selectedTags.value = [...tags]
      originalTags.value = [...tags]

      currentPurpose.value = newMedia.purpose || ''
      currentRating.value = newMedia.rating || null

      if (newMedia.type === 'video') {
        nextTick(() => {
          const videoElements = document.querySelectorAll('video[controls], video[autoplay]')
          videoElements.forEach(video => {
            video.play().catch(() => {})
          })
        })
      }
    } else {
      resetTagState()
      currentPurpose.value = ''
      currentRating.value = null
    }
  },
  { immediate: true }
)

// Watch for modal open to set default mode based on untagged filter
watch(
  () => props.isOpen,
  isOpen => {
    if (isOpen && props.onlyShowUntagged) {
      // Auto-switch to tag mode when opening modal with untagged filter active
      currentMode.value = 'tag'
    } else if (!isOpen) {
      const modalVideoEl = document.querySelector('.max-w-full video[controls]')
      if (modalVideoEl) {
        modalVideoEl.pause()
        modalVideoEl.currentTime = 0
      }
      resetMode()
    }
  }
)

// Watch for mode changes
watch(currentMode, (newMode, oldMode) => {
  if (oldMode === 'edit') {
    exitEditMode()
  }
  if (oldMode === 'tag') {
    resetTagState()
  }

  // Fetch total untagged dest videos count when entering tag mode
  if (newMode === 'tag') {
    fetchTotalUntaggedCount()
  }
})

// Initialize settings on mount
onMounted(async () => {
  await settingsStore.initializeSettings()
})
</script>

<style scoped></style>
