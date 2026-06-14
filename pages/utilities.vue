<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">System Utilities</h1>

      <div class="space-y-6">
        <!-- Tag All Untagged Videos Card - Full Width -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-tag" class="w-8 h-8 text-blue-500 mr-3" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">AI Media Tagging</h2>
          </div>

          <!-- Queue Status Display -->
          <div v-if="queueStatus" class="mb-6 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-6 flex items-center">
              <UIcon name="i-heroicons-queue-list" class="w-5 h-5 mr-3 text-indigo-500" />
              Tagging Queue Status
            </h3>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                  {{ queueStatus.totalUntagged }}
                </div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">
                  Untagged<br /><span class="text-xs opacity-75">{{ currentPurposeLabel }}</span>
                </div>
              </div>

              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold text-amber-600 dark:text-amber-400 mb-2">
                  {{ queueStatus.queueLength }}
                </div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">In<br />Queue</div>
              </div>

              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold mb-2" :class="queueStatus.isProcessing ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'">
                  {{ queueStatus.isProcessing ? 'YES' : 'NO' }}
                </div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">Processing</div>
              </div>

              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold text-violet-600 dark:text-violet-400 mb-2">{{ queueStatus.currentBatch.processed }}/{{ queueStatus.currentBatch.total }}</div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">Current<br />Batch</div>
              </div>
            </div>

            <!-- Progress Bar for Current Batch -->
            <div v-if="queueStatus.currentBatch.total > 0" class="mt-6 bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div class="flex justify-between items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                <span class="flex items-center">
                  <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 mr-2 text-indigo-500" />
                  Batch Progress
                </span>
                <span class="text-lg font-bold text-indigo-600 dark:text-indigo-400"> {{ Math.round((queueStatus.currentBatch.processed / queueStatus.currentBatch.total) * 100) }}% </span>
              </div>
              <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out" :style="{ width: `${(queueStatus.currentBatch.processed / queueStatus.currentBatch.total) * 100}%` }"></div>
              </div>
              <div v-if="queueStatus.currentBatch.errors > 0" class="flex items-center mt-3 text-rose-600 dark:text-rose-400 text-sm font-medium">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 mr-2" />
                {{ queueStatus.currentBatch.errors }} error{{ queueStatus.currentBatch.errors !== 1 ? 's' : '' }}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"> Per Batch (1-200) </label>
              <UInput v-model.number="batchSize" type="number" :min="1" :max="200" placeholder="24" class="w-full" />
              <p class="text-xs text-gray-500 mt-1">Items per ComfyUI job</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"> Total (1-10000) </label>
              <UInput v-model.number="totalLimit" type="number" :min="1" :max="10000" placeholder="2000" class="w-full" />
              <p class="text-xs text-gray-500 mt-1">Total items to queue</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"> Purpose </label>
              <USelect v-model="taggingPurpose" :items="taggingPurposeOptions" class="w-full" />
              <p class="text-xs text-gray-500 mt-1">Untagged only</p>
            </div>
          </div>

          <div class="flex justify-end">
            <UButton :loading="isTagging" :disabled="isTagging" color="primary" size="lg" @click="tagAllUntaggedVideos">
              <UIcon name="i-heroicons-tag" class="mr-2" />
              {{ isTagging ? 'Queueing batches...' : `Queue ${plannedBatchCount} batch${plannedBatchCount === 1 ? '' : 'es'} (${effectiveTotal} items)` }}
            </UButton>
          </div>

          <div v-if="lastTaggingResult" class="mt-4 p-3 rounded-md" :class="lastTaggingResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
            <p class="text-sm">{{ lastTaggingResult.message }}</p>
            <div v-if="lastTaggingResult.success && lastTaggingResult.totalRemaining !== undefined" class="mt-2 text-xs opacity-75">
              <div>Items remaining after this run: {{ lastTaggingResult.totalRemaining }}</div>
            </div>
          </div>
        </div>

        <!-- Single Video Tagging Card -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-play-circle" class="w-8 h-8 text-green-500 mr-3" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Single Video Tagging (Test)</h2>
          </div>

          <p class="text-gray-600 dark:text-gray-400 mb-4">
            Queue a single dest video for AI tagging. Extracts a frame 10% into the video and sends to WD14 Tagger.
            Tags are filtered to our allowed list.
          </p>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Video UUID</label>
            <UInput v-model="singleTaggingUuid" placeholder="Enter dest video UUID" class="w-full font-mono text-sm" />
          </div>

          <div class="flex justify-end">
            <UButton :loading="isSingleTagging" :disabled="isSingleTagging || !singleTaggingUuid" color="success" size="lg" @click="queueSingleVideoTagging">
              <UIcon name="i-heroicons-tag" class="mr-2" />
              {{ isSingleTagging ? 'Queueing...' : 'Queue for Tagging' }}
            </UButton>
          </div>

          <div v-if="lastSingleTaggingResult" class="mt-4 p-3 rounded-md" :class="lastSingleTaggingResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
            <p class="text-sm">{{ lastSingleTaggingResult.message }}</p>
            <div v-if="lastSingleTaggingResult.jobId" class="mt-2 text-xs opacity-75 font-mono">
              Job ID: {{ lastSingleTaggingResult.jobId }}
            </div>
          </div>
        </div>

        <!-- Thumbnail Regeneration Card -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-photo" class="w-8 h-8 text-purple-500 mr-3" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Thumbnail Regeneration</h2>
          </div>

          <p class="text-gray-600 dark:text-gray-400 mb-6">Regenerate thumbnails for destination videos and populate missing metadata using ffprobe analysis.</p>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"> Batch Size (1-100) </label>
            <UInput v-model.number="thumbnailBatchSize" type="number" :min="1" :max="100" placeholder="50" class="w-full" />
          </div>

          <div class="flex justify-end">
            <UButton :loading="isRegeneratingThumbnails" :disabled="isRegeneratingThumbnails" color="primary" size="lg" @click="regenerateThumbnails">
              <UIcon name="i-heroicons-photo" class="mr-2" />
              {{ isRegeneratingThumbnails ? 'Processing...' : `Regenerate Next ${thumbnailBatchSize} Thumbnails` }}
            </UButton>
          </div>

          <div v-if="lastThumbnailResult" class="mt-4 p-3 rounded-md" :class="lastThumbnailResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
            <p class="text-sm">{{ lastThumbnailResult.message }}</p>
            <div v-if="lastThumbnailResult.success && lastThumbnailResult.remainingWithoutMetadata !== undefined" class="mt-2 text-xs opacity-75">
              <div>Videos without metadata remaining: {{ lastThumbnailResult.remainingWithoutMetadata }}</div>
            </div>
          </div>
        </div>

        <!-- Orphaned Images Cleanup Card -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-trash" class="w-8 h-8 text-red-500 mr-3" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Orphaned Images Cleanup</h2>
          </div>
          <p class="text-gray-600 dark:text-gray-400 mb-6">Delete orphaned output images from completed/failed jobs that are not being used as thumbnails.</p>

          <!-- Orphan Count Display -->
          <div v-if="orphanCount !== null" class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <UIcon name="i-heroicons-photo" class="w-5 h-5 text-blue-500 mr-2" />
                <span class="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {{ cleanupStatus?.running ? 'Orphaned Images Remaining:' : 'Orphaned Images Found:' }}
                </span>
              </div>
              <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {{ orphanCount.toLocaleString() }}
              </span>
            </div>
          </div>
          <div class="flex justify-end gap-3">
            <UButton v-if="cleanupStatus?.running" :loading="isCanceling" :disabled="isCanceling" color="error" size="lg" @click="cancelCleanup">
              <UIcon name="i-heroicons-x-circle" class="mr-2" />
              {{ isCanceling ? 'Canceling...' : 'Cancel Cleanup' }}
            </UButton>
            <UButton v-else :loading="isStartingCleanup" :disabled="isStartingCleanup || cleanupStatus?.running" color="error" size="lg" @click="startCleanup">
              <UIcon name="i-heroicons-trash" class="mr-2" />
              {{ isStartingCleanup ? 'Starting...' : 'Start Cleanup' }}
            </UButton>
          </div>

          <div v-if="lastCleanupResult" class="mt-4 p-3 rounded-md" :class="lastCleanupResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
            <p class="text-sm">{{ lastCleanupResult.message }}</p>
          </div>
        </div>

        <!-- Duplicate Image Finder Card -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-square-2-stack" class="w-8 h-8 text-amber-500 mr-3" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Duplicate Image Finder</h2>
          </div>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Finds visually-duplicate images (re-encodes, resizes, and partial crops) that the byte-exact upload
            dedup can't catch. Step 1 fingerprints images (perceptual hashes); step 2 compares them and flags
            suspected duplicates for side-by-side review.
          </p>

          <!-- Coverage -->
          <div v-if="dedupStatus" class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <div v-for="c in dedupStatus.coverage.filter(c => c.purpose !== 'thumbnail')" :key="c.purpose"
              class="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200 dark:border-slate-700">
              <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">{{ c.hashed }}<span class="text-sm text-slate-400">/{{ c.total }}</span></div>
              <div class="text-xs font-medium text-slate-500 dark:text-slate-400 capitalize">{{ c.purpose }} hashed</div>
            </div>
            <div class="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-center border border-slate-200 dark:border-slate-700">
              <div class="text-2xl font-bold text-rose-600 dark:text-rose-400">{{ dedupStatus.pairs.pending }}</div>
              <div class="text-xs font-medium text-slate-500 dark:text-slate-400">pending pairs</div>
            </div>
          </div>

          <!-- Options -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Image type</label>
              <USelect v-model="dedupPurpose" :items="dedupPurposeOptions" class="w-full" />
            </div>
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 text-sm"><input v-model="dedupWithinSubject" type="checkbox" class="rounded" /> only compare within the same subject (recommended)</label>
              <label class="flex items-center gap-2 text-sm"><input v-model="dedupForce" type="checkbox" class="rounded" /> force re-hash already-hashed images</label>
              <label class="flex items-center gap-2 text-sm">
                <span>auto-dismiss different frames above</span>
                <UInput v-model.number="dedupRefineThreshold" type="number" :min="0" :max="100" :step="0.5" size="xs" class="w-16" />
                <span>% pixel diff</span>
              </label>
            </div>
          </div>

          <!-- Progress bars -->
          <div v-if="dedupStatus?.hashing?.running || dedupStatus?.finding?.running || dedupStatus?.refining?.running" class="mb-4 space-y-3">
            <div v-if="dedupStatus.hashing.running">
              <div class="flex justify-between text-xs text-gray-500 mb-1"><span>Hashing…</span><span>{{ dedupStatus.hashing.processed }}/{{ dedupStatus.hashing.total }} ({{ dedupStatus.hashing.errors }} err)</span></div>
              <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2"><div class="bg-amber-500 h-2 rounded-full transition-all" :style="{ width: pct(dedupStatus.hashing) }"></div></div>
            </div>
            <div v-if="dedupStatus.finding.running">
              <div class="flex justify-between text-xs text-gray-500 mb-1"><span>Comparing…</span><span>{{ dedupStatus.finding.processed }}/{{ dedupStatus.finding.total }} groups</span></div>
              <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2"><div class="bg-purple-500 h-2 rounded-full transition-all" :style="{ width: pct(dedupStatus.finding) }"></div></div>
            </div>
            <div v-if="dedupStatus.refining.running">
              <div class="flex justify-between text-xs text-gray-500 mb-1"><span>Refining (pixel diff)…</span><span>{{ dedupStatus.refining.processed }}/{{ dedupStatus.refining.total }} images</span></div>
              <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2"><div class="bg-cyan-500 h-2 rounded-full transition-all" :style="{ width: pct(dedupStatus.refining) }"></div></div>
            </div>
          </div>

          <div class="flex flex-wrap justify-end gap-3">
            <UButton :loading="isComputingHashes" :disabled="isComputingHashes || dedupStatus?.hashing?.running" color="warning" variant="soft" size="lg" @click="computeDedupHashes">
              <UIcon name="i-heroicons-finger-print" class="mr-2" /> 1. Compute Hashes
            </UButton>
            <UButton :loading="isFindingPairs" :disabled="isFindingPairs || dedupStatus?.finding?.running" color="primary" size="lg" @click="findDedupPairs">
              <UIcon name="i-heroicons-magnifying-glass" class="mr-2" /> 2. Find Pairs
            </UButton>
            <UButton :loading="isRefining" :disabled="isRefining || dedupStatus?.refining?.running" color="info" variant="soft" size="lg" @click="refineDedup">
              <UIcon name="i-heroicons-funnel" class="mr-2" /> 3. Refine ({{ dedupRefineThreshold }}%)
            </UButton>
            <UButton :to="'/duplicates'" color="error" variant="soft" size="lg">
              <UIcon name="i-heroicons-square-2-stack" class="mr-2" /> Review {{ dedupStatus?.pairs?.pending ?? 0 }} →
            </UButton>
          </div>

          <div v-if="lastDedupResult" class="mt-4 p-3 rounded-md" :class="lastDedupResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
            <p class="text-sm">{{ lastDedupResult.message }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Page metadata
definePageMeta({
  title: 'System Utilities'
})

// Reactive state
const isTagging = ref(false)
const batchSize = ref(24) // Items per ComfyUI tagging job
const totalLimit = ref(2000) // Total items to queue across all batches
const taggingPurpose = ref<string>('any')
const taggingPurposeOptions = [
  { label: 'All taggable (default)', value: 'any' },
  { label: 'Source images', value: 'source' },
  { label: 'Dest images / videos', value: 'dest' },
  { label: 'Output videos', value: 'output' },
  { label: 'Subject', value: 'subject' },
  { label: 'Thumbnail', value: 'thumbnail' },
  { label: 'Voyeur', value: 'voyeur' },
  { label: 'Porn', value: 'porn' },
  { label: 'Todo', value: 'todo' }
]
const currentPurposeLabel = computed(() => {
  const opt = taggingPurposeOptions.find(o => o.value === taggingPurpose.value)
  return opt?.label ?? 'All taggable'
})
const effectiveTotal = computed(() => Math.max(Math.min(totalLimit.value || 0, 10000), batchSize.value || 1))
const plannedBatchCount = computed(() => {
  const bs = Math.max(batchSize.value || 1, 1)
  return Math.max(Math.ceil(effectiveTotal.value / bs), 1)
})
const lastTaggingResult = ref<{ success: boolean; message: string; totalRemaining?: number } | null>(null)
const queueStatus = ref<{
  totalUntagged: number
  queueLength: number
  isProcessing: boolean
  currentBatch: { processed: number; total: number; errors: number }
} | null>(null)

// Single video tagging state
const singleTaggingUuid = ref('')
const isSingleTagging = ref(false)
const lastSingleTaggingResult = ref<{ success: boolean; message: string; jobId?: string } | null>(null)

// Thumbnail regeneration state
const isRegeneratingThumbnails = ref(false)
const thumbnailBatchSize = ref(50) // Default to 50
const lastThumbnailResult = ref<{ success: boolean; message: string; remainingWithoutMetadata?: number } | null>(null)

// Orphaned images cleanup state
const isStartingCleanup = ref(false)
const isCanceling = ref(false)
const lastCleanupResult = ref<{ success: boolean; message: string } | null>(null)
const orphanCount = ref<number | null>(null)
const cleanupStatus = ref<{
  running: boolean
  progress: number
  total: number
  deleted: number
  startTime: string | null
  lastUpdate: string | null
  error: string | null
} | null>(null)

// Duplicate image finder state
interface DedupProgress { running: boolean; processed: number; total: number; errors: number; message: string }
const dedupStatus = ref<{
  hashing: DedupProgress
  finding: DedupProgress
  refining: DedupProgress
  coverage: { purpose: string; total: number; hashed: number }[]
  pairs: { pending: number; dismissed: number; resolved: number }
} | null>(null)
const dedupPurpose = ref<string>('dest')
const dedupPurposeOptions = [
  { label: 'Dest images', value: 'dest' },
  { label: 'Source images', value: 'source' }
]
const dedupWithinSubject = ref(true)
const dedupForce = ref(false)
const dedupRefineThreshold = ref(3)
const isComputingHashes = ref(false)
const isFindingPairs = ref(false)
const isRefining = ref(false)
const lastDedupResult = ref<{ success: boolean; message: string } | null>(null)
const pct = (p: { processed: number; total: number }) => (p.total ? `${Math.round((p.processed / p.total) * 100)}%` : '0%')

// Auto-refresh management
let refreshInterval: NodeJS.Timeout | null = null
let cleanupRefreshInterval: NodeJS.Timeout | null = null
let dedupRefreshInterval: NodeJS.Timeout | null = null

// Auto-refresh queue status every 2 seconds. `taggingPurpose` is passed as a
// reactive query param so changing the dropdown auto-refetches the count.
const { data: queueData, refresh: refreshQueue } = await useFetch('/api/media/tagging-queue-status', {
  server: false,
  default: () => null,
  query: { purpose: taggingPurpose },
  transform: (data: any) => data
})

// Watch for queue data changes
watch(
  queueData,
  newData => {
    if (newData?.success) {
      queueStatus.value = {
        totalUntagged: newData.totalUntagged,
        queueLength: newData.queueLength,
        isProcessing: newData.isProcessing,
        currentBatch: newData.currentBatch
      }

      // Manage refresh interval based on queue activity
      const hasActivity = newData.queueLength > 0 || newData.isProcessing || newData.currentBatch.total > 0

      if (hasActivity && !refreshInterval) {
        // Start refreshing when there's activity
        console.log('🔄 Starting queue status refresh')
        refreshInterval = setInterval(() => {
          refreshQueue()
        }, 2000)
      } else if (!hasActivity && refreshInterval) {
        // Stop refreshing when queue is empty and nothing is processing
        console.log('⏸️ Stopping queue status refresh - no activity')
        clearInterval(refreshInterval)
        refreshInterval = null
      }
    }
  },
  { immediate: true }
)

onMounted(() => {
  // Initial refresh to check if we need to start the interval
  refreshQueue()
  // Initial cleanup status and orphan count fetch
  fetchCleanupStatus()
  fetchOrphanCount()
  // Initial dedup status
  fetchDedupStatus()
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
  if (cleanupRefreshInterval) {
    clearInterval(cleanupRefreshInterval)
    cleanupRefreshInterval = null
  }
  if (dedupRefreshInterval) {
    clearInterval(dedupRefreshInterval)
    dedupRefreshInterval = null
  }
})

// Fetch dedup status; self-manages a poll interval while a job is running.
const fetchDedupStatus = async () => {
  try {
    dedupStatus.value = await $fetch('/api/media/dedup/status')
    const active = dedupStatus.value?.hashing?.running || dedupStatus.value?.finding?.running || dedupStatus.value?.refining?.running
    if (active && !dedupRefreshInterval) {
      dedupRefreshInterval = setInterval(fetchDedupStatus, 1500)
    } else if (!active && dedupRefreshInterval) {
      clearInterval(dedupRefreshInterval)
      dedupRefreshInterval = null
    }
  } catch {
    /* status is best-effort */
  }
}

const computeDedupHashes = async () => {
  isComputingHashes.value = true
  lastDedupResult.value = null
  try {
    const res = await $fetch<{ success: boolean; message: string }>('/api/media/dedup/compute-hashes', {
      method: 'POST',
      body: { purposes: [dedupPurpose.value], force: dedupForce.value, batchSize: 4 }
    })
    lastDedupResult.value = { success: res.success, message: res.message }
    fetchDedupStatus()
  } catch (e: any) {
    lastDedupResult.value = { success: false, message: e?.data?.statusMessage || e?.message || 'Failed to start hashing' }
  } finally {
    isComputingHashes.value = false
  }
}

const findDedupPairs = async () => {
  isFindingPairs.value = true
  lastDedupResult.value = null
  try {
    const res = await $fetch<{ success: boolean; message: string }>('/api/media/dedup/find-pairs', {
      method: 'POST',
      body: { purposes: [dedupPurpose.value], withinSubject: dedupWithinSubject.value }
    })
    lastDedupResult.value = { success: res.success, message: res.message }
    fetchDedupStatus()
  } catch (e: any) {
    lastDedupResult.value = { success: false, message: e?.data?.statusMessage || e?.message || 'Failed to start comparison' }
  } finally {
    isFindingPairs.value = false
  }
}

const refineDedup = async () => {
  isRefining.value = true
  lastDedupResult.value = null
  try {
    const res = await $fetch<{ success: boolean; message: string }>('/api/media/dedup/refine', {
      method: 'POST',
      body: { purpose: dedupPurpose.value, action: 'compute', autoApplyThreshold: dedupRefineThreshold.value }
    })
    lastDedupResult.value = { success: res.success, message: res.message }
    fetchDedupStatus()
  } catch (e: any) {
    lastDedupResult.value = { success: false, message: e?.data?.statusMessage || e?.message || 'Failed to start refine' }
  } finally {
    isRefining.value = false
  }
}

// Fetch cleanup status
const fetchCleanupStatus = async () => {
  try {
    const response = await $fetch<{
      running: boolean
      progress: number | null
      total: number | null
      deleted: number | null
      startTime: string | null
      lastUpdate: string | null
      error: string | null
    }>('/api/cleanup/orphaned-images/status')

    cleanupStatus.value = {
      running: response.running,
      progress: response.progress || 0,
      total: response.total || 0,
      deleted: response.deleted || 0,
      startTime: response.startTime,
      lastUpdate: response.lastUpdate,
      error: response.error
    }

    // Manage cleanup refresh interval
    if (response.running && !cleanupRefreshInterval) {
      console.log('🔄 Starting cleanup status refresh')
      cleanupRefreshInterval = setInterval(() => {
        fetchCleanupStatus()
      }, 1000) // Refresh every second during cleanup
    } else if (!response.running && cleanupRefreshInterval) {
      console.log('⏸️ Stopping cleanup status refresh')
      clearInterval(cleanupRefreshInterval)
      cleanupRefreshInterval = null
      // Refresh orphan count when cleanup completes
      fetchOrphanCount()
    }
  } catch (error) {
    console.error('Error fetching cleanup status:', error)
  }
}

// Fetch orphan count
const fetchOrphanCount = async () => {
  try {
    const response = await $fetch<{
      success: boolean
      count: number
      isRunning: boolean
    }>('/api/cleanup/orphaned-images/count')

    if (response.success) {
      orphanCount.value = response.count

      // If cleanup is running, start fetching status
      if (response.isRunning) {
        fetchCleanupStatus()
      }
    }
  } catch (error) {
    console.error('Error fetching orphan count:', error)
  }
}

// Function to queue untagged media in batches (background dispatch)
const tagAllUntaggedVideos = async () => {
  try {
    isTagging.value = true
    lastTaggingResult.value = null

    const toast = useToast()

    toast.add({
      title: 'Queueing AI Tagging',
      description: `Up to ${effectiveTotal.value} item(s) in batches of ${batchSize.value}...`,
      icon: 'i-heroicons-tag'
    })

    const response = await $fetch<{
      success: boolean
      count: number
      batches: number
      totalRemaining: number
      hasMore: boolean
      message: string
    }>('/api/media/tag-all-untagged', {
      method: 'POST',
      body: {
        batchSize: batchSize.value,
        totalLimit: effectiveTotal.value,
        purpose: taggingPurpose.value
      }
    })

    if (!response.success) {
      throw new Error(response.message)
    }

    lastTaggingResult.value = {
      success: response.success,
      message: response.message,
      totalRemaining: response.totalRemaining
    }

    toast.add({
      title: 'Batches Queued',
      description: `${response.count} item(s) across ${response.batches} batch(es). ${response.totalRemaining} remaining after this run.`,
      icon: 'i-heroicons-check-circle',
      color: 'success'
    })

    refreshQueue()
  } catch (error: any) {
    const toast = useToast()

    lastTaggingResult.value = {
      success: false,
      message: error?.message || 'Failed to start tagging process'
    }

    toast.add({
      title: 'Tagging Failed',
      description: error?.message || 'Failed to start tagging process',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'error'
    })
    console.error('Error tagging media:', error)
  } finally {
    isTagging.value = false
  }
}

// Function to queue single video for tagging (test)
const queueSingleVideoTagging = async () => {
  if (!singleTaggingUuid.value.trim()) return

  try {
    isSingleTagging.value = true
    lastSingleTaggingResult.value = null

    const toast = useToast()

    toast.add({
      title: 'Queueing Tagging Job',
      description: `Extracting frame and sending to AI tagger...`,
      icon: 'i-heroicons-tag'
    })

    const response = await $fetch<{
      success: boolean
      message: string
      jobId?: string
    }>(`/api/media/${singleTaggingUuid.value.trim()}/queue-tagging`, {
      method: 'POST'
    })

    lastSingleTaggingResult.value = {
      success: response.success,
      message: response.message,
      jobId: response.jobId
    }

    if (response.success) {
      toast.add({
        title: 'Tagging Job Queued',
        description: response.message,
        icon: 'i-heroicons-check-circle',
        color: 'success'
      })
    } else {
      toast.add({
        title: 'Tagging Failed',
        description: response.message,
        icon: 'i-heroicons-exclamation-triangle',
        color: 'warning'
      })
    }
  } catch (error: any) {
    const toast = useToast()

    lastSingleTaggingResult.value = {
      success: false,
      message: error?.data?.message || error?.message || 'Failed to queue tagging job'
    }

    toast.add({
      title: 'Tagging Failed',
      description: error?.data?.message || error?.message || 'Failed to queue tagging job',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'error'
    })
    console.error('Error queueing tagging job:', error)
  } finally {
    isSingleTagging.value = false
  }
}

// Function to regenerate thumbnails
const regenerateThumbnails = async () => {
  try {
    isRegeneratingThumbnails.value = true
    lastThumbnailResult.value = null

    const toast = useToast()

    // Show loading toast
    toast.add({
      title: 'Starting Thumbnail Regeneration',
      description: `Processing next batch of ${thumbnailBatchSize.value} videos...`,
      icon: 'i-heroicons-photo'
    })

    // Call the API to regenerate thumbnails
    const response = await $fetch<{
      success: boolean
      processed: number
      remainingWithoutMetadata: number
      message: string
    }>('/api/media/regenerate-thumbnails', {
      method: 'POST',
      body: {
        batchSize: thumbnailBatchSize.value
      }
    })

    if (!response.success) {
      throw new Error(response.message)
    }

    // Store result for display
    lastThumbnailResult.value = {
      success: response.success,
      message: response.message,
      remainingWithoutMetadata: response.remainingWithoutMetadata
    }

    // Show success toast
    toast.add({
      title: 'Thumbnails Regenerated',
      description: `Processed ${response.processed} videos. ${response.remainingWithoutMetadata} videos without metadata remaining.`,
      icon: 'i-heroicons-check-circle',
      color: 'success'
    })
  } catch (error: any) {
    const toast = useToast()

    // Store error result
    lastThumbnailResult.value = {
      success: false,
      message: error?.message || 'Failed to regenerate thumbnails'
    }

    toast.add({
      title: 'Thumbnail Regeneration Failed',
      description: error?.message || 'Failed to regenerate thumbnails',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'error'
    })
    console.error('Error regenerating thumbnails:', error)
  } finally {
    isRegeneratingThumbnails.value = false
  }
}

// Function to start cleanup
const startCleanup = async () => {
  try {
    isStartingCleanup.value = true
    lastCleanupResult.value = null

    const toast = useToast()

    toast.add({
      title: 'Starting Cleanup',
      description: 'Deleting orphaned output images...',
      icon: 'i-heroicons-trash'
    })

    const response = await $fetch<{
      success: boolean
      message: string
    }>('/api/cleanup/orphaned-images/start', {
      method: 'POST'
    })

    if (!response.success) {
      throw new Error(response.message)
    }

    lastCleanupResult.value = {
      success: response.success,
      message: response.message
    }

    toast.add({
      title: 'Cleanup Started',
      description: response.message,
      icon: 'i-heroicons-check-circle',
      color: 'success'
    })

    fetchCleanupStatus()
    // Refresh orphan count after starting
    setTimeout(() => fetchOrphanCount(), 2000)
  } catch (error: any) {
    const toast = useToast()

    lastCleanupResult.value = {
      success: false,
      message: error?.message || 'Failed to start cleanup'
    }

    toast.add({
      title: 'Cleanup Failed',
      description: error?.message || 'Failed to start cleanup',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'error'
    })
    console.error('Error starting cleanup:', error)
  } finally {
    isStartingCleanup.value = false
  }
}

// Function to cancel cleanup
const cancelCleanup = async () => {
  try {
    isCanceling.value = true

    const toast = useToast()

    toast.add({
      title: 'Canceling Cleanup',
      description: 'Requesting cleanup cancellation...',
      icon: 'i-heroicons-x-circle'
    })

    const response = await $fetch<{
      success: boolean
      message: string
    }>('/api/cleanup/orphaned-images/cancel', {
      method: 'POST'
    })

    if (!response.success) {
      throw new Error(response.message)
    }

    toast.add({
      title: 'Cancellation Requested',
      description: response.message,
      icon: 'i-heroicons-check-circle',
      color: 'success'
    })

    fetchCleanupStatus()
  } catch (error: any) {
    const toast = useToast()

    toast.add({
      title: 'Cancellation Failed',
      description: error?.message || 'Failed to cancel cleanup',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'error'
    })
    console.error('Error canceling cleanup:', error)
  } finally {
    isCanceling.value = false
  }
}
</script>
