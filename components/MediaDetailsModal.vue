
<template>
  <!-- Media Detail Modal -->
  <UModal :open="isOpen" @update:open="$emit('update:isOpen', $event)" fullscreen>
    <template #body>
      <div v-if="media" class="p-3 sm:p-6">
        <!-- Header -->
        <div class="flex justify-between items-center mb-3 sm:mb-6">
          <h3 class="text-base sm:text-lg font-semibold truncate pr-2">
            {{ currentMode === 'tag' ? 'Rapid Tag Editor' : 'Media Details' }}
          </h3>
          <div class="flex items-center gap-1 sm:gap-2 shrink-0">
            <span v-if="currentIndex !== undefined && totalCount !== undefined" class="text-xs sm:text-sm text-gray-500 hidden sm:inline">
              {{ currentIndex + 1 }} / {{ totalCount }}
            </span>
            
            <!-- Mode Selector -->
            <USelect
              v-model="currentMode"
              :items="modeOptions"
              size="xs"
              class="w-20"
              :disabled="isSavingEdits || isSavingTags"
            />
            
            <!-- Save/Cancel buttons for edit mode -->
            <UButton
              v-if="currentMode === 'edit'"
              variant="solid"
              color="green"
              size="xs"
              :loading="isSavingEdits"
              @click="confirmSaveEdits"
            >
              Save
            </UButton>
            <UButton
              v-if="currentMode === 'edit'"
              variant="outline"
              size="xs"
              @click="confirmCancelEdits"
            >
              Cancel
            </UButton>
            
            <!-- Save button for tag mode -->
            <UButton
              v-if="currentMode === 'tag'"
              color="primary"
              size="xs"
              :loading="isSavingTags"
              @click="saveTags"
            >
              Save
            </UButton>
            
            <!-- Delete button (only in none mode) -->
            <UButton
              v-if="currentMode === 'none'"
              variant="solid"
              icon="i-heroicons-trash"
              color="error"
              size="xs"
              :loading="deletingIds.includes(media.uuid)"
              @click="$emit('confirmDelete', media)"
            />
            
            <UButton
              variant="ghost"
              icon="i-heroicons-x-mark"
              size="xs"
              @click="closeModal"
            />
          </div>
        </div>

        <!-- Tag Mode Layout -->
        <div v-if="currentMode === 'tag'" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Media Display -->
          <div class="space-y-4">
            <div class="flex justify-center">
              <div class="max-w-md w-full">
                <img
                  v-if="media.type === 'image'"
                  :key="media.uuid"
                  :src="media.thumbnail || `/api/media/${media.uuid}/image?size=md`"
                  :alt="media.filename"
                  class="w-full h-auto max-h-96 object-contain rounded-lg shadow-md"
                  @error="handleImageError"
                >
                <div v-else-if="media.type === 'video'" class="relative" :key="media.uuid">
                  <video
                    v-if="media.thumbnail_uuid"
                    :key="`video-${media.uuid}`"
                    :poster="media.thumbnail || `/api/media/${media.thumbnail_uuid}/image?size=md`"
                    class="w-full h-auto max-h-96 object-contain rounded-lg shadow-md"
                    controls
                    preload="metadata"
                  >
                    <source :src="`/api/stream/${media.uuid}`" type="video/mp4">
                    Your browser does not support the video tag.
                  </video>
                  <div v-else class="w-full h-64 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
                    <UIcon name="i-heroicons-play-circle" class="text-6xl text-neutral-400" />
                  </div>
                </div>
              </div>
            </div>


            <!-- Navigation Buttons -->
            <div class="flex justify-between items-center">
              <UButton
                :disabled="!hasPrevious"
                variant="outline"
                icon="i-heroicons-chevron-left"
                @click="navigatePrevious"
              >
                Previous
              </UButton>
              

              <UButton
                :disabled="!hasNext"
                variant="outline"
                trailing-icon="i-heroicons-chevron-right"
                @click="navigateNext"
              >
                Next
              </UButton>
            </div>
          </div>

          <!-- Tag Selection Panel -->
          <div class="space-y-6">
            <!-- Quick Tags -->
            <div>
              <h5 class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">Quick Tags</h5>
              <div class="space-y-2">
                <!-- Hair Color Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="tag in hairColorTags"
                    :key="tag"
                    variant="solid"
                    :color="selectedTags.includes(tag) ? 'primary' : 'neutral'"
                    size="sm"
                    @click="toggleTag(tag)"
                  >
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>
                
                <!-- Hair Style Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="tag in hairStyleTags"
                    :key="tag"
                    variant="solid"
                    :color="selectedTags.includes(tag) ? 'primary' : 'neutral'"
                    size="sm"
                    @click="toggleTag(tag)"
                  >
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>
                
                <!-- Age/Body Type Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="tag in ageBodyTags"
                    :key="tag"
                    variant="solid"
                    :color="selectedTags.includes(tag) ? 'primary' : 'neutral'"
                    size="sm"
                    @click="toggleTag(tag)"
                  >
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>
                
                <!-- Action/Other Row -->
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="tag in actionTags"
                    :key="tag"
                    variant="solid"
                    :color="selectedTags.includes(tag) ? 'primary' : 'neutral'"
                    size="sm"
                    @click="toggleTag(tag)"
                  >
                    {{ formatTagDisplay(tag) }}
                  </UButton>
                </div>
              </div>
            </div>

            <!-- Current Tags Display -->
            <div>
              <h5 class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">Current Tags</h5>
              <UInputTags
                v-model="selectedTags"
                :ui="{ trailing: 'pe-1' }"
              >
                <template #trailing>
                  <UButton
                    v-if="selectedTags.length > 0"
                    variant="ghost"
                    size="xs"
                    icon="i-heroicons-x-mark"
                    @click="clearAllTags"
                  />
                </template>
              </UInputTags>
            </div>
          </div>
        </div>

        <!-- Normal/Edit Mode Layout -->
        <div v-else class="space-y-4">
          <!-- Image Display -->
          <div v-if="media.type === 'image'" class="max-w-full relative">
            <!-- Previous Button -->
            <UButton
              v-if="currentIndex > 0"
              variant="solid"
              color="white"
              icon="i-heroicons-chevron-left"
              class="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg"
              @click="$emit('navigate', -1)"
            />
            
            <img
              v-if="settingsStore.displayImages"
              :src="media.thumbnail ? media.thumbnail : `/api/media/${media.uuid}/image?size=lg`"
              :alt="media.type"
              class="w-full h-auto max-h-[80vh] object-contain rounded"
              @error="handleImageError"
            >
            <div v-else class="w-full h-64 flex items-center justify-center">
              <ImagePlaceholder />
            </div>
            
            <!-- Next Button -->
            <UButton
              v-if="currentIndex < totalCount - 1"
              variant="solid"
              color="white"
              icon="i-heroicons-chevron-right"
              class="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 shadow-lg"
              @click="$emit('navigate', 1)"
            />
          </div>

          <!-- Video Display (only show when displayImages is true) -->
          <div v-else-if="media.type === 'video' && settingsStore.displayImages" class="max-w-full">
            <div class="relative">
              <video
                :ref="modalVideo"
                :poster="media.thumbnail ? media.thumbnail : (media.thumbnail_uuid ? `/api/media/${media.thumbnail_uuid}/image?size=sm` : undefined)"
                controls
                muted
                loop
                class="w-full h-auto max-h-[80vh] rounded"
                preload="metadata"
                playsinline
                webkit-playsinline
                :data-video-id="media.uuid"
                disablePictureInPicture
                crossorigin="anonymous"
                @loadedmetadata="onVideoLoaded"
                @timeupdate="onTimeUpdate"
              >
                <source :src="`/api/stream/${media.uuid}`" type="video/mp4">
                Your browser does not support the video tag.
              </video>
              
              <!-- Custom Crop overlay (only visible in edit mode) -->
              <div
                v-if="currentMode === 'edit' && showCropOverlay"
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
          <div v-else-if="media.type === 'video'" class="w-full h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded">
            <div class="text-center">
              <UIcon name="i-heroicons-play-circle" class="text-6xl text-gray-400 mb-2" />
              <p class="text-gray-500">Video Hidden</p>
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
                    <span
                      v-for="tag in media.tags.tags"
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
const emit = defineEmits([
  'update:isOpen',
  'navigate',
  'confirmDelete',
  'close',
  'saveEdits',
  'save'
])

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

// Video editing state
const isSavingEdits = ref(false)
const showCropOverlay = ref(false)
const currentTime = ref(0)
const videoDuration = ref(0)
const videoWidth = ref(0)
const videoHeight = ref(0)
const videoFPS = ref(30)

// Tag editing state
const isSavingTags = ref(false)
const selectedTags = ref([])
const originalTags = ref([])

// Predefined quick tags organized by category
const hairColorTags = ['ginger', 'blonde', 'brunette', 'colored_hair']
const hairStyleTags = ['braid', 'bangs', 'curly']
const ageBodyTags = ['teen', 'milf', 'chub']
const actionTags = ['rough', 'ass', 'bj', 'multi', 'rule34']

// Custom crop overlay state
const isDragging = ref(false)
const isResizing = ref(false)
const resizeHandle = ref('')
const dragStart = ref({ x: 0, y: 0 })
const cropStart = ref({ x: 0, y: 0, width: 0, height: 0 })

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
  
  return [{
    label: 'Media Details',
    slot: 'details'
  }]
})

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

// Computed to check if tags have changed
const hasTagChanges = computed(() => {
  if (selectedTags.value.length !== originalTags.value.length) return true
  return !selectedTags.value.every(tag => originalTags.value.includes(tag))
})

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

const handleImageError = (event) => {
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

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
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
  const bitrate = media.bitrate
  if (bitrate >= 1000000) {
    return `${(bitrate / 1000000).toFixed(1)} Mbps`
  } else if (bitrate >= 1000) {
    return `${(bitrate / 1000).toFixed(0)} Kbps`
  } else {
    return `${bitrate} bps`
  }
}

// Video editing methods
const exitEditMode = () => {
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
  if (!props.media || !hasEditOperations.value) return
  
  isSavingEdits.value = true
  const toast = useToast()
  
  try {
    const response = await useApiFetch(`media/${props.media.uuid}/edit`, {
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

const onVideoLoaded = (event) => {
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
  
  const existingFrame = editSettings.value.deletedFrames.find(f =>
    Math.abs(f.time - frameTime) < 0.1
  )
  
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

// Tag editing methods
const formatTagDisplay = (tag) => {
  // Convert underscores to spaces and capitalize
  return tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const toggleTag = (tag) => {
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
  
  if (result) {
    resetTagState()
  }
}

const resetTagState = () => {
  selectedTags.value = []
  originalTags.value = []
}

// Watch for media changes to update tags
watch(() => props.media, (newMedia) => {
  if (newMedia) {
    // Extract tags from the media object
    const tags = newMedia.tags?.tags || []
    selectedTags.value = [...tags]
    originalTags.value = [...tags]
  } else {
    resetTagState()
  }
}, { immediate: true })

// Watch for modal open to set default mode based on untagged filter
watch(() => props.isOpen, (isOpen) => {
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
})

// Watch for mode changes
watch(currentMode, (newMode, oldMode) => {
  if (oldMode === 'edit') {
    exitEditMode()
  }
  if (oldMode === 'tag') {
    resetTagState()
  }
})

// Initialize settings on mount
onMounted(async () => {
  await settingsStore.initializeSettings()
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