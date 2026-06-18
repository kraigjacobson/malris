<template>
  <!-- Full-size crop modal for BOTH images and videos. Uses one cropper UI
       (vue-advanced-cropper) over the original full-res bytes (image) or a
       captured frame (video), and applies the resulting pixel rect to the right
       endpoint:
         image -> POST /api/media/{uuid}/crop
         video -> POST /api/media/{uuid}/edit { operations: { crop } }
       Both take the same { x, y, width, height } native-pixel rect. -->
  <UModal v-model:open="isOpen" fullscreen :dismissible="!isSaving">
    <template #body>
      <div class="flex flex-col">
        <div class="flex items-center justify-between pb-2">
          <h4 class="text-base font-semibold text-gray-800 dark:text-gray-200 truncate">
            Crop{{ media?.filename ? `: ${media.filename}` : '' }}
            <span v-if="isVideo" class="text-xs font-normal text-gray-400">(video — applies to every frame)</span>
          </h4>
          <UButton size="sm" variant="ghost" icon="i-heroicons-x-mark" :disabled="isSaving" @click="close" />
        </div>

        <div class="relative bg-gray-900 rounded-lg overflow-hidden" :style="{ height: cropAreaHeight }">
          <Cropper
            v-if="cropSource && cropperReady"
            ref="cropperRef"
            class="absolute inset-0"
            :src="cropSource"
            :stencil-props="{ aspectRatio: null }"
            :default-size="cropperDefaultSize"
            :default-position="cropperDefaultPosition"
            :default-visible-area="cropperDefaultVisibleArea"
            image-restriction="fit-area"
            @change="onCropChange"
          />
          <div v-else class="absolute inset-0 flex items-center justify-center text-gray-400">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl mr-2" />
            <span class="text-sm">Loading frame…</span>
          </div>

          <!-- Dimensions overlay -->
          <div class="absolute top-2 left-2 bg-black/70 text-white text-xs font-mono rounded px-2 py-1 space-y-0.5 pointer-events-none z-10">
            <div>{{ isVideo ? 'Video' : 'Image' }}: {{ nativeSize.width || '—' }} × {{ nativeSize.height || '—' }}</div>
            <div>Crop: {{ coordinates ? `${Math.round(coordinates.width)} × ${Math.round(coordinates.height)}` : '—' }}</div>
          </div>

          <!-- Hidden video used only to capture frames for the cropper. -->
          <video
            v-if="isVideo && isOpen"
            ref="frameVideo"
            :src="`/api/stream/${media.uuid}?v=${cacheBuster}`"
            class="hidden"
            preload="auto"
            muted
            @loadedmetadata="onFrameVideoLoaded"
            @seeked="onFrameSeeked"
          />
        </div>

        <!-- Frame scrubber (video only) — picks which frame to FRAME UP on; the
             crop rect is spatial and applies to all frames regardless. -->
        <div v-if="isVideo" class="pt-3 space-y-1">
          <div class="flex items-center justify-between text-xs text-gray-500">
            <span>Frame preview</span>
            <span>{{ formatTime(framePreviewTime) }} / {{ formatTime(videoDuration) }}</span>
          </div>
          <USlider v-model="framePreviewTime" :min="0" :max="videoDuration || 1" :step="0.1"
            :disabled="isSaving" @update:model-value="seekFrame" />
        </div>

        <div class="flex items-center justify-end gap-2 pt-3">
          <UButton variant="ghost" color="neutral" size="sm" :disabled="isSaving" @click="close">Cancel</UButton>
          <UButton color="primary" size="sm" icon="i-heroicons-check" :loading="isSaving"
            :disabled="!coordinates || coordinates.width <= 0 || coordinates.height <= 0" @click="save">
            Save Crop
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'
import type { MediaItemData } from '~/types'

interface Props {
  open?: boolean
  media?: MediaItemData | null
}
const props = withDefaults(defineProps<Props>(), {
  open: false,
  media: null
})

interface CropResult {
  uuid: string
  width?: number
  height?: number
  file_size?: number
}
const emit = defineEmits<{
  'update:open': [value: boolean]
  cropped: [result: CropResult]
}>()

const isOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v)
})

const isVideo = computed(() => props.media?.type === 'video')

// Concrete height for the crop area so the cropper can fit-to-contain the whole
// image. Relying on the flex chain inside UModal's body doesn't give a bounded
// height, so the cropper would fit-to-width and overflow. Reserve room for the
// header/footer (+ the frame scrubber on videos).
const cropAreaHeight = computed(() => (isVideo.value ? 'calc(100dvh - 12rem)' : 'calc(100dvh - 9rem)'))

interface CropRect { left: number; top: number; width: number; height: number }

const cropperRef = ref<any>(null) // vue-advanced-cropper instance (no exported type)
const frameVideo = ref<HTMLVideoElement | null>(null)
const coordinates = ref<CropRect | null>(null)
const isSaving = ref(false)
const cacheBuster = ref(0)

// Video frame state.
const videoDuration = ref(0)
const framePreviewTime = ref(0)
const capturedFrame = ref<string | null>(null) // data URL of the current frame for the cropper
let frameCanvas: HTMLCanvasElement | null = null

// Only mount the cropper once the fullscreen modal has laid out, so it measures
// the real container size and fits the whole image (zoomed out) instead of a
// transient/zero-size box.
const cropperReady = ref(false)

// Cropper source: full-res image bytes, or the captured video frame.
const cropSource = computed(() => {
  if (!props.media?.uuid) return ''
  if (isVideo.value) return capturedFrame.value || ''
  // 'full' = ORIGINAL bytes (sized variants are pre-cropped to 3:4).
  return `/api/media/${props.media.uuid}/image?size=full&cv=${cacheBuster.value}`
})

const nativeSize = computed(() => {
  const s = cropperRef.value?.image?.size
  if (s?.width && s?.height) return { width: Math.round(s.width), height: Math.round(s.height) }
  if (props.media?.width && props.media?.height) return { width: props.media.width, height: props.media.height }
  return { width: 0, height: 0 }
})

// Reset + (for video) kick off frame capture each time the modal opens.
watch(isOpen, (open) => {
  if (!open) {
    cropperReady.value = false
    return
  }
  coordinates.value = null
  cacheBuster.value = Date.now()
  capturedFrame.value = null
  framePreviewTime.value = 0
  cropperReady.value = false
  // Wait for the modal to lay out at full size before mounting the cropper.
  nextTick(() => { cropperReady.value = true })
})

const onCropChange = ({ coordinates: c }: { coordinates: CropRect }) => {
  coordinates.value = c
}

const onFrameVideoLoaded = () => {
  const v = frameVideo.value
  if (!v) return
  videoDuration.value = v.duration || 0
  // Capture an initial frame a touch into the video (0 can be black).
  framePreviewTime.value = Math.min(0.1, videoDuration.value)
  seekFrame()
}

const seekFrame = () => {
  const v = frameVideo.value
  if (!v) return
  v.currentTime = framePreviewTime.value
}

const onFrameSeeked = () => {
  const v = frameVideo.value
  if (!v || !v.videoWidth) return
  if (!frameCanvas) frameCanvas = document.createElement('canvas')
  frameCanvas.width = v.videoWidth
  frameCanvas.height = v.videoHeight
  const ctx = frameCanvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(v, 0, 0, frameCanvas.width, frameCanvas.height)
  try {
    capturedFrame.value = frameCanvas.toDataURL('image/jpeg', 0.9)
  } catch (e) {
    console.error('Failed to capture video frame for crop:', e)
  }
}

// The visible area must match the VIEWPORT's aspect ratio (it maps onto the
// rectangular cropper area). Returning the raw image size gets normalized to a
// fit-width top-slice on a wide screen. Instead, build a visible area at the
// viewport aspect that fully contains the image (letterboxed), centered — so the
// whole image is visible by default regardless of screen shape.
type Size = { width: number; height: number }
const cropperDefaultVisibleArea = ({ boundaries, imageSize }: { boundaries?: Size; imageSize: Size }) => {
  if (!boundaries?.width || !boundaries?.height) {
    return { width: imageSize.width, height: imageSize.height, left: 0, top: 0 }
  }
  const areaAspect = boundaries.width / boundaries.height
  const imageAspect = imageSize.width / imageSize.height
  let width, height
  if (imageAspect > areaAspect) {
    // Image wider than viewport → letterbox top/bottom.
    width = imageSize.width
    height = imageSize.width / areaAspect
  } else {
    // Image taller than viewport → letterbox left/right.
    height = imageSize.height
    width = imageSize.height * areaAspect
  }
  return {
    width,
    height,
    left: (imageSize.width - width) / 2,
    top: (imageSize.height - height) / 2
  }
}
// Start the crop selection as the WHOLE image.
const cropperDefaultSize = ({ imageSize }: { imageSize: Size }) => ({ width: imageSize.width, height: imageSize.height })
const cropperDefaultPosition = () => ({ left: 0, top: 0 })

const formatTime = (s: number) => {
  const sec = Math.max(0, Math.floor(s || 0))
  const m = Math.floor(sec / 60)
  const r = sec % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

const close = () => {
  if (isSaving.value) return
  isOpen.value = false
}

const save = async () => {
  if (!props.media?.uuid || !coordinates.value) return
  const { left, top, width, height } = coordinates.value
  if (width <= 0 || height <= 0) return

  const rect = {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height)
  }

  isSaving.value = true
  const toast = useToast()
  try {
    let result: CropResult
    if (isVideo.value) {
      const res = await useApiFetch(`media/${props.media.uuid}/edit`, {
        method: 'POST',
        body: { operations: { crop: rect } }
      })
      const m = res?.updatedMedia || {}
      result = { uuid: props.media.uuid, width: m.width, height: m.height, file_size: m.file_size }
    } else {
      const res = await useApiFetch(`media/${props.media.uuid}/crop`, {
        method: 'POST',
        body: rect
      })
      result = { uuid: props.media.uuid, width: res?.width, height: res?.height, file_size: res?.file_size }
    }
    toast.add({ title: 'Cropped', description: isVideo.value ? 'Video saved' : 'Image saved', color: 'success', duration: 1500 })
    emit('cropped', result)
    isOpen.value = false
  } catch (error: any) {
    console.error('Failed to crop media:', error)
    toast.add({
      title: 'Crop Failed',
      description: error.data?.statusMessage || error.message || 'Failed to crop',
      color: 'error',
      duration: 4000
    })
  } finally {
    isSaving.value = false
  }
}
</script>
