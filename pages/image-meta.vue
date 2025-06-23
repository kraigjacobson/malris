<template>
  <div class="container mx-auto p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">AI Job Image Metadata</h1>
      <div v-if="user" class="flex items-center space-x-4">
        <span class="text-sm text-neutral-600">{{ user.email }}</span>
        <button
class="px-3 py-1 text-sm bg-neutral-200 text-neutral-700 rounded hover:bg-neutral-300 transition-colors"
          @click="handleSignOut">
          Sign Out
        </button>
      </div>
    </div>

    <!-- Search and Filter Section -->
    <div class="bg-neutral-50 p-4 rounded-lg border border-neutral-200 mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-2">Search Filename</label>
          <input
v-model="searchQuery" type="text" placeholder="Search by filename..."
            class="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500" >
        </div>
        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-2">Filter by Purpose</label>
          <select
v-model="purposeFilter"
            class="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500">
            <option value="">All Purposes</option>
            <option value="src">Source</option>
            <option value="dest">Destination</option>
            <option value="test">Test</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-2">Filter by Status</label>
          <input
v-model="statusFilter" type="text" placeholder="Filter by status..."
            class="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500" >
        </div>
      </div>
      <div class="mt-4 flex justify-between items-center">
        <p class="text-sm text-neutral-600">
          Showing {{ paginatedResults.length }} of {{ filteredResults.length }} results
        </p>
        <div class="flex items-center space-x-2">
          <label class="text-sm text-neutral-600">Items per page:</label>
          <select v-model="itemsPerPage" class="px-2 py-1 border border-neutral-300 rounded text-sm">
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="!hasLoaded && !pending" class="text-center py-8">
      <button
        @click="loadData"
        class="px-4 py-2 bg-neutral-800 text-white rounded hover:bg-neutral-700 transition-colors"
      >
        Load Image Metadata
      </button>
    </div>

    <div v-else-if="pending" class="text-center">
      <p>Loading image metadata...</p>
    </div>

    <div v-else-if="error" class="text-red-500">
      <p>Error loading data: {{ error }}</p>
      <button
        @click="loadData"
        class="mt-2 px-4 py-2 bg-neutral-800 text-white rounded hover:bg-neutral-700 transition-colors"
      >
        Retry
      </button>
    </div>

    <div v-else-if="hasLoaded" class="space-y-6">
      <div
v-for="image in paginatedResults" :key="image.uuid"
        class="bg-neutral-50 shadow-lg rounded-lg p-6 border border-neutral-200">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h2 class="text-xl font-semibold mb-2 text-neutral-900">{{ image.filename }}</h2>
            <p class="text-neutral-600 mb-2">UUID: {{ image.uuid }}</p>
            <p class="text-neutral-600 mb-2">Dimensions: {{ image.width }} x {{ image.height }}</p>
            <p class="text-neutral-600 mb-2">Purpose:
              <span class="px-2 py-1 bg-neutral-200 text-neutral-800 rounded text-sm">{{ image.purpose }}</span>
            </p>
            <p v-if="image.status" class="text-neutral-600 mb-2">Status:
              <span class="px-2 py-1 bg-neutral-300 text-neutral-900 rounded text-sm">{{ image.status }}</span>
            </p>
          </div>

          <div>
            <h3 class="font-semibold mb-2 text-neutral-900">Subject Information</h3>
            <div
v-if="getSubjectByUUID(image.subjectUUID)"
              class="bg-neutral-100 p-3 rounded border border-neutral-200">
              <p class="font-medium text-neutral-900">{{ getSubjectByUUID(image.subjectUUID).name }}</p>
              <div v-if="getSubjectByUUID(image.subjectUUID).tags" class="mt-2">
                <span
v-for="tag in getSubjectByUUID(image.subjectUUID).tags" :key="tag"
                  class="inline-block px-2 py-1 bg-neutral-200 text-neutral-700 rounded text-xs mr-1 mb-1">
                  {{ tag }}
                </span>
              </div>
            </div>

            <div v-if="image.tags && image.tags.length > 0" class="mt-4">
              <h4 class="font-semibold mb-2 text-neutral-900">Image Tags</h4>
              <div>
                <span
v-for="tag in image.tags" :key="tag"
                  class="inline-block px-2 py-1 bg-neutral-300 text-neutral-800 rounded text-xs mr-1 mb-1">
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-4 text-sm text-neutral-500">
          <p>Created: {{ new Date(image.createdAt).toLocaleString() }}</p>
          <p>Updated: {{ new Date(image.updatedAt).toLocaleString() }}</p>
          <p v-if="image.baseImageUUID">Base Image: {{ image.baseImageUUID }}</p>
        </div>
      </div>

      <!-- Pagination Controls -->
      <div v-if="totalPages > 1" class="flex justify-center items-center space-x-2 mt-6">
        <button
:disabled="currentPage === 1" class="px-3 py-2 border border-neutral-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-100"
          @click="currentPage = Math.max(1, currentPage - 1)">
          Previous
        </button>

        <span v-for="page in visiblePages" :key="page" class="mx-1">
          <button
v-if="page !== '...'" :class="[
            'px-3 py-2 border rounded-md',
            currentPage === page
              ? 'bg-neutral-800 text-white border-neutral-800'
              : 'border-neutral-300 hover:bg-neutral-100'
          ]" @click="currentPage = page">
            {{ page }}
          </button>
          <span v-else class="px-3 py-2">...</span>
        </span>

        <button
:disabled="currentPage === totalPages" class="px-3 py-2 border border-neutral-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-100"
          @click="currentPage = Math.min(totalPages, currentPage + 1)">
          Next
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// Authentication check
const user = useSupabaseUser()

// Initialize reactive data without automatic fetching
const allImageMeta = ref([])
const subjects = ref([])
const pending = ref(false)
const error = ref(null)
const hasLoaded = ref(false)

// Function to load data when needed
const loadData = async () => {
  if (hasLoaded.value) return // Don't reload if already loaded
  
  pending.value = true
  error.value = null
  
  try {
    const [imageMetaResponse, subjectsResponse] = await Promise.all([
      $fetch('/api/content/image-meta'),
      $fetch('/api/content/subjects')
    ])
    
    allImageMeta.value = imageMetaResponse
    subjects.value = subjectsResponse
    hasLoaded.value = true
  } catch (err) {
    error.value = err
  } finally {
    pending.value = false
  }
}

// Reactive search and filter variables
const searchQuery = ref('')
const purposeFilter = ref('')
const statusFilter = ref('')
const currentPage = ref(1)
const itemsPerPage = ref(10)

// Computed filtered results
const filteredResults = computed(() => {
  if (!allImageMeta.value) return []

  return allImageMeta.value.filter(image => {
    const matchesSearch = !searchQuery.value ||
      image.filename.toLowerCase().includes(searchQuery.value.toLowerCase())

    const matchesPurpose = !purposeFilter.value ||
      image.purpose === purposeFilter.value

    const matchesStatus = !statusFilter.value ||
      (image.status && image.status.toLowerCase().includes(statusFilter.value.toLowerCase()))

    return matchesSearch && matchesPurpose && matchesStatus
  })
})

// Computed pagination
const totalPages = computed(() => Math.ceil(filteredResults.value.length / itemsPerPage.value))

const paginatedResults = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return filteredResults.value.slice(start, end)
})

// Computed visible page numbers for pagination
const visiblePages = computed(() => {
  const pages = []
  const total = totalPages.value
  const current = currentPage.value

  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i)
      pages.push('...')
      pages.push(total)
    } else if (current >= total - 3) {
      pages.push(1)
      pages.push('...')
      for (let i = total - 4; i <= total; i++) pages.push(i)
    } else {
      pages.push(1)
      pages.push('...')
      for (let i = current - 1; i <= current + 1; i++) pages.push(i)
      pages.push('...')
      pages.push(total)
    }
  }

  return pages
})

// Helper function to get subject by UUID
const getSubjectByUUID = (uuid) => {
  return subjects.value?.find(subject => subject.uuid === uuid)
}

// Handle sign out
const supabase = useSupabaseClient()
const handleSignOut = async () => {
  await supabase.auth.signOut()
  await navigateTo('/login')
}

// Reset to first page when filters change
watch([searchQuery, purposeFilter, statusFilter], () => {
  currentPage.value = 1
})

// Set page meta
useHead({
  title: 'AI Job Image Metadata',
  meta: [
    { name: 'description', content: 'Track and manage AI job image metadata' }
  ]
})
</script>