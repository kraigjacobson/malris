<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
          <UIcon name="i-heroicons-square-2-stack" class="w-8 h-8 text-amber-500 mr-3" />
          Duplicate Review
        </h1>
        <NuxtLink to="/utilities" class="text-sm text-blue-500 hover:underline flex items-center">
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 mr-1" /> Utilities
        </NuxtLink>
      </div>

      <!-- Summary bar -->
      <div class="mb-6 flex flex-wrap items-center gap-4 text-sm">
        <div class="flex items-center gap-2">
          <span class="text-gray-500">Image type</span>
          <USelect v-model="reviewPurpose" :items="reviewPurposeOptions" size="sm" class="w-40" />
        </div>
        <span class="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
          {{ totalClusters }} clusters
        </span>
        <span v-if="cluster" class="text-gray-500">cluster {{ clusterOffset + 1 }} of {{ totalClusters }} · {{ cluster.size }} images</span>
        <span v-if="skipped > 0" class="text-gray-500">skipped {{ skipped }}</span>
        <UButton size="xs" variant="ghost" :loading="loading" @click="resetAndReload">
          <UIcon name="i-heroicons-arrow-path" class="mr-1" /> Refresh
        </UButton>
      </div>

      <!-- Empty / done -->
      <div v-if="!loading && !cluster" class="text-center py-20 text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-check-circle" class="w-16 h-16 mx-auto mb-4 text-green-500" />
        <p class="text-lg">
          {{ totalClusters === 0 ? 'No duplicate clusters for this type. Run a scan from Utilities.' : 'Reached the end of the clusters.' }}
        </p>
        <UButton v-if="clusterOffset > 0" class="mt-4" variant="soft" @click="resetAndReload">Start over from the top</UButton>
      </div>

      <!-- Cluster grid -->
      <div v-else-if="cluster">
        <!-- Action bar -->
        <div class="mb-6 p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-4">
          <div class="text-sm text-gray-600 dark:text-gray-300">
            Keeper: <span class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{{ keeperFilename }}</span>
            <span class="text-gray-400">({{ keeperJobs }} jobs)</span>
            — merging <span class="font-semibold">{{ mergeTargets.length }}</span> image(s) into it.
          </div>
          <div class="flex-1"></div>
          <UButton color="primary" size="lg" :loading="busy" :disabled="busy || mergeTargets.length === 0" @click="mergeCluster">
            <UIcon name="i-heroicons-arrows-pointing-in" class="mr-2" />
            Merge {{ mergeTargets.length }} → keeper
          </UButton>
          <UButton color="neutral" variant="soft" size="lg" :disabled="busy" @click="dismissCluster">
            <UIcon name="i-heroicons-hand-thumb-up" class="mr-2" /> Not duplicates
          </UButton>
          <UButton color="neutral" variant="ghost" size="lg" :disabled="busy" @click="skip">
            <UIcon name="i-heroicons-forward" class="mr-2" /> Skip
          </UButton>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <ClusterTile
            v-for="m in cluster.members"
            :key="m.uuid"
            :media="m"
            :is-keeper="m.uuid === keeperUuid"
            :excluded="excluded.has(m.uuid)"
            :busy="busy"
            @set-keeper="setKeeper(m.uuid)"
            @toggle-exclude="toggleExclude(m.uuid)"
          />
        </div>

        <div v-if="message" class="mt-6 text-center text-sm" :class="messageError ? 'text-red-500' : 'text-green-600 dark:text-green-400'">
          {{ message }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Duplicate Review' })

interface Member {
  uuid: string
  filename: string
  width: number | null
  height: number | null
  purpose: string
  rating: number | null
  favorite: boolean
  jobCount: number
}
interface Cluster {
  size: number
  keeperUuid: string
  members: Member[]
}

const reviewPurpose = ref<string>('dest')
const reviewPurposeOptions = [
  { label: 'Dest images', value: 'dest' },
  { label: 'Source images', value: 'source' },
]

const cluster = ref<Cluster | null>(null)
const totalClusters = ref(0)
const clusterOffset = ref(0)
const skipped = ref(0)
const keeperUuid = ref<string>('')
const excluded = ref<Set<string>>(new Set())
const loading = ref(false)
const busy = ref(false)
const message = ref('')
const messageError = ref(false)

const keeperMember = computed(() => cluster.value?.members.find((m) => m.uuid === keeperUuid.value) ?? null)
const keeperFilename = computed(() => keeperMember.value?.filename ?? '—')
const keeperJobs = computed(() => keeperMember.value?.jobCount ?? 0)
// Everything that isn't the keeper and isn't excluded gets merged into the keeper.
const mergeTargets = computed(() =>
  (cluster.value?.members ?? []).filter((m) => m.uuid !== keeperUuid.value && !excluded.value.has(m.uuid)).map((m) => m.uuid)
)

async function fetchCluster() {
  loading.value = true
  try {
    const res = await $fetch<{ clusters: Cluster[]; totalClusters: number }>('/api/media/dedup/clusters', {
      query: { status: 'pending', purpose: reviewPurpose.value, limit: 1, offset: clusterOffset.value },
    })
    totalClusters.value = res.totalClusters
    cluster.value = res.clusters[0] ?? null
    keeperUuid.value = cluster.value?.keeperUuid ?? ''
    excluded.value = new Set()
  } catch (e: any) {
    messageError.value = true
    message.value = e?.data?.statusMessage || e?.message || 'Failed to load clusters'
  } finally {
    loading.value = false
  }
}

function resetAndReload() {
  clusterOffset.value = 0
  skipped.value = 0
  message.value = ''
  fetchCluster()
}

function setKeeper(uuid: string) {
  keeperUuid.value = uuid
  excluded.value.delete(uuid) // keeper can't be excluded
  excluded.value = new Set(excluded.value)
}
function toggleExclude(uuid: string) {
  if (uuid === keeperUuid.value) return
  const next = new Set(excluded.value)
  next.has(uuid) ? next.delete(uuid) : next.add(uuid)
  excluded.value = next
}

async function mergeCluster() {
  if (!cluster.value || !keeperUuid.value || mergeTargets.value.length === 0) return
  busy.value = true
  message.value = ''
  messageError.value = false
  try {
    const res = await $fetch<{ mergedCount: number; reassignedJobRefs: number }>('/api/media/dedup/resolve-cluster', {
      method: 'POST',
      body: { action: 'merge', keeperUuid: keeperUuid.value, mergeUuids: mergeTargets.value },
    })
    message.value = `Merged ${res.mergedCount} image(s), reassigned ${res.reassignedJobRefs} job ref(s).`
    await fetchCluster()
  } catch (e: any) {
    messageError.value = true
    message.value = e?.data?.statusMessage || e?.message || 'Merge failed'
  } finally {
    busy.value = false
  }
}

async function dismissCluster() {
  if (!cluster.value) return
  busy.value = true
  message.value = ''
  messageError.value = false
  try {
    await $fetch('/api/media/dedup/resolve-cluster', {
      method: 'POST',
      body: { action: 'dismiss', uuids: cluster.value.members.map((m) => m.uuid) },
    })
    await fetchCluster()
  } catch (e: any) {
    messageError.value = true
    message.value = e?.data?.statusMessage || e?.message || 'Dismiss failed'
  } finally {
    busy.value = false
  }
}

function skip() {
  skipped.value++
  clusterOffset.value++
  fetchCluster()
}

watch(reviewPurpose, () => {
  clusterOffset.value = 0
  skipped.value = 0
  message.value = ''
  fetchCluster()
})

onMounted(fetchCluster)
</script>
