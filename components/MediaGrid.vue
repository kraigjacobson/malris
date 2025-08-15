<template>
  <div>
    <!-- Loading State -->
    <div v-if="loading && mediaResults.length === 0">
      <!-- Skeleton Grid -->
      <div class="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
        <USkeleton
          v-for="i in 24"
          :key="`skeleton-${i}`"
          class="aspect-[3/4] w-full"
        />
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="mediaResults.length > 0">
      <!-- Grid View -->
      <div class="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
        <div
          v-for="media in mediaResults"
          :key="media.uuid"
          class="bg-neutral-800 overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer relative"
          :class="{ 'ring-2 ring-blue-500': multiSelect && isSelected(media) }"
          @click="handleMediaClick(media)"
        >
          <!-- Selection Indicator for Multi-Select -->
          <div
            v-if="multiSelect"
            class="absolute top-2 left-2 z-10"
          >
            <div
              class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
              :class="isSelected(media)
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'bg-white/80 border-gray-300 text-gray-600'"
            >
              <UIcon
                v-if="isSelected(media)"
                name="i-heroicons-check"
                class="w-4 h-4"
              />
            </div>
          </div>
          <!-- Image Preview (only show when displayImages is true) -->
          <div
            v-if="media.type === 'image' && settingsStore.displayImages"
            class="aspect-[3/4] relative"
          >
            <!-- Image Skeleton -->
            <USkeleton
              v-if="!imageLoadStates[media.uuid]"
              class="absolute inset-0 w-full h-full"
            />
            
            <!-- Actual Image -->
            <img
              :src="getImageUrl(media, 'md')"
              :alt="media.filename"
              class="w-full h-full object-cover object-top transition-opacity duration-300"
              :class="{ 'opacity-0': !imageLoadStates[media.uuid] }"
              loading="lazy"
              @load="handleImageLoad(media.uuid)"
              @error="handleImageError"
            />
          </div>
          
          <!-- Video Preview (only show when displayImages is true) -->
          <div
            v-else-if="media.type === 'video' && settingsStore.displayImages"
            class="aspect-[3/4] relative group"
            :data-video-uuid="media.uuid"
            :class="{ 'opacity-50': updatedVideoStatuses.has(media.uuid) }"
            @mouseenter="handleVideoHover(media.uuid, true)"
            @mouseleave="handleVideoHover(media.uuid, false)"
          >
            <!-- Video Skeleton (shows while poster is loading) -->
            <USkeleton
              v-if="!videoLoadStates[media.uuid] && getVideoPosterUrl(media)"
              class="absolute inset-0 w-full h-full z-10"
            />
            
            <!-- Hidden image to detect poster load -->
            <img
              v-if="getVideoPosterUrl(media)"
              :src="getVideoPosterUrl(media)"
              class="hidden"
              @load="handleVideoLoad(media.uuid)"
              @error="handleVideoLoad(media.uuid)"
            />
            
            <!-- Video element -->
            <video
              :ref="`video-${media.uuid}`"
              :poster="getVideoPosterUrl(media)"
              class="w-full h-full object-cover object-top relative z-20"
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
            
            <!-- Video Duration -->
            <div
              v-if="media.duration"
              class="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded"
            >
              {{ formatDuration(media.duration) }}
            </div>
            
            <!-- Status Update Button (only show in selection mode) -->
            <div
              v-if="selectionMode"
              class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <UButton
                color="white"
                variant="solid"
                size="xs"
                icon="i-heroicons-cog-6-tooth"
                @click.stop="openStatusDialog(media)"
              />
            </div>
          </div>
          
          <!-- Placeholder when displayImages is false -->
          <div
            v-else
            class="aspect-[3/4] relative bg-gray-200 dark:bg-gray-700 flex items-center justify-center"
          >
            <div class="text-center">
              <UIcon
                :name="media.type === 'video' ? 'i-heroicons-film' : 'i-heroicons-photo'"
                class="w-8 h-8 text-gray-400 dark:text-gray-500 mb-1"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400 truncate px-1">
                {{ media.filename }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- No Results -->
    <div v-else-if="!loading && hasSearched" class="text-center py-8">
      <UIcon name="i-heroicons-photo" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">No media found matching your criteria</p>
    </div>

    <!-- Initial State -->
    <div v-else class="text-center py-8">
      <UIcon name="i-heroicons-magnifying-glass" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">Use the search filters above to find media</p>
    </div>

    <!-- Status Update Dialog -->
    <VideoStatusUpdateDialog
      v-model="showStatusDialog"
      :video="selectedVideoForStatus"
      @status-updated="handleStatusUpdated"
    />
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { nextTick } from 'vue'
import VideoStatusUpdateDialog from './VideoStatusUpdateDialog.vue'

const props = defineProps({
  mediaResults: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  hasSearched: {
    type: Boolean,
    default: false
  },
  selectionMode: {
    type: Boolean,
    default: false
  },
  multiSelect: {
    type: Boolean,
    default: false
  },
  selectedItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['media-click', 'video-status-updated'])

// Initialize settings store
const settingsStore = useSettingsStore()

// Video hover state
const hoveredVideoId = ref(null)

// Loading states for skeletons
const imageLoadStates = ref({})
const videoLoadStates = ref({})

// Status dialog state
const showStatusDialog = ref(false)
const selectedVideoForStatus = ref(null)
const updatedVideoStatuses = ref(new Set())

// Handle media click
const handleMediaClick = (media) => {
  emit('media-click', media)
}

// Check if media is selected (for multi-select mode)
const isSelected = (media) => {
  if (!props.multiSelect || !props.selectedItems) return false
  return props.selectedItems.some(item => item.uuid === media.uuid)
}

// Handle status dialog
const openStatusDialog = (video) => {
  selectedVideoForStatus.value = video
  showStatusDialog.value = true
}

const handleStatusUpdated = (data) => {
  // Add video UUID to updated statuses set to grey it out
  updatedVideoStatuses.value.add(data.video.uuid)
  
  // Emit event to parent component if needed
  emit('video-status-updated', data)
}

// Format duration function
const formatDuration = (seconds) => {
  if (!seconds) return ''
  
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  } else {
    const minutes = Math.round(seconds / 60)
    return `${minutes}m`
  }
}


// Video hover functionality
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

          // Ensure video is properly configured for autoplay
          targetVideo.muted = true
          targetVideo.playsInline = true
          targetVideo.autoplay = true
          
          // Set the source
          targetVideo.src = videoSrc
          
          // Load the video first
          targetVideo.load()
          
          // Wait for the video to be ready and then play
          const playVideo = async () => {
            try {
              // Check again if we're still hovering
              if (hoveredVideoId.value !== videoId) return
              
              targetVideo._playPromise = targetVideo.play()
              await targetVideo._playPromise
            } catch (error) {
              console.error('Video autoplay failed:', error)
            }
          }
          
          // Try to play when video can start playing
          targetVideo.addEventListener('canplay', playVideo, { once: true })
          
          // Also try to play immediately in case video loads quickly
          if (targetVideo.readyState >= 3) { // HAVE_FUTURE_DATA
            playVideo()
          }
          
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

// Handle image loading states
const handleImageLoad = (uuid) => {
  imageLoadStates.value[uuid] = true
}

const handleVideoLoad = (uuid) => {
  videoLoadStates.value[uuid] = true
}

const handleImageError = (event) => {
  console.error('❌ Image failed to load:', {
    src: event.target.src,
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

// Cleanup function to stop all videos
const cleanupVideos = () => {
  hoveredVideoId.value = null
  props.mediaResults.forEach(media => {
    if (media.type === 'video') {
      const videoContainer = document.querySelector(`[data-video-uuid="${media.uuid}"]`)
      if (videoContainer) {
        const targetVideo = videoContainer.querySelector('video')
        if (targetVideo && targetVideo.src) {
          targetVideo.pause()
          targetVideo.currentTime = 0
          targetVideo.removeAttribute('src')
          targetVideo.load()
          targetVideo._playPromise = null
        }
      }
    }
  })
}

// Reset loading states when media results change
watch(() => props.mediaResults, () => {
  imageLoadStates.value = {}
  videoLoadStates.value = {}
}, { deep: true })

// Helper methods for safe URL generation
const getImageUrl = (media, size = 'md') => {
  if (!media || !media.uuid) return ''
  
  // Use direct thumbnail if available
  if (media.thumbnail) return media.thumbnail
  
  // Use thumbnail_uuid if available and valid
  if (media.thumbnail_uuid && media.thumbnail_uuid !== 'undefined' && media.thumbnail_uuid !== 'null') {
    return `/api/media/${media.thumbnail_uuid}/image?size=${size}`
  }
  
  // Fall back to main media UUID
  return `/api/media/${media.uuid}/image?size=${size}`
}

const getVideoPosterUrl = (media) => {
  if (!media || !media.uuid) return undefined
  
  // Use direct thumbnail if available
  if (media.thumbnail) return media.thumbnail
  
  // Simplified logic: ALWAYS use video thumbnail first for consistency
  // This ensures all posters come from the same source type
  if (media.thumbnail_uuid && media.thumbnail_uuid !== 'undefined' && media.thumbnail_uuid !== 'null') {
    return `/api/media/${media.thumbnail_uuid}/image?size=md`
  }
  
  // Only use subject thumbnail as absolute last resort
  if (media.subject_thumbnail_uuid && media.subject_thumbnail_uuid !== 'undefined' && media.subject_thumbnail_uuid !== 'null') {
    return `/api/media/${media.subject_thumbnail_uuid}/image?size=md`
  }
  
  // No valid poster available
  return undefined
}

// Expose cleanup function
defineExpose({
  cleanupVideos
})
</script>