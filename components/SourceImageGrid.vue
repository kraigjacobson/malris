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
          <MediaItem
            v-for="img in col"
            :key="img.uuid"
            :media="img"
            image-size="preview"
            aspect="auto"
            fallback-aspect="3 / 4"
            :cache-buster="cacheBusters[img.uuid]"
            selectable
            :selected="isSelected(img)"
            :current="isCurrent(img)"
            :show-job-count="showJobCount"
            :job-count="jobCounts[img.uuid] || 0"
            :enable-favorite="enableFavorite"
            :enable-rotate="enableRotate"
            :rotating="isRotating(img)"
            @click="$emit('click', img)"
            @favorite="(_m, v) => $emit('favoriteToggle', img, v)"
            @rotate="$emit('rotate', img)"
          />
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
  cacheBusters: { type: Object, default: () => ({}) },
  // Cap the auto-computed column count. Half-width consumers (e.g. the i2v
  // source picker, which sits in a 2-column layout) pass a small value here so
  // tiles render larger instead of inheriting the full-viewport ladder.
  maxColumns: { type: Number, default: null }
})

defineEmits(['click', 'rotate', 'favoriteToggle'])

const rootRef = ref(null)
const sentinelRef = ref(null)
const visibleCount = ref(props.initialBatch)

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
  if (props.maxColumns) columnCount.value = Math.min(columnCount.value, props.maxColumns)
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
