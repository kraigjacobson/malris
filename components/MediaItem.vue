<template>
  <!-- One media tile: image or video, with optional action buttons/badges driven
       by flags. Replaces the scattered tile implementations (MediaCard,
       SourceImageGrid item, ClusterTile, DupSide). Grids render a list of these;
       crop/zoom live in their own modals (this just emits 'crop'). -->
  <div
    class="group relative overflow-hidden bg-gray-100 dark:bg-neutral-800 transition-all"
    :class="[
      aspectClass,
      clickable ? 'cursor-pointer' : '',
      rounded ? 'rounded-lg' : '',
      selectable && selected ? 'border-2 border-primary ring-2 ring-primary/30' : (selectable ? 'border-2 border-transparent hover:border-gray-600' : ''),
      current ? 'outline outline-2 outline-blue-500 outline-offset-1' : ''
    ]"
    :style="aspectStyle"
    @click="$emit('click', media)"
  >
    <!-- Loading skeleton -->
    <USkeleton v-if="displayImages && !loaded" class="absolute inset-0 w-full h-full z-10" />

    <!-- Image -->
    <template v-if="media?.type === 'image'">
      <img
        v-if="displayImages"
        :src="imageUrl"
        :alt="media.filename"
        :width="aspect === 'auto' && !maxHeight && media.width ? media.width : undefined"
        :height="aspect === 'auto' && !maxHeight && media.height ? media.height : undefined"
        :class="imageClass"
        :style="imageStyle"
        loading="lazy"
        decoding="async"
        @load="onLoaded"
        @error="onLoaded"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <UIcon name="i-heroicons-photo" class="text-4xl text-gray-400" />
      </div>
    </template>

    <!-- Video -->
    <template v-else-if="media?.type === 'video'">
      <template v-if="displayImages">
        <img v-if="posterUrl" :src="posterUrl" class="hidden" @load="onLoaded" @error="onLoaded" />
        <video
          ref="videoRef"
          :poster="posterUrl"
          class="w-full h-full object-cover object-top relative z-20 transition-opacity duration-200"
          :style="{ opacity: (loaded || !posterUrl) ? 1 : 0 }"
          muted loop playsinline webkit-playsinline disablePictureInPicture
          :preload="autoplay ? 'auto' : 'none'"
          :autoplay="autoplay"
          :controls="showControls"
          @mouseenter="hoverPlay"
          @mouseleave="hoverStop"
        >
          <source :src="`/api/stream/${media.uuid}`" type="video/mp4" />
        </video>
        <div v-if="!posterUrl" class="absolute inset-0 flex items-center justify-center z-10">
          <UIcon name="i-heroicons-play-circle" class="text-4xl text-gray-400" />
        </div>
        <div v-if="showDuration && media.duration" class="absolute bottom-2 right-2 bg-black/75 text-white text-xs px-1.5 py-0.5 rounded z-30">
          {{ formatDuration(media.duration) }}
        </div>
      </template>
      <div v-else class="w-full h-full flex items-center justify-center">
        <UIcon name="i-heroicons-play-circle" class="text-4xl text-gray-400" />
      </div>
    </template>

    <!-- Fallback -->
    <div v-else class="w-full h-full flex items-center justify-center">
      <UIcon name="i-heroicons-document" class="text-4xl text-gray-400" />
    </div>

    <!-- Selection check -->
    <div v-if="selectable && selected" class="absolute top-1 right-1 z-40 bg-primary rounded-full w-5 h-5 flex items-center justify-center">
      <UIcon name="i-heroicons-check" class="w-3 h-3 text-white" />
    </div>

    <!-- Job-count badge -->
    <div v-if="showJobCount && jobCount > 0" class="absolute -top-0.5 -left-0.5 z-40 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
      {{ jobCount }}
    </div>

    <!-- FS pill for job-produced source images -->
    <div v-if="showFsPill && media?.job_id" class="absolute top-1 left-1 z-40 bg-amber-500/90 text-white text-[10px] font-semibold rounded px-1.5 py-0.5 shadow pointer-events-none" :class="{ 'left-7': showJobCount && jobCount > 0 }">
      FS
    </div>

    <!-- Top-right action stack (delete / rating / crop) -->
    <div v-if="enableDelete || enableRating || enableCrop" class="absolute top-2 right-2 z-40 flex flex-col gap-2 items-end" :class="{ 'top-9': selectable && selected }">
      <UButton v-if="enableDelete" icon="i-heroicons-x-mark" color="error" variant="ghost" size="xl"
        class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center" square @click.stop="$emit('delete', media)" />
      <UButton v-if="enableCrop" icon="i-heroicons-scissors" color="primary" variant="solid" size="sm"
        class="opacity-80 hover:opacity-100 transition-opacity" square @click.stop="$emit('crop', media)" />
      <StarRating v-if="enableRating" :media-uuid="media.uuid" :rating="media.rating" :job-id="media.job_id"
        @updated="r => $emit('rate', media, r)" @click.stop />
    </div>

    <!-- Favorite toggle (bottom-left) -->
    <button
      v-if="enableFavorite"
      type="button"
      class="absolute bottom-1 left-1 z-40 rounded-full w-7 h-7 flex items-center justify-center transition-colors"
      :class="media?.favorite
        ? 'bg-yellow-400/90 hover:bg-yellow-300 text-black'
        : 'bg-black/70 hover:bg-black/90 text-white opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'"
      :title="media?.favorite ? 'Unmark favorite' : 'Mark as favorite'"
      @click.stop="$emit('favorite', media, !media.favorite)"
    >
      <UIcon :name="media?.favorite ? 'i-heroicons-star-solid' : 'i-heroicons-star'" class="w-4 h-4" />
    </button>

    <!-- Rotate (bottom-right) -->
    <button
      v-if="enableRotate"
      type="button"
      class="absolute bottom-1 right-1 z-40 bg-black/70 hover:bg-black/90 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="rotating"
      title="Rotate 90° clockwise"
      @click.stop="$emit('rotate', media)"
    >
      <UIcon :name="rotating ? 'i-heroicons-arrow-path' : 'i-heroicons:arrow-path-16-solid'" :class="['w-4 h-4', rotating ? 'animate-spin' : '']" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { MediaItemData } from '~/types'
import { useSettingsStore } from '~/stores/settings'

interface Props {
  media: MediaItemData
  // Image variant: 'thumbnail'|'sm'|'md'|'lg'|'preview'|'full' ('preview'/'full' are uncropped originals).
  imageSize?: string
  // 'auto' = natural aspect (masonry, h-auto); else a fixed box: 'square'|'3/4'|'16/9'|'4/3'.
  aspect?: string
  rounded?: boolean
  // Cap the image height (e.g. '34vh') and show it object-contain at natural
  // aspect, centered — for comparison/contain displays (dedup cards, etc.).
  maxHeight?: string
  // For aspect="auto" (masonry): reserve this aspect-ratio (e.g. '3/4') before the
  // image loads / when the record has no width/height, to prevent layout shift.
  fallbackAspect?: string
  // Whether the tile is interactive (shows pointer cursor). Off for static displays.
  clickable?: boolean
  // Selection affordance.
  selectable?: boolean
  selected?: boolean
  // Blue outline for the "current" item (e.g. the one open in a viewer).
  current?: boolean
  // Optional action buttons / badges.
  enableFavorite?: boolean
  enableRotate?: boolean
  enableCrop?: boolean
  enableRating?: boolean
  enableDelete?: boolean
  showJobCount?: boolean
  jobCount?: number
  showDuration?: boolean
  showFsPill?: boolean
  rotating?: boolean
  // Video behaviour.
  autoplay?: boolean
  showControls?: boolean
  // Cache-bust token to force a refetch after the bytes change (crop/rotate).
  cacheBuster?: number | string | null
}

const props = withDefaults(defineProps<Props>(), {
  imageSize: 'md',
  aspect: 'auto',
  rounded: true,
  maxHeight: undefined,
  fallbackAspect: undefined,
  clickable: true,
  selectable: false,
  selected: false,
  current: false,
  enableFavorite: false,
  enableRotate: false,
  enableCrop: false,
  enableRating: false,
  enableDelete: false,
  showJobCount: false,
  jobCount: 0,
  showDuration: true,
  showFsPill: true,
  rotating: false,
  autoplay: false,
  showControls: false,
  cacheBuster: null
})

defineEmits<{
  click: [media: MediaItemData]
  favorite: [media: MediaItemData, value: boolean]
  rotate: [media: MediaItemData]
  crop: [media: MediaItemData]
  delete: [media: MediaItemData]
  rate: [media: MediaItemData, rating: number]
}>()

const settingsStore = useSettingsStore()
const displayImages = computed(() => settingsStore.displayImages)

const videoRef = ref<HTMLVideoElement | null>(null)
const loaded = ref(false)

const aspectClass = computed(() => {
  // 'auto' = natural height (masonry); 'fill' = fill the parent box (object-cover);
  // fixed ratios use an aspect box.
  const map: Record<string, string> = {
    square: 'aspect-square', '3/4': 'aspect-[3/4]', '16/9': 'aspect-video', '4/3': 'aspect-[4/3]', auto: '', fill: 'w-full h-full'
  }
  return map[props.aspect] ?? ''
})
// For aspect="auto" (masonry), reserve an aspect-ratio so the tile (and its
// skeleton) have a height before the image loads — DB dims, else measured-on-load
// dims, else the fallback. Other modes need no inline style.
const measuredAspect = ref<string | null>(null)
const aspectStyle = computed<Record<string, any>>(() => {
  if (props.aspect !== 'auto') return {}
  const w = props.media?.width
  const h = props.media?.height
  if (w && h) return { aspectRatio: `${w} / ${h}` }
  if (measuredAspect.value) return { aspectRatio: measuredAspect.value }
  if (props.fallbackAspect) return { aspectRatio: props.fallbackAspect }
  return {}
})

const cb = computed(() => (props.cacheBuster ? `&v=${props.cacheBuster}` : ''))

const imageUrl = computed(() => {
  const m = props.media
  if (!m?.uuid) return ''
  if (props.imageSize === 'preview' || props.imageSize === 'full') {
    return `/api/media/${m.uuid}/image?size=${props.imageSize}${cb.value}`
  }
  if (m.thumbnail) return m.thumbnail
  if (m.thumbnail_uuid && m.thumbnail_uuid !== 'undefined' && m.thumbnail_uuid !== 'null') {
    return `/api/media/${m.thumbnail_uuid}/image?size=${props.imageSize}${cb.value}`
  }
  return `/api/media/${m.uuid}/image?size=${props.imageSize}${cb.value}`
})

const posterUrl = computed(() => {
  const m = props.media
  if (!m?.uuid) return undefined
  if (m.thumbnail) return m.thumbnail
  if (m.thumbnail_uuid && m.thumbnail_uuid !== 'undefined' && m.thumbnail_uuid !== 'null') {
    return `/api/media/${m.thumbnail_uuid}/image?size=md${cb.value}`
  }
  if (m.subject_thumbnail_uuid && m.subject_thumbnail_uuid !== 'undefined' && m.subject_thumbnail_uuid !== 'null') {
    return `/api/media/${m.subject_thumbnail_uuid}/image?size=md${cb.value}`
  }
  return undefined
})

const imageClass = computed(() => {
  if (props.maxHeight) return 'block w-auto h-auto max-w-full object-contain mx-auto transition-opacity duration-200'
  if (props.aspect === 'auto') return 'block w-full h-auto transition-opacity duration-200'
  return 'w-full h-full object-cover object-top transition-opacity duration-200'
})
const imageStyle = computed(() => {
  const s: Record<string, any> = { opacity: loaded.value ? 1 : 0 }
  if (props.maxHeight) s.maxHeight = props.maxHeight
  return s
})

const onLoaded = (ev?: Event) => {
  loaded.value = true
  // Lock in the real aspect for masonry tiles whose record lacks DB dims, so a
  // re-render/remount reserves the correct height instead of the fallback.
  const el = ev?.target as HTMLImageElement | undefined
  if (
    props.aspect === 'auto' && !measuredAspect.value &&
    !(props.media?.width && props.media?.height) &&
    el?.naturalWidth && el?.naturalHeight
  ) {
    measuredAspect.value = `${el.naturalWidth} / ${el.naturalHeight}`
  }
}

watch(() => props.media?.uuid, () => {
  loaded.value = false
  measuredAspect.value = null
  // Videos with no poster have nothing to load — don't wait on it.
  if (props.media?.type === 'video' && !posterUrl.value) loaded.value = true
}, { immediate: true })

const hoverPlay = async () => {
  if (!displayImages.value || !videoRef.value || props.autoplay) return
  try { await videoRef.value.play() } catch { /* ignore */ }
}
const hoverStop = () => {
  if (!displayImages.value || !videoRef.value || props.autoplay) return
  videoRef.value.pause()
  videoRef.value.currentTime = 0
}

const formatDuration = (s: number | null | undefined) => {
  if (!s) return ''
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.round(s / 60)}m`
}
</script>
