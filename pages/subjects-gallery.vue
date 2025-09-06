<template>
  <UModal v-model:open="isModalOpen" :ui="{ width: 'max-w-6xl' }" :fullscreen="isMobile">
    <template #header>
      <div class="flex justify-between items-center w-full">
        <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
          Subjects
        </h1>
        <div class="flex items-center gap-2">
          <UButton
            @click="openManageSubjectModal()"
            color="primary"
            icon="i-heroicons-plus"
            size="sm"
          >
            Add Subject
          </UButton>
          <UButton
            variant="ghost"
            size="sm"
            icon="i-heroicons-x-mark"
            @click="isModalOpen = false"
          />
        </div>
      </div>
    </template>

    <template #body>
      <div class="space-y-6 max-h-[70vh] overflow-y-auto">
        <!-- Search Filters -->
        <div>
      <!-- Collapsible Header -->
      <div
        class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        @click="toggleFiltersCollapse"
      >
        <h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
          Search Filters
        </h2>
        <UIcon
          :name="isFiltersCollapsed ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'"
          class="w-5 h-5 text-gray-500"
        />
      </div>
      
      <!-- Collapsible Content -->
      <UCard v-show="!isFiltersCollapsed" class="mt-2">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
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
              Tags Search
            </label>
            <div class="space-y-2">
              <UInputTags
                v-model="selectedTags"
                placeholder="Add tags (e.g., portrait, landscape)"
                class="w-full"
                :ui="{ trailing: 'pe-1' }"
              >
                <template v-if="selectedTags?.length" #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    icon="i-lucide-circle-x"
                    aria-label="Clear all tags"
                    @click="selectedTags = []"
                  />
                </template>
              </UInputTags>
              
              <!-- Tag Search Options -->
              <!-- <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Search Mode
                </label>
                <USelectMenu
                  v-model="tagSearchMode"
                  :items="tagSearchModeOptions"
                  class="w-full"
                  size="sm"
                />
              </div> -->
            </div>
          </div>
        </div>

        <!-- Sort Options and Limit -->
        <div class="grid grid-cols-3 gap-2 sm:gap-4 mt-3 sm:mt-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Sort By
            </label>
            <USelect
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
            <USelect
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
            <USelect
              v-model="pagination.limit"
              :items="limitOptions"
              placeholder="Results per page..."
              class="w-full"
            />
          </div>
        </div>

      </UCard>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
    </div>

    <!-- Results -->
    <div v-else-if="subjectResults.length > 0">
      <!-- Results Header -->
      <div class="flex justify-between items-center mb-3 sm:mb-4">
        <p class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Found {{ pagination.total }} subjects
        </p>
        <div class="flex gap-1 sm:gap-2">
          <UButton
            @click="viewMode = 'grid'"
            :variant="viewMode === 'grid' ? 'solid' : 'outline'"
            size="xs"
          >
            <UIcon name="i-heroicons-squares-2x2" />
          </UButton>
          <UButton
            @click="viewMode = 'list'"
            :variant="viewMode === 'list' ? 'solid' : 'outline'"
            size="xs"
          >
            <UIcon name="i-heroicons-list-bullet" />
          </UButton>
        </div>
      </div>

      <!-- Grid View -->
      <div v-if="viewMode === 'grid'">
        <SubjectGrid
          :subjects="subjectResults"
          :loading="false"
          :loading-more="false"
          :has-searched="hasSearched"
          :has-more="false"
          :error="null"
          :selection-mode="false"
          :display-images="settingsStore.displayImages"
          :empty-state-message="'Use the search filters above to find subjects'"
          @subject-click="openManageSubjectModal"
        />
      </div>

      <!-- List View -->
      <div v-else class="space-y-1 sm:space-y-2">
        <div
          v-for="subject in subjectResults"
          :key="subject.id"
          class="bg-neutral-800 rounded-lg p-2 sm:p-4 shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
          @click="openManageSubjectModal(subject)"
        >
          <div class="flex items-center gap-2 sm:gap-4">
            <!-- Thumbnail -->
            <div class="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 dark:bg-gray-700 rounded shrink-0">
              <img
                v-if="subject.has_thumbnail && subject.thumbnail_url && settingsStore.displayImages"
                :src="subject.thumbnail_url"
                :alt="subject.name"
                class="w-full h-full object-cover object-top rounded"
                loading="lazy"
                @error="handleImageError"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-user-circle" class="text-2xl text-gray-400" />
              </div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-sm sm:text-base text-gray-900 dark:text-white truncate">
                {{ subject.name }}
              </h3>
              <p class="text-xs sm:text-sm text-gray-500 hidden sm:block">
                Created {{ formatDate(subject.created_at) }}
              </p>
              <div v-if="subject.tags && subject.tags.tags && subject.tags.tags.length > 0" class="flex flex-wrap gap-1 mt-1 hidden sm:flex">
                <span
                  v-for="tag in subject.tags.tags.slice(0, 3)"
                  :key="tag"
                  class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded"
                >
                  {{ tag }}
                </span>
              </div>
              <p v-if="subject.note" class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-1 sm:line-clamp-none hidden sm:block">
                {{ subject.note }}
              </p>
            </div>

            <!-- Actions -->
            <div class="shrink-0 flex items-center gap-2">
              <UIcon name="i-heroicons-chevron-right" class="text-gray-400" />
            </div>
          </div>
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


        <!-- Manage Subject Modal -->
        <ManageSubjectModal
          v-model="isManageSubjectModalOpen"
          :subject="selectedSubjectForManagement"
          :subjects="subjectResults"
          :current-subject-index="currentSubjectIndex"
          @subject-created="handleSubjectCreated"
          @subject-updated="handleSubjectUpdated"
          @subject-changed="handleSubjectChanged"
        />
      </div>
    </template>

    <template #footer>
      <div class="w-full space-y-3">
        <!-- Pagination -->
        <div v-if="pagination.total > pagination.limit" class="w-full flex justify-center">
          <UPagination
            v-model:page="currentPage"
            :items-per-page="pagination.limit"
            :total="pagination.total"
            show-last
            show-first
          />
        </div>
        
        <!-- Action Buttons Row -->
        <div class="w-full flex justify-between items-center">
          <!-- Close Button (Left) -->
          <UButton
            @click="isModalOpen = false"
            variant="outline"
            size="sm"
            icon="i-heroicons-x-mark"
          >
            Close
          </UButton>
          
          <!-- Search and Clear Buttons (Right) -->
          <div class="flex gap-3">
            <UButton @click="clearFilters" variant="outline" size="sm">
              Clear
            </UButton>
            <UButton @click="searchSubjects" :loading="isLoading" color="primary" size="sm">
              Search
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'

// Page metadata
definePageMeta({
  title: 'Subjects Gallery'
})

// Use Nuxt's device detection
const { isMobile } = useDevice()

// Initialize stores
const settingsStore = useSettingsStore()

// Date formatting utility
const formatDate = (dateString) => {
  if (!dateString) return 'Unknown'
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return 'Invalid Date'
  }
}

// Image error handler
const handleImageError = (event) => {
  console.warn('Failed to load image:', event.target.src)
  // Hide the broken image
  event.target.style.display = 'none'
}

// Reactive data
const searchTerm = ref('')
const selectedSearchSubject = ref(null)
const selectedTags = ref([])
const tagSearchMode = ref({ label: 'Partial Match', value: 'partial' })
const filters = ref({
  tags: ''
})

// Subject search using composable for dropdown
const { getSubjects, getSubjectItems } = useSubjects()
const dropdownSearchTerm = ref('')

// Map composable items to match the expected format (name as value)
const searchSubjectItems = computed(() =>
  getSubjectItems(dropdownSearchTerm.value).map(item => ({
    value: item.label, // Use name as value for subjects gallery
    label: item.label
  }))
)

const sortOptions = ref({
  sort_by: 'name',
  sort_order: 'asc'
})

const subjectResults = ref([])
const isLoading = ref(false)
const hasSearched = ref(false)
const viewMode = ref('grid')
const isManageSubjectModalOpen = ref(false)
const isModalOpen = ref(true)
const isFiltersCollapsed = ref(false)
const selectedSubjectForManagement = ref(null)
const currentSubjectIndex = ref(0)
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
  { label: '48 per page', value: 48 },
  { label: '64 per page', value: 64 }
]

// const tagSearchModeOptions = [
//   { label: 'Partial Match', value: 'partial' },
//   { label: 'Exact Match', value: 'exact' }
// ]

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
const toggleFiltersCollapse = () => {
  isFiltersCollapsed.value = !isFiltersCollapsed.value
}

const searchSubjects = async () => {
  isLoading.value = true
  hasSearched.value = true
  
  // Collapse the search filters after searching
  isFiltersCollapsed.value = true

  try {
    // Get cached subjects using composable
    const cachedSubjects = getSubjects(selectedTags.value)
    
    if (cachedSubjects && cachedSubjects.length > 0) {
      console.log('🚀 Using cached subjects data for faster loading')
      
      // Filter cached data based on search criteria
      let filteredSubjects = cachedSubjects
      
      // Apply name filter if provided
      if (searchTerm.value && searchTerm.value.trim()) {
        const searchLower = searchTerm.value.trim().toLowerCase()
        filteredSubjects = filteredSubjects.filter(subject =>
          subject.name.toLowerCase().includes(searchLower)
        )
      }
      
      // Apply sorting
      const sortBy = typeof sortOptions.value.sort_by === 'object' ? sortOptions.value.sort_by.value : sortOptions.value.sort_by
      const sortOrder = typeof sortOptions.value.sort_order === 'object' ? sortOptions.value.sort_order.value : sortOptions.value.sort_order
      
      if (sortBy === 'name') {
        filteredSubjects.sort((a, b) => {
          const comparison = a.name.localeCompare(b.name)
          return sortOrder === 'desc' ? -comparison : comparison
        })
      } else if (sortBy === 'created_at') {
        filteredSubjects.sort((a, b) => {
          const aDate = new Date(a.created_at || 0).getTime()
          const bDate = new Date(b.created_at || 0).getTime()
          const comparison = aDate - bDate
          return sortOrder === 'desc' ? -comparison : comparison
        })
      }
      
      // Display all subjects without pagination
      subjectResults.value = filteredSubjects
      
      // Update pagination info
      pagination.value = {
        ...pagination.value,
        total: filteredSubjects.length,
        has_more: false
      }
      
      isLoading.value = false
      return
    }
    
    // Fallback to API call if no cached data
    console.log('📡 No cached data available, fetching from API')
    const params = new URLSearchParams()
    
    console.log('🔍 Search term being used:', searchTerm.value)
    if (searchTerm.value) params.append('name_pattern', searchTerm.value)
    
    // Add selected tags if provided
    if (selectedTags.value.length > 0) {
      params.append('tags', selectedTags.value.join(','))
      
      // Use the selected tag match mode
      const searchMode = typeof tagSearchMode.value === 'object' ? tagSearchMode.value.value : tagSearchMode.value
      params.append('tag_match_mode', searchMode)
    }
    
    params.append('limit', pagination.value.limit.toString())
    params.append('page', currentPage.value.toString())
    
    // Add sort parameters
    const sortBy = typeof sortOptions.value.sort_by === 'object' ? sortOptions.value.sort_by.value : sortOptions.value.sort_by
    const sortOrder = typeof sortOptions.value.sort_order === 'object' ? sortOptions.value.sort_order.value : sortOptions.value.sort_order
    
    if (sortBy) params.append('sort_by', sortBy)
    if (sortOrder) params.append('sort_order', sortOrder)
    const response = await useApiFetch(`subjects/search?${params.toString()}`)
    
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
  selectedTags.value = []
  tagSearchMode.value = { label: 'Partial Match', value: 'partial' }
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

const openManageSubjectModal = (subject = null) => {
  selectedSubjectForManagement.value = subject
  
  // Find the index of the selected subject in the results
  if (subject && subjectResults.value.length > 0) {
    const index = subjectResults.value.findIndex(s => s.id === subject.id)
    currentSubjectIndex.value = index !== -1 ? index : 0
  } else {
    currentSubjectIndex.value = 0
  }
  
  isManageSubjectModalOpen.value = true
}

const handleSubjectChanged = ({ subject, index }) => {
  console.log('🔥 [SUBJECTS GALLERY DEBUG] handleSubjectChanged called', { subject, index })
  
  // Update the selected subject and index
  selectedSubjectForManagement.value = subject
  currentSubjectIndex.value = index
  
  console.log('🔥 [SUBJECTS GALLERY DEBUG] Updated selectedSubjectForManagement to:', subject.name)
}

const handleSubjectCreated = (newSubject) => {
  // Update the selected subject for management to the newly created one
  selectedSubjectForManagement.value = newSubject
  
  // Add the new subject to the results if we have searched
  if (hasSearched.value) {
    subjectResults.value.unshift(newSubject)
    pagination.value.total += 1
  }
  
  const toast = useToast()
  toast.add({
    title: 'Success',
    description: 'Subject created successfully',
    color: 'green',
    timeout: 3000
  })
}

const handleSubjectUpdated = (updatedSubject) => {
  // Update the subject in the results list
  const subjectIndex = subjectResults.value.findIndex(s => s.id === updatedSubject.id)
  if (subjectIndex !== -1) {
    subjectResults.value[subjectIndex] = { ...subjectResults.value[subjectIndex], ...updatedSubject }
  }
  
  const toast = useToast()
  toast.add({
    title: 'Success',
    description: 'Subject updated successfully',
    color: 'green',
    timeout: 3000
  })
}

// Watch for page changes
watch(currentPage, (newPage, oldPage) => {
  if (newPage !== oldPage && hasSearched.value) {
    searchSubjects()
  }
})

// Initialize settings on mount (subjects cache is handled globally in app.vue)
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