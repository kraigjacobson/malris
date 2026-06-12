<template>
  <div ref="rootRef">
    <div v-if="loading" class="flex items-center justify-center p-8">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
    </div>
    <div v-else-if="!images.length" class="text-sm text-gray-500 text-center p-4">
      {{ emptyMessage }}
    </div>
    <template v-else>
      <!-- Fixed column buckets: each image's column = index % columnCount. This keeps
           already-rendered tiles anchored to their columns even as new ones append
           or as images below finish loading and change heights. CSS 'columns' would
           rebalance the whole flow, causing tiles to jump columns. -->
      <div class="flex gap-2 items-start">
        <div
          v-for="(col, colIdx) in imageColumns"
          :key="colIdx"
          class="flex-1 flex flex-col gap-2 min-w-0"
        >
          <div
            v-for="img in col"
            :key="img.uuid"
            class="group relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all bg-gray-100 dark:bg-gray-800"
            :class="[
              isSelected(img) ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-gray-600',
              isCurrent(img) ? 'outline-2 outline-blue-500 outline-offset-1' : ''
            ]"
            :style="tileAspectStyle(img)"
            @click="$emit('click', img)"
          >
            <!-- width/height attrs let the browser reserve the right height before the
                 pixels arrive (when we know the dims), so nothing below shifts on load.
                 The skeleton overlay fills the same reserved box so we see a shimmer at
                 the correct size/aspect ratio until the bytes show up. -->
            <USkeleton
              v-if="!loadedSet.has(img.uuid)"
              class="absolute inset-0 w-full h-full"
            />
            <img
              :src="imageSrc(img)"
              :width="img.width || undefined"
              :height="img.height || undefined"
              class="block w-full h-auto transition-opacity duration-200"
              :class="{ 'opacity-0': !loadedSet.has(img.uuid) }"
              loading="lazy"
              decoding="async"
              @load="markLoaded(img.uuid, $event)"
              @error="markLoaded(img.uuid, $event)"
            />
            <div v-if="isSelected(img)" class="absolute top-1 right-1 bg-primary rounded-full w-5 h-5 flex items-center justify-center">
              <UIcon name="i-heroicons-check" class="w-3 h-3 text-white" />
            </div>
            <div v-if="showJobCount && jobCounts[img.uuid] > 0" class="absolute -top-0.5 -left-0.5 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
              {{ jobCounts[img.uuid] }}
            </div>
            <!-- "FS" pill for job-produced source images (currently only fs outputs).
                 Originals have job_id = null; generated images have it set. -->
            <div v-if="img.job_id" class="absolute top-1 left-1 bg-amber-500/90 text-white text-[10px] font-semibold rounded px-1.5 py-0.5 shadow pointer-events-none" :class="{ 'left-7': showJobCount && jobCounts[img.uuid] > 0 }">
              FS
            </div>
            <!-- Favorite toggle (always visible when enabled; lit when favorited so
                 you can scan the grid for what's marked at a glance). -->
            <button
              v-if="enableFavorite"
              type="button"
              class="absolute bottom-1 left-1 rounded-full w-7 h-7 flex items-center justify-center transition-colors"
              :class="img.favorite
                ? 'bg-yellow-400/90 hover:bg-yellow-300 text-black'
                : 'bg-black/70 hover:bg-black/90 text-white opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'"
              :title="img.favorite ? 'Unmark favorite' : 'Mark as favorite'"
              @click.stop="$emit('favoriteToggle', img, !img.favorite)"
            >
              <UIcon
                :name="img.favorite ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
                class="w-4 h-4"
              />
            </button>
            <!-- Rotate button (visible on hover) -->
            <button
              v-if="enableRotate"
              type="button"
              class="absolute bottom-1 right-1 bg-black/70 hover:bg-black/90 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="isRotating(img)"
              title="Rotate 90° clockwise"
              @click.stop="$emit('rotate', img)"
            >
              <UIcon
                :name="isRotating(img) ? 'i-heroicons-arrow-path' : 'i-heroicons:arrow-path-16-solid'"
                :class="['w-4 h-4', isRotating(img) ? 'animate-spin' : '']"
              />
            </button>
          </div>
        </div>
      </div>
      <!-- Sentinel for infinite-scroll batching. Only rendered while there are more to reveal. -->
      <div v-if="hasMore" ref="sentinelRef" class="h-1 w-full mt-2" aria-hidden="true"></div>
    </template>
  </div>
</template>

<script setup>
const props = defineProps({
  images: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  selectedUuids: { type: [Array, Set], default: () => [] },
  currentUuid: { type: String, default: null },
  jobCounts: { type: Object, default: () => ({}) },
  showJobCount: { type: Boolean, default: false },
  emptyMessage: { type: String, default: 'No images found' },
  // Batching: initial batch + how many to reveal each time the sentinel is visible.
  initialBatch: { type: Number, default: 30 },
  batchIncrement: { type: Number, default: 30 },
  // Show a hover-revealed rotate button per tile. Parent handles the 'rotate' event.
  enableRotate: { type: Boolean, default: false },
  // Set of uuids currently being rotated — spins the icon + disables the button.
  rotatingUuids: { type: [Set, Array], default: () => new Set() },
  // Show a per-tile favorite toggle. Reads img.favorite, emits 'favoriteToggle'
  // (img, newValue). Parent persists the new value + updates the local image.
  enableFavorite: { type: Boolean, default: false },
  // uuid -> version number. When a uuid's value changes, the src gets a cache-bust
  // query param so the browser refetches (used after rotation overwrites bytes).
  cacheBusters: { type: Object, default: () => ({}) }
})

defineEmits(['click', 'rotate', 'favoriteToggle'])

const imageSrc = (img) => {
  // 'preview' preserves the original aspect ratio at a moderate resolution, which
  // matches the aspect-ratio box we reserve per tile. 'thumbnail' is a fixed 150x200
  // cover-crop and would double-crop when paired with varying tile heights.
  const base = `/api/media/${img.uuid}/image?size=preview`
  const v = props.cacheBusters?.[img.uuid]
  return v ? `${base}&v=${v}` : base
}

const rootRef = ref(null)
const sentinelRef = ref(null)
const visibleCount = ref(props.initialBatch)

// Tracks which image uuids have finished loading (or errored) so we can hide
// the skeleton overlay on just that tile. Replaced (not mutated) on each update
// so Vue's reactivity fires — .add() on a ref'd Set doesn't trigger rerenders.
const loadedSet = ref(new Set())
// Actual natural dimensions captured from the <img> element at load time, keyed
// by uuid. Used to lock in the correct aspect ratio for records that don't have
// width/height in the DB (currently most of them).
const measuredDims = ref({})
const markLoaded = (uuid, ev) => {
  const el = ev?.target
  if (el && el.naturalWidth && el.naturalHeight && !measuredDims.value[uuid]) {
    measuredDims.value = {
      ...measuredDims.value,
      [uuid]: { w: el.naturalWidth, h: el.naturalHeight }
    }
  }
  if (loadedSet.value.has(uuid)) return
  loadedSet.value = new Set([...loadedSet.value, uuid])
}

// Aspect ratio style for a tile: prefer DB dims, fall back to measured dims from
// a previous load on the same uuid, then to a generic portrait default so the
// tile (and its skeleton) have a sensible height even before the img downloads.
const tileAspectStyle = (img) => {
  if (img.width && img.height) return { aspectRatio: `${img.width} / ${img.height}` }
  const m = measuredDims.value[img.uuid]
  if (m) return { aspectRatio: `${m.w} / ${m.h}` }
  return { aspectRatio: '3 / 4' }
}

// Column count scales with viewport. The ladder is hardcoded here (rather than
// taking a prop) because both consumers are large modals — when one is wider,
// the other is too. If a future consumer needs different breakpoints, lift
// these into a prop.
const columnCount = ref(3)
const updateColumnCount = () => {
  if (typeof window === 'undefined') return
  const w = window.innerWidth
  if (w >= 1536) columnCount.value = 8       // 2xl
  else if (w >= 1280) columnCount.value = 6  // xl
  else if (w >= 1024) columnCount.value = 5  // lg
  else if (w >= 640) columnCount.value = 4   // sm/md
  else columnCount.value = 3
}

const visibleImages = computed(() => props.images.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < props.images.length)

// Bucket images into fixed columns by index (i -> i % columnCount). Once an image
// is assigned to a column it never migrates, which is exactly what gives the grid
// stable positions during lazy loading.
const imageColumns = computed(() => {
  const buckets = Array.from({ length: columnCount.value }, () => [])
  visibleImages.value.forEach((img, i) => {
    buckets[i % columnCount.value].push(img)
  })
  return buckets
})

const selectedSet = computed(() => {
  if (props.selectedUuids instanceof Set) return props.selectedUuids
  return new Set(props.selectedUuids || [])
})

const rotatingSet = computed(() => {
  if (props.rotatingUuids instanceof Set) return props.rotatingUuids
  return new Set(props.rotatingUuids || [])
})

const isSelected = (img) => selectedSet.value.has(img.uuid)
const isCurrent = (img) => props.currentUuid && img.uuid === props.currentUuid
const isRotating = (img) => rotatingSet.value.has(img.uuid)

// Walk up to find the nearest scroll ancestor so IntersectionObserver fires relative
// to the scrollable parent (e.g. modal body), not the browser viewport.
const findScrollParent = (el) => {
  let node = el?.parentElement
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return node
    node = node.parentElement
  }
  return null
}

let observer = null

const disconnectObserver = () => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
}

const setupObserver = () => {
  disconnectObserver()
  if (!sentinelRef.value) return
  const root = findScrollParent(rootRef.value)
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && hasMore.value) {
        visibleCount.value = Math.min(visibleCount.value + props.batchIncrement, props.images.length)
      }
    },
    { root, rootMargin: '300px 0px', threshold: 0 }
  )
  observer.observe(sentinelRef.value)
}

// Re-wire the observer whenever the sentinel element changes (mount, remount after
// visibleCount bumps caused it to briefly unmount when hasMore flipped false→true, etc).
watch(sentinelRef, () => nextTick(setupObserver))

// Reset the batch window only when the list *membership* changes (subject
// switch, image added/removed) — not when the parent hands us a new array with
// the same images because one item mutated (favorite toggle, rotate). Keying on
// the ordered uuid list keeps the infinite-scroll position across those edits.
watch(
  () => props.images.map(i => i.uuid).join(','),
  () => {
    visibleCount.value = props.initialBatch
    nextTick(setupObserver)
  }
)

onMounted(() => {
  updateColumnCount()
  window.addEventListener('resize', updateColumnCount)
  nextTick(setupObserver)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateColumnCount)
  disconnectObserver()
})
</script>
