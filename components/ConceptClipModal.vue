<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-2xl' }">
    <template #header>
      <h3 class="text-lg font-semibold">Trim clip — {{ video?.filename }}</h3>
    </template>
    <template #body>
      <div v-if="video" class="space-y-3">
        <!-- Video + crop overlay -->
        <div ref="stage" class="relative bg-black rounded overflow-hidden select-none" :style="stageStyle">
          <video
            ref="videoEl"
            :src="`/api/stream/${video.uuid}`"
            class="w-full h-full object-contain"
            controls
            playsinline
            @loadedmetadata="onMeta"
            @timeupdate="onTimeUpdate"
          />
          <!-- Crop box overlay -->
          <div class="absolute inset-0 cursor-crosshair" @pointerdown="onCropStart" @pointermove="onCropMove" @pointerup="onCropEnd" @pointerleave="onCropEnd">
            <div v-if="hasCrop" class="absolute border-2 border-yellow-400 bg-yellow-400/10 pointer-events-none"
                 :style="{ left: crop.x*100+'%', top: crop.y*100+'%', width: crop.w*100+'%', height: crop.h*100+'%' }" />
          </div>
        </div>

        <!-- Trim controls -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1">Start: {{ start.toFixed(2) }}s</label>
            <div class="flex gap-2">
              <USlider v-model="start" :min="0" :max="maxStart" :step="0.05" class="flex-1" />
              <UButton size="xs" variant="outline" @click="setStartToCurrent">Use ▶ time</UButton>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Length: {{ length.toFixed(2) }}s</label>
            <USlider v-model="length" :min="0.5" :max="3" :step="0.05" />
          </div>
        </div>
        <p class="text-xs text-gray-500">
          Aim for ~1–2 s of one clean motion cycle. Trains at 16 fps → {{ Math.round(length*16) }} frames.
          Scrub the video, hit "Use ▶ time" to set the start, then adjust length.
          Drag a box on the video to spatial-crop (optional); "Reset crop" clears it.
        </p>
        <div class="flex items-center gap-2 text-xs">
          <UButton size="xs" variant="ghost" :disabled="!hasCrop" @click="resetCrop">Reset crop</UButton>
          <span v-if="hasCrop" class="text-gray-500">crop {{ Math.round(crop.w*100) }}%×{{ Math.round(crop.h*100) }}%</span>
          <span class="ml-auto text-gray-500">clip {{ start.toFixed(1) }}–{{ (start+length).toFixed(1) }}s of {{ (video.duration||0).toFixed(1) }}s</span>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" @click="isOpen = false">Cancel</UButton>
        <UButton color="primary" @click="save">{{ existing ? 'Update clip' : 'Add clip' }}</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
interface ClipVideo { uuid: string; filename: string; width?: number | null; height?: number | null; duration?: number | null }
const isOpen = defineModel<boolean>('open', { default: false })
const props = defineProps<{ video: ClipVideo | null; existing?: { start: number; end: number; crop: any } | null }>()
const emit = defineEmits<{ save: [clip: { uuid: string; start: number; end: number; crop: any }] }>()

const videoEl = ref<HTMLVideoElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const start = ref(0)
const length = ref(1.5)
const maxStart = ref(3)
const crop = ref({ x: 0, y: 0, w: 1, h: 1 })
const hasCrop = ref(false)

// Constrain the stage to the video aspect so crop fractions map cleanly.
const stageStyle = computed(() => {
  const w = props.video?.width || 16
  const h = props.video?.height || 9
  return { aspectRatio: `${w} / ${h}`, maxHeight: '55vh' }
})

watch(isOpen, (open) => {
  if (!open) return
  // Seed from an existing clip if re-editing, else defaults.
  if (props.existing) {
    start.value = props.existing.start || 0
    length.value = Math.max(0.5, (props.existing.end || 0) - (props.existing.start || 0)) || 1.5
    if (props.existing.crop) { crop.value = { ...props.existing.crop }; hasCrop.value = true }
    else { resetCrop() }
  } else {
    start.value = 0
    length.value = 1.5
    resetCrop()
  }
})

const onMeta = () => {
  const d = videoEl.value?.duration || props.video?.duration || 3
  maxStart.value = Math.max(0, d - 0.5)
}
const onTimeUpdate = () => { /* preview only */ }
const setStartToCurrent = () => {
  if (videoEl.value) start.value = Math.min(maxStart.value, Math.round(videoEl.value.currentTime * 20) / 20)
}

// --- crop box drawing (normalized fractions of the stage) ---
let drawing = false
let originX = 0
let originY = 0
const rel = (e: PointerEvent) => {
  const r = stage.value!.getBoundingClientRect()
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
}
const onCropStart = (e: PointerEvent) => {
  // Don't hijack the native video controls at the bottom strip.
  const r = stage.value!.getBoundingClientRect()
  if ((e.clientY - r.top) / r.height > 0.9) return
  drawing = true
  const p = rel(e); originX = p.x; originY = p.y
  crop.value = { x: p.x, y: p.y, w: 0, h: 0 }; hasCrop.value = true
}
const onCropMove = (e: PointerEvent) => {
  if (!drawing) return
  const p = rel(e)
  crop.value = { x: Math.min(originX, p.x), y: Math.min(originY, p.y), w: Math.abs(p.x - originX), h: Math.abs(p.y - originY) }
}
const onCropEnd = () => {
  if (!drawing) return
  drawing = false
  if (crop.value.w < 0.05 || crop.value.h < 0.05) resetCrop() // treat tiny drags as a click
}
const resetCrop = () => { crop.value = { x: 0, y: 0, w: 1, h: 1 }; hasCrop.value = false }

const save = () => {
  if (!props.video) return
  emit('save', {
    uuid: props.video.uuid,
    start: Math.round(start.value * 100) / 100,
    end: Math.round((start.value + length.value) * 100) / 100,
    crop: hasCrop.value ? { ...crop.value } : null
  })
  isOpen.value = false
}
</script>
