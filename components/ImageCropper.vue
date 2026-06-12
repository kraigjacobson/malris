<template>
  <!-- Reusable image-crop panel. Renders vue-advanced-cropper over the ORIGINAL
       image bytes, tracks the selection in native pixel space, and POSTs it to
       the crop endpoint. Designed to take over a host modal's body (h-full). -->
  <div class="h-full flex flex-col">
    <div v-if="filename" class="flex items-center justify-between pb-2">
      <h4 class="text-base font-semibold text-gray-800 dark:text-gray-200 truncate">Crop: {{ filename }}</h4>
      <UButton size="sm" variant="ghost" icon="i-heroicons-x-mark" :disabled="isSaving" @click="$emit('cancel')">Cancel</UButton>
    </div>

    <div class="relative flex-1 min-h-0 bg-gray-900 rounded-lg overflow-hidden">
      <Cropper
        ref="cropperRef"
        class="absolute inset-0"
        :src="cropSrc"
        :stencil-props="{ aspectRatio: null }"
        :default-size="cropperDefaultSize"
        :default-position="cropperDefaultPosition"
        :default-visible-area="cropperDefaultVisibleArea"
        image-restriction="fit-area"
        @change="onCropChange"
      />
      <!-- Dimensions overlay -->
      <div class="absolute top-2 left-2 bg-black/70 text-white text-xs font-mono rounded px-2 py-1 space-y-0.5 pointer-events-none z-10">
        <div>Image: {{ nativeSize.width || '—' }} × {{ nativeSize.height || '—' }}</div>
        <div>Crop: {{ coordinates ? `${Math.round(coordinates.width)} × ${Math.round(coordinates.height)}` : '—' }}</div>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 pt-2">
      <UButton variant="ghost" color="neutral" size="sm" :disabled="isSaving" @click="$emit('cancel')">Cancel</UButton>
      <UButton color="primary" size="sm" icon="i-heroicons-check" :loading="isSaving"
        :disabled="!coordinates || coordinates.width <= 0 || coordinates.height <= 0" @click="save">
        Save Crop
      </UButton>
    </div>
  </div>
</template>

<script setup>
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

const props = defineProps({
  // Media UUID of the image to crop.
  uuid: { type: String, required: true },
  // Optional label shown in the panel header (omit to hide the header).
  filename: { type: String, default: '' },
  // Fallback native dimensions for the overlay before the cropper reports them.
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 }
})

const emit = defineEmits(['cancel', 'cropped'])

const cropperRef = ref(null)
const coordinates = ref(null)
const isSaving = ref(false)
const srcVersion = ref(0)

// Cache-bust on mount so we always crop the freshest bytes (e.g. post-rotate),
// not a stale browser-cached copy. Date.now() is only safe in component code.
onMounted(() => {
  srcVersion.value = Date.now()
})

const cropSrc = computed(() => {
  if (!props.uuid) return ''
  // 'full' = ORIGINAL bytes. The sized variants (sm/md/lg) use sharp's
  // fit:'cover', position:'top' which pre-crops to a 3:4 portrait — cropping
  // from there would be cropping an already-cropped image.
  return `/api/media/${props.uuid}/image?size=full&cv=${srcVersion.value}`
})

// Native image dimensions — cropper exposes them after load; fall back to the
// dims passed in by the caller.
const nativeSize = computed(() => {
  const s = cropperRef.value?.image?.size
  if (s?.width && s?.height) return { width: Math.round(s.width), height: Math.round(s.height) }
  if (props.width && props.height) return { width: props.width, height: props.height }
  return { width: 0, height: 0 }
})

const onCropChange = ({ coordinates: c }) => {
  coordinates.value = c
}

// Force the initial visible area to the ENTIRE image. image-restriction="fit-area"
// alone only governs drag constraints, not the initial zoom level.
const cropperDefaultVisibleArea = ({ imageSize }) => ({
  width: imageSize.width,
  height: imageSize.height,
  left: 0,
  top: 0
})
// Stencil matches the visible area so the cropper doesn't zoom in to fit a
// stencil bigger than what's shown.
const cropperDefaultSize = ({ imageSize, visibleArea }) => {
  const area = visibleArea || imageSize
  return { width: area.width, height: area.height }
}
const cropperDefaultPosition = ({ visibleArea }) => {
  if (visibleArea) return { left: visibleArea.left, top: visibleArea.top }
  return { left: 0, top: 0 }
}

const save = async () => {
  if (!props.uuid || !coordinates.value) return
  const { left, top, width, height } = coordinates.value
  if (width <= 0 || height <= 0) return

  isSaving.value = true
  const toast = useToast()
  try {
    const res = await useApiFetch(`media/${props.uuid}/crop`, {
      method: 'POST',
      body: { x: left, y: top, width, height }
    })
    toast.add({ title: 'Cropped', description: 'Image saved', color: 'success', duration: 1500 })
    emit('cropped', { uuid: props.uuid, width: res?.width, height: res?.height, file_size: res?.file_size })
  } catch (error) {
    console.error('Failed to crop image:', error)
    toast.add({
      title: 'Crop Failed',
      description: error.data?.statusMessage || error.message || 'Failed to crop image',
      color: 'error',
      duration: 4000
    })
  } finally {
    isSaving.value = false
  }
}
</script>
