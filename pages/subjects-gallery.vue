<template>
  <div class="container mx-auto p-6 pb-24">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
        Subjects Gallery
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        Browse and search subjects with their associated media
      </p>
    </div>

    <!-- Search Filters -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
          Search Filters
        </h2>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Search Term -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search Name
          </label>
          <UInputMenu
            v-model="selectedSearchSubject"
            v-model:search-term="dropdownSearchTerm"
            :items="searchSubjectItems"
            placeholder="Search subjects by name..."
            class="w-full"
            by="value"
            option-attribute="label"
            searchable
            @update:model-value="handleSearchSubjectSelection"
          />
        </div>

        <!-- Tags Filter -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tags
          </label>
          <UInput
            v-model="filters.tags"
            placeholder="e.g., portrait, landscape"
            class="w-full"
          />
        </div>
      </div>

      <!-- Sort Options and Limit -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Sort By
          </label>
          <USelectMenu
            v-model="sortOptions.sort_by"
            :items="sortByOptions"
            placeholder="Sort by..."
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Sort Order
          </label>
          <USelectMenu
            v-model="sortOptions.sort_order"
            :items="sortOrderOptions"
            placeholder="Sort order..."
            class="w-full"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Results Per Page
          </label>
          <USelectMenu
            v-model="pagination.limit"
            :items="limitOptions"
            placeholder="Results per page..."
            class="w-full"
          />
        </div>
      </div>

      <div class="flex gap-4 mt-4">
        <UButton @click="searchSubjects" :loading="isLoading" color="primary">
          Search
        </UButton>
        <UButton @click="clearFilters" variant="outline">
          Clear
        </UButton>
      </div>
    </UCard>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
    </div>

    <!-- Results -->
    <div v-else-if="subjectResults.length > 0">
      <!-- Results Header -->
      <div class="flex justify-between items-center mb-4">
        <p class="text-gray-600 dark:text-gray-400">
          Found {{ pagination.total }} subjects
        </p>
        <div class="flex gap-2">
          <UButton
            @click="viewMode = 'grid'"
            :variant="viewMode === 'grid' ? 'solid' : 'outline'"
            size="sm"
          >
            <UIcon name="i-heroicons-squares-2x2" />
          </UButton>
          <UButton
            @click="viewMode = 'list'"
            :variant="viewMode === 'list' ? 'solid' : 'outline'"
            size="sm"
          >
            <UIcon name="i-heroicons-list-bullet" />
          </UButton>
        </div>
      </div>

      <!-- Grid View -->
      <div v-if="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div
          v-for="subject in subjectResults"
          :key="subject.id"
          class="bg-neutral-800 rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer"
          @click="openModal(subject)"
        >
          <!-- Hero Image Preview -->
          <div class="aspect-square bg-gray-100 dark:bg-gray-700 relative">
            <img
              v-if="subject.has_thumbnail && subject.thumbnail_data && settingsStore.displayImages"
              :src="`data:image/jpeg;base64,${subject.thumbnail_data}`"
              :alt="subject.name"
              class="w-full h-full object-cover"
              loading="lazy"
              @error="handleImageError"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-heroicons-user-circle" class="text-4xl text-gray-400" />
            </div>
          </div>

          <!-- Subject Info -->
          <div class="p-3">
            <h3 class="font-medium text-sm text-gray-900 dark:text-white truncate">
              {{ subject.name }}
            </h3>
            <p class="text-xs text-gray-500 mt-1">
              Created {{ formatDate(subject.created_at) }}
            </p>
            <div v-if="subject.tags && subject.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
              <span
                v-for="tag in subject.tags.slice(0, 3)"
                :key="tag"
                class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded"
              >
                {{ tag }}
              </span>
            </div>
            <p v-if="subject.note" class="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
              {{ subject.note }}
            </p>
          </div>
        </div>
      </div>

      <!-- List View -->
      <div v-else class="space-y-2">
        <div
          v-for="subject in subjectResults"
          :key="subject.id"
          class="bg-neutral-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
          @click="openModal(subject)"
        >
          <div class="flex items-center gap-4">
            <!-- Thumbnail -->
            <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded flex-shrink-0">
              <img
                v-if="subject.has_thumbnail && subject.thumbnail_data && settingsStore.displayImages"
                :src="`data:image/jpeg;base64,${subject.thumbnail_data}`"
                :alt="subject.name"
                class="w-full h-full object-cover rounded"
                loading="lazy"
                @error="handleImageError"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-user-circle" class="text-2xl text-gray-400" />
              </div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-gray-900 dark:text-white truncate">
                {{ subject.name }}
              </h3>
              <p class="text-sm text-gray-500">
                Created {{ formatDate(subject.created_at) }}
              </p>
              <div v-if="subject.tags && subject.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="tag in subject.tags"
                  :key="tag"
                  class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded"
                >
                  {{ tag }}
                </span>
              </div>
              <p v-if="subject.note" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ subject.note }}
              </p>
            </div>

            <!-- Actions -->
            <div class="flex-shrink-0 flex items-center gap-2">
              <UIcon name="i-heroicons-chevron-right" class="text-gray-400" />
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="pagination.total > pagination.limit" class="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-gray-200 dark:border-gray-700 p-4 z-50">
        <div class="flex justify-center">
          <UPagination
            v-model:page="currentPage"
            :items-per-page="pagination.limit"
            :total="pagination.total"
            show-last
            show-first
          />
        </div>
      </div>
    </div>

    <!-- No Results -->
    <div v-else-if="!isLoading && hasSearched" class="text-center py-8">
      <UIcon name="i-heroicons-user-group" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">No subjects found matching your criteria</p>
    </div>

    <!-- Initial State -->
    <div v-else class="text-center py-8">
      <UIcon name="i-heroicons-magnifying-glass" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">Use the search filters above to find subjects</p>
    </div>

    <!-- Subject Detail Modal -->
    <UModal v-model:open="isModalOpen">
      <template #content>
        <div v-if="selectedSubject" class="p-6">
          <!-- Header -->
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-lg font-semibold">{{ selectedSubject.name }}</h3>
            <UButton
              variant="ghost"
              icon="i-heroicons-x-mark"
              @click="isModalOpen = false"
            />
          </div>

          <div class="space-y-4">
            <!-- Hero Image Display -->
            <div v-if="selectedSubject.has_thumbnail && selectedSubject.thumbnail_data" class="max-w-full">
              <img
                v-if="settingsStore.displayImages"
                :src="`data:image/jpeg;base64,${selectedSubject.thumbnail_data}`"
                :alt="selectedSubject.name"
                class="w-full h-auto max-h-[60vh] object-contain rounded"
                @error="handleImageError"
              />
              <div v-else class="w-full h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded">
                <UIcon name="i-heroicons-user-circle" class="text-6xl text-gray-400" />
              </div>
            </div>

            <!-- Subject Details -->
            <div class="grid grid-cols-1 gap-4 text-sm">
              <div v-if="selectedSubject.note">
                <span class="font-medium">Note:</span>
                <p class="mt-1 text-gray-600 dark:text-gray-400">{{ selectedSubject.note }}</p>
              </div>
              <div>
                <span class="font-medium">Created:</span>
                <span class="ml-2">{{ formatDate(selectedSubject.created_at) }}</span>
              </div>
            </div>

            <!-- Tags -->
            <div v-if="selectedSubject.tags && selectedSubject.tags.length > 0">
              <span class="font-medium text-sm">Tags:</span>
              <div class="flex flex-wrap gap-2 mt-2">
                <span
                  v-for="tag in selectedSubject.tags"
                  :key="tag"
                  class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-sm rounded"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- ID -->
            <div class="text-xs text-gray-500">
              <span class="font-medium">ID:</span>
              <span class="ml-2 font-mono">{{ selectedSubject.id }}</span>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'

// Page metadata
definePageMeta({
  title: 'Subjects Gallery'
})

// Initialize settings store
const settingsStore = useSettingsStore()

// Reactive data
const searchTerm = ref('')
const dropdownSearchTerm = ref('')
const selectedSearchSubject = ref(null)
const filters = ref({
  tags: ''
})

// Reactive subjects data for dropdown search
const searchSubjectItems = ref([])

const loadSearchSubjects = async () => {
  try {
    const data = await useAuthFetch('subjects', {
      query: {
        search: dropdownSearchTerm.value,
        limit: 100
      }
    })
    
    if (data.subjects && Array.isArray(data.subjects)) {
      searchSubjectItems.value = data.subjects.map((subject) => ({
        value: subject.name,
        label: subject.name
      }))
    }
  } catch (error) {
    console.error('Failed to load search subjects:', error)
  }
}

// Load subjects on mount and when search changes
onMounted(() => loadSearchSubjects())
watch(dropdownSearchTerm, () => loadSearchSubjects())

const sortOptions = ref({
  sort_by: 'name',
  sort_order: 'asc'
})

const subjectResults = ref([])
const isLoading = ref(false)
const hasSearched = ref(false)
const viewMode = ref('grid')
const selectedSubject = ref(null)
const isModalOpen = ref(false)
const currentPage = ref(1)
const pagination = ref({
  total: 0,
  limit: 16,
  offset: 0,
  has_more: false
})

// Sort options
const sortByOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Created Date', value: 'created_at' },
  { label: 'Updated Date', value: 'updated_at' }
]

const sortOrderOptions = [
  { label: 'Ascending', value: 'asc' },
  { label: 'Descending', value: 'desc' }
]

const limitOptions = [
  { label: '16 per page', value: 16 },
  { label: '32 per page', value: 32 },
  { label: '48 per page', value: 48 }
]

// Handle subject selection from dropdown
const handleSearchSubjectSelection = (selectedSubject) => {
  console.log('🎯 Selected subject from dropdown:', selectedSubject)
  if (selectedSubject && selectedSubject.value) {
    searchTerm.value = selectedSubject.value
    console.log('✅ Updated searchTerm to:', searchTerm.value)
    // Don't auto-search, let user click Search button
  } else {
    console.log('❌ No valid selection')
  }
}

// Methods
const searchSubjects = async () => {
  isLoading.value = true
  hasSearched.value = true

  try {
    const params = new URLSearchParams()
    
    console.log('🔍 Search term being used:', searchTerm.value)
    if (searchTerm.value) params.append('name_pattern', searchTerm.value)
    if (filters.value.tags) params.append('tags', filters.value.tags)
    
    params.append('limit', pagination.value.limit.toString())
    params.append('page', currentPage.value.toString())
    
    // Add sort parameters
    const sortBy = typeof sortOptions.value.sort_by === 'object' ? sortOptions.value.sort_by.value : sortOptions.value.sort_by
    const sortOrder = typeof sortOptions.value.sort_order === 'object' ? sortOptions.value.sort_order.value : sortOptions.value.sort_order
    
    if (sortBy) params.append('sort_by', sortBy)
    if (sortOrder) params.append('sort_order', sortOrder)
console.log('🌐 API URL:', `/api/auth/subjects/search?${params.toString()}`)
const response = await useAuthFetch(`subjects/search?${params.toString()}`)

    
    console.log('📊 Subjects Gallery Search Results:')
    console.log('Total results:', response.subjects?.length || 0)
    console.log('First result:', JSON.stringify(response.subjects?.[0], null, 2))
    
    subjectResults.value = response.subjects || []
    pagination.value = response.pagination || pagination.value
    
  } catch (err) {
    console.error('Search error:', err)
    const toast = useToast()
    
    let errorMessage = 'Failed to search subjects'
    if (err.statusCode === 503) {
      errorMessage = 'Media API is not available. Please ensure the service is running on localhost:8000'
    } else if (err.data?.message) {
      errorMessage = err.data.message
    }
    
    toast.add({
      title: 'Subjects Search Error',
      description: errorMessage,
      color: 'red',
      timeout: 5000
    })
    
    subjectResults.value = []
  } finally {
    isLoading.value = false
  }
}

const clearFilters = () => {
  searchTerm.value = ''
  dropdownSearchTerm.value = ''
  selectedSearchSubject.value = null
  filters.value = {
    tags: ''
  }
  sortOptions.value = {
    sort_by: 'name',
    sort_order: 'asc'
  }
  pagination.value.limit = 16
  currentPage.value = 1
  subjectResults.value = []
  hasSearched.value = false
}

const handleImageError = (event) => {
  // Hide the broken image and show placeholder instead
  event.target.style.display = 'none'
  
  // Find the parent container and add a placeholder
  const container = event.target.parentElement
  if (container && !container.querySelector('.image-error-placeholder')) {
    const placeholder = document.createElement('div')
    placeholder.className = 'image-error-placeholder w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center'
    placeholder.innerHTML = '<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>'
    container.appendChild(placeholder)
  }
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString()
}

const openModal = (subject) => {
  selectedSubject.value = subject
  isModalOpen.value = true
}

// Watch for page changes
watch(currentPage, (newPage, oldPage) => {
  if (newPage !== oldPage && hasSearched.value) {
    searchSubjects()
  }
})

// Initialize settings on mount (but don't auto-search)
onMounted(async () => {
  await settingsStore.initializeSettings()
})

// Page head
useHead({
  title: 'Subjects Gallery - AI Job Tracking System',
  meta: [
    { name: 'description', content: 'Browse and search subjects with their associated media' }
  ]
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>