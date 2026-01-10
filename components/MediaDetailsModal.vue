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

          <!-- Save button for crop/trim modes -->
          <UButton v-if="currentMode === 'crop' || currentMode === 'trim'" variant="solid" color="success" :size="isMobile ? 'md' : 'xs'" :loading="isSavingEdits" @click="saveVideoEdits"> Save </UButton>

          <!-- Duplicate button (only in none mode) -->
          <UButton v-if="currentMode === 'none'" variant="solid" icon="i-heroicons-document-duplicate" color="primary" :size="isMobile ? 'lg' : 'xs'" :class="isMobile ? 'min-w-[44px] min-h-[44px] flex items-center justify-center' : ''" :loading="isDuplicating" @click="duplicateMedia" square />

          <!-- Delete button (only in none mode) -->
          <UButton v-if="currentMode === 'none'" variant="solid" icon="i-heroicons-trash" color="error" :size="isMobile ? 'lg' : 'xs'" :class="isMobile ? 'min-w-[44px] min-h-[44px] flex items-center justify-center' : ''" :loading="deletingIds.includes(media.uuid)" @click="$emit('confirmDelete', media)" square />

          <UButton variant="ghost" icon="i-heroicons-x-mark" :size="isMobile ? 'xl' : 'xs'" :class="isMobile ? 'min-w-[44px] min-h-[44px]' : ''" @click="closeModal" />
        </div>
      </div>
    </template>

    <template #body>
      <div v-if="media" class="flex flex-col h-full">
        <!-- Mode Tabs -->
        <UTabs v-model="currentMode" :items="modeTabItems" class="border-b border-gray-200 dark:border-gray-700" />

        <div :class="currentMode === 'tag' ? '' : 'p-3 sm:p-6'" class="flex-1 overflow-auto" @touchstart="handleGestureTouchStartWrapper" @touchmove="handleGestureTouchMoveWrapper" @touchend="handleGestureTouchEndWrapper">
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
              <!-- Previous Button (only in none mode) -->
              <UButton v-if="currentMode === 'none' && currentIndex > 0" variant="solid" color="white" icon="i-heroicons-chevron-left" class="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg" @click="$emit('navigate', -1)" />

              <img v-if="settingsStore.displayImages" :src="media.thumbnail ? media.thumbnail : `/api/media/${media.uuid}/image?size=lg`" :alt="media.type" class="w-full object-contain rounded" @error="handleImageError" @load="onImageLoaded" />
              <div v-else class="w-full bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center min-h-96">
                <div class="text-center">
                  <UIcon name="i-heroicons-photo" class="text-6xl text-gray-400 mb-2" />
                </div>
              </div>

              <!-- Next Button (only in none mode) -->
              <UButton v-if="currentMode === 'none' && currentIndex < totalCount - 1" variant="solid" color="white" icon="i-heroicons-chevron-right" class="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg" @click="$emit('navigate', 1)" />

              <!-- Cropper overlay for images (only visible in crop mode) -->
              <div v-if="currentMode === 'crop'" class="absolute inset-0 z-20">
                <Cropper v-if="cropFrameSource" ref="cropperRef" class="w-full h-full" :src="cropFrameSource" @change="onCropperChange" />
              </div>
            </div>

            <!-- Video Display -->
            <div v-else-if="media.type === 'video'" :key="`video-display-${media.uuid}-${media._cacheBuster || 0}`" class="w-full relative">
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

              <!-- ThumbButtons with Close (bottom), Rating (middle), Delete (top) in view mode -->
              <ThumbButtons v-if="currentMode === 'none'" :slot1="closeButtonConfig" :slot5="deleteButtonConfig" @thumb-click-slot-1="closeModal" @thumb-click-slot-5="$emit('confirmDelete', media)">
                <template #slot3>
                  <StarRating :media-uuid="media.uuid" :rating="currentRating" @updated="handleRatingUpdate" />
                </template>
              </ThumbButtons>

              <!-- Cropper overlay (only visible in crop mode) -->
              <div v-if="currentMode === 'crop'" class="absolute inset-0 z-20">
                <!-- Hidden video for frame preview -->
                <video ref="cropPreviewVideo" :src="`/api/stream/${media.uuid}`" class="absolute inset-0 w-full h-full object-contain opacity-0 pointer-events-none" preload="auto" muted @seeked="onCropVideoSeeked" />
                <Cropper v-if="cropFrameSource" ref="cropperRef" class="w-full h-full" :src="cropFrameSource" @change="onCropperChange" />
              </div>
            </div>

            <!-- Video/Image Editing Controls (only visible in trim mode, crop mode controls are in footer) -->
            <div v-if="currentMode === 'trim'" class="space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6">
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Frame Management -->
                <UCard v-if="false">
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
      </div>
    </template>

    <template #footer>
      <!-- Frame scrubber slider (only in crop mode) -->
      <div v-if="currentMode === 'crop' && media && media.type === 'video'" class="w-full bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div class="w-full px-4 py-3 space-y-2">
          <div class="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
            <span>Frame Preview</span>
            <span>{{ formatTime(cropPreviewTime) }} / {{ formatTime(videoDuration) }}</span>
          </div>
          <USlider v-model="cropPreviewTime" :min="0" :max="videoDuration || 1" :step="0.1" class="w-full" @update:model-value="updateCropPreviewFrame" />
        </div>
      </div>

      <!-- Trim ranges (only in trim mode) -->
      <div v-if="currentMode === 'trim' && media && media.type === 'video'" class="w-full bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div class="w-full px-4 py-3 space-y-2">
          <!-- Header with Add Range button -->
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Trim Ranges (Keep)</span>
            <UButton icon="i-heroicons-plus" size="sm" @click="addTrimRange">Add Range</UButton>
          </div>

          <!-- Single multi-handle slider -->
          <div v-if="trimHandles.length > 0" class="space-y-1">
            <div class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span v-for="(handle, index) in trimHandles" :key="index" :class="index % 2 === 0 ? 'font-semibold' : ''"> {{ formatTime(handle) }}{{ index < trimHandles.length - 1 ? ' -' : '' }} </span>
            </div>
            <USlider v-model="trimHandles" :min="0" :max="videoDuration || 1" :step="0.1" class="w-full" />
          </div>

          <div v-else class="text-sm text-gray-500 dark:text-gray-400 text-center py-2">No trim ranges defined. Click "Add Range" to create one.</div>
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
const cropPreviewVideo = ref(null)

// Mode state
const currentMode = ref('none')
const modeTabItems = computed(() => [
  { label: 'View', value: 'none' },
  { label: 'Crop', value: 'crop' },
  { label: 'Trim', value: 'trim', disabled: props.media?.type !== 'video' },
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

// Button configurations for ThumbButtons in view mode
const deleteButtonConfig = computed(() => ({
  icon: 'i-heroicons-trash',
  color: 'error',
  title: 'Delete Video'
}))

const closeButtonConfig = computed(() => ({
  icon: 'i-heroicons-x-mark',
  title: 'Close'
}))

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

// Wrapper gesture handlers that disable swipes in crop/trim modes
const handleGestureTouchStartWrapper = e => {
  if (currentMode.value === 'crop' || currentMode.value === 'trim') return
  handleGestureTouchStart(e)
}
const handleGestureTouchMoveWrapper = e => {
  if (currentMode.value === 'crop' || currentMode.value === 'trim') return
  handleGestureTouchMove(e)
}
const handleGestureTouchEndWrapper = e => {
  if (currentMode.value === 'crop' || currentMode.value === 'trim') return
  handleGestureTouchEnd(e)
}

// Predefined quick tags organized by category
const hairColorTags = ['ginger', 'blonde', 'brunette', 'colored_hair']
const hairStyleTags = ['braid', 'bangs', 'curly']
const ageBodyTags = ['teen', 'milf', 'chub', 'glasses']
const actionTags = ['rough', 'ass', 'bj', 'multi', 'rule34', 'scat']

// Cropper state
const cropperRef = ref(null)
const isUpdatingFromCropper = ref(false)
const cropPreviewTime = ref(0)
const cropFrameSource = ref('')
const savedCropCoordinates = ref(null)
const isInitialCropSetup = ref(false)
let cropCanvas = null
let isSeekingFrame = false
let pendingSeekTime = null

// Trim state - flat array of handle values [start1, end1, start2, end2, ...]
const trimHandles = ref([])

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
const closeModal = () => {
  emit('update:isOpen', false)
  emit('close')
  resetMode()
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

// Saving edits now occurs immediately without a confirmation dialog; call saveVideoEdits() directly from the Save button.

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

  if (currentMode.value === 'crop') {
    editSettings.value.crop = {
      x: 0,
      y: 0,
      width: video.videoWidth,
      height: video.videoHeight
    }
  }
}

const onImageLoaded = event => {
  const img = event.target
  videoWidth.value = img.naturalWidth
  videoHeight.value = img.naturalHeight

  if (currentMode.value === 'crop') {
    editSettings.value.crop = {
      x: 0,
      y: 0,
      width: img.naturalWidth,
      height: img.naturalHeight
    }

    // Initialize crop frame source and set initial coordinates
    isInitialCropSetup.value = false
    savedCropCoordinates.value = null
    cropFrameSource.value = img.src

    nextTick(() => {
      if (cropperRef.value) {
        const result = cropperRef.value.getResult()
        if (result && result.image) {
          const coords = {
            left: 0,
            top: 0,
            width: result.image.width,
            height: result.image.height
          }
          cropperRef.value.setCoordinates(coords)
          savedCropCoordinates.value = coords
          isInitialCropSetup.value = true
        }
      }
    })
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

// Trim range methods
const addTrimRange = () => {
  const duration = videoDuration.value || 100
  const quarterDuration = duration / 4
  // Add a new handle pair (start and end) to the flat array
  // Place it in the middle quarter by default
  trimHandles.value.push(quarterDuration, quarterDuration * 3)
}

// Cropper methods
const onCropperChange = ({ coordinates }) => {
  if (!coordinates || !videoWidth.value || !videoHeight.value) return

  // Don't save if we're currently seeking a frame (prevents overwriting saved coords during frame changes)
  if (isSeekingFrame) return

  isUpdatingFromCropper.value = true

  const result = cropperRef.value?.getResult()
  if (!result || !result.image) {
    isUpdatingFromCropper.value = false
    return
  }

  const img = result.image

  // Save display coordinates for restoration
  savedCropCoordinates.value = { ...coordinates }

  // Convert from display coordinates to video coordinates
  const scaleX = videoWidth.value / img.width
  const scaleY = videoHeight.value / img.height

  editSettings.value.crop = {
    x: Math.round(coordinates.left * scaleX),
    y: Math.round(coordinates.top * scaleY),
    width: Math.round(coordinates.width * scaleX),
    height: Math.round(coordinates.height * scaleY)
  }

  nextTick(() => {
    isUpdatingFromCropper.value = false
  })
}

const updateCropPreviewFrame = time => {
  if (!cropPreviewVideo.value) return

  // If already seeking, queue this request
  if (isSeekingFrame) {
    pendingSeekTime = time
    return
  }

  isSeekingFrame = true
  cropPreviewVideo.value.currentTime = time
}

// Handle the seeked event to capture frame
const onCropVideoSeeked = () => {
  if (!cropPreviewVideo.value) return

  try {
    // Create canvas once and reuse it
    if (!cropCanvas) {
      cropCanvas = document.createElement('canvas')
    }

    cropCanvas.width = cropPreviewVideo.value.videoWidth
    cropCanvas.height = cropPreviewVideo.value.videoHeight
    const ctx = cropCanvas.getContext('2d')

    if (ctx) {
      ctx.drawImage(cropPreviewVideo.value, 0, 0, cropCanvas.width, cropCanvas.height)
      // Only update the source once the new frame is ready - this prevents black flashing
      const newFrame = cropCanvas.toDataURL('image/jpeg', 0.85)
      if (newFrame) {
        cropFrameSource.value = newFrame

        // Restore crop coordinates after frame updates, or set initial full-size crop
        nextTick(() => {
          if (cropperRef.value) {
            if (savedCropCoordinates.value) {
              // Restore previously saved coordinates
              cropperRef.value.setCoordinates(savedCropCoordinates.value)
            } else if (!isInitialCropSetup.value) {
              // Set initial crop to cover the whole image
              const result = cropperRef.value.getResult()
              if (result && result.image) {
                const coords = {
                  left: 0,
                  top: 0,
                  width: result.image.width,
                  height: result.image.height
                }
                cropperRef.value.setCoordinates(coords)
                savedCropCoordinates.value = coords
                isInitialCropSetup.value = true
              }
            }
          }

          // Mark seeking as complete after coordinates are restored
          isSeekingFrame = false

          // If there's a pending seek, process it now
          if (pendingSeekTime !== null) {
            const nextTime = pendingSeekTime
            pendingSeekTime = null
            updateCropPreviewFrame(nextTime)
          }
        })
      }
    }
  } catch (error) {
    console.error('Error capturing crop preview frame:', error)
    isSeekingFrame = false
  }
}

// Watcher for manual input changes to update cropper
watch(
  () => editSettings.value.crop,
  newCrop => {
    // Skip if the cropper just updated us or we don't have the cropper ready
    if (isUpdatingFromCropper.value) return
    if (!cropperRef.value) return
    if (!videoWidth.value || !videoHeight.value) return

    const result = cropperRef.value.getResult()
    if (!result || !result.image) return

    const img = result.image

    // Compute scaling factors from video (model) space -> image (display) space
    const scaleX = img.width / videoWidth.value
    const scaleY = img.height / videoHeight.value

    // Convert, using floats and clamp to visible bounds to avoid instability
    const left = Math.max(0, Math.min(img.width - 1, newCrop.x * scaleX))
    const top = Math.max(0, Math.min(img.height - 1, newCrop.y * scaleY))
    const width = Math.max(1, newCrop.width * scaleX)
    const height = Math.max(1, newCrop.height * scaleY)

    cropperRef.value.setCoordinates({
      left,
      top,
      width,
      height
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
  if (oldMode === 'crop' || oldMode === 'trim') {
    exitEditMode()
  }
  if (oldMode === 'tag') {
    resetTagState()
  }

  // Fetch total untagged dest videos count when entering tag mode
  if (newMode === 'tag') {
    fetchTotalUntaggedCount()
  }

  // Initialize crop preview when entering crop mode
  if (newMode === 'crop') {
    isInitialCropSetup.value = false
    savedCropCoordinates.value = null
    cropFrameSource.value = ''

    if (props.media?.type === 'video') {
      // Video crop initialization
      nextTick(() => {
        cropPreviewTime.value = 0
        // Initialize the first frame once video is loaded
        if (cropPreviewVideo.value) {
          cropPreviewVideo.value.addEventListener(
            'loadedmetadata',
            () => {
              updateCropPreviewFrame(0)
            },
            { once: true }
          )
        }
      })
    } else if (props.media?.type === 'image') {
      // Image crop initialization - use full-size image, not thumbnail
      nextTick(() => {
        const imgSrc = `/api/media/${props.media.uuid}/image?size=lg`

        // Load image to get dimensions
        const img = new Image()
        img.onload = () => {
          videoWidth.value = img.naturalWidth
          videoHeight.value = img.naturalHeight
          editSettings.value.crop = {
            x: 0,
            y: 0,
            width: img.naturalWidth,
            height: img.naturalHeight
          }

          // Set cropFrameSource after loading to ensure correct aspect ratio
          cropFrameSource.value = imgSrc

          // Set initial crop coordinates after image loads
          nextTick(() => {
            if (cropperRef.value) {
              const result = cropperRef.value.getResult()
              if (result && result.image) {
                const coords = {
                  left: 0,
                  top: 0,
                  width: result.image.width,
                  height: result.image.height
                }
                cropperRef.value.setCoordinates(coords)
                savedCropCoordinates.value = coords
                isInitialCropSetup.value = true
              }
            }
          })
        }
        img.src = imgSrc
      })
    }
  }

  // Reset crop state when exiting crop mode
  if (oldMode === 'crop') {
    cropFrameSource.value = ''
  }

  // Initialize trim handles when entering trim mode
  if (newMode === 'trim') {
    trimHandles.value = []
  }
})

// Initialize settings on mount
onMounted(async () => {
  await settingsStore.initializeSettings()
})
</script>

<style scoped></style>
