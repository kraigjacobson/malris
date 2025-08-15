import localforage from 'localforage'

export interface MediaGalleryFilters {
  media_type: { label: string; value: string } | null
  purpose: { label: string; value: string } | null
  subject_uuid: string
  media_uuid: string
  selectedTags: string[]
  sortOptions: {
    sort_by: { label: string; value: string } | string
    sort_order: { label: string; value: string } | string
  }
  pagination: {
    limit: { label: string; value: number } | number
  }
  viewMode: 'grid' | 'list'
  filtersCollapsed: boolean
}

const STORAGE_KEY = 'mediaGalleryFilters'

const defaultFilters: MediaGalleryFilters = {
  media_type: { label: 'Videos', value: 'video' },
  purpose: { label: 'Output', value: 'output' },
  subject_uuid: '',
  media_uuid: '',
  selectedTags: [],
  sortOptions: {
    sort_by: { label: 'Created Date', value: 'created_at' },
    sort_order: { label: 'Descending', value: 'desc' }
  },
  pagination: {
    limit: { label: '24 results', value: 24 }
  },
  viewMode: 'grid',
  filtersCollapsed: false
}

export const useMediaGalleryFilters = () => {
  const filters = ref<MediaGalleryFilters>({ ...defaultFilters })

  // Load filters from storage
  const loadFilters = async () => {
    try {
      const saved = await localforage.getItem(STORAGE_KEY) as MediaGalleryFilters | null
      if (saved) {
        filters.value = { ...defaultFilters, ...saved }
      }
    } catch (error) {
      console.error('Failed to load media gallery filters:', error)
    }
  }

  // Save filters to storage
  const saveFilters = async () => {
    try {
      const serializable = JSON.parse(JSON.stringify(filters.value))
      await localforage.setItem(STORAGE_KEY, serializable)
    } catch (error) {
      console.error('Failed to save media gallery filters:', error)
    }
  }

  // Reset filters to defaults
  const resetFilters = () => {
    filters.value = { ...defaultFilters }
    saveFilters()
  }

  // Watch for changes and auto-save
  watch(filters, saveFilters, { deep: true })

  return {
    filters: readonly(filters),
    loadFilters,
    saveFilters,
    resetFilters,
    // Individual filter accessors for easier binding
    mediaType: computed({
      get: () => filters.value.media_type,
      set: (value) => { filters.value.media_type = value }
    }),
    purpose: computed({
      get: () => filters.value.purpose,
      set: (value) => { filters.value.purpose = value }
    }),
    selectedTags: computed({
      get: () => filters.value.selectedTags,
      set: (value) => { filters.value.selectedTags = value }
    }),
    sortBy: computed({
      get: () => filters.value.sortOptions.sort_by,
      set: (value) => { filters.value.sortOptions.sort_by = value }
    }),
    sortOrder: computed({
      get: () => filters.value.sortOptions.sort_order,
      set: (value) => { filters.value.sortOptions.sort_order = value }
    }),
    paginationLimit: computed({
      get: () => filters.value.pagination.limit,
      set: (value) => { filters.value.pagination.limit = value }
    }),
    viewMode: computed({
      get: () => filters.value.viewMode,
      set: (value) => { filters.value.viewMode = value }
    }),
    filtersCollapsed: computed({
      get: () => filters.value.filtersCollapsed,
      set: (value) => { filters.value.filtersCollapsed = value }
    }),
    subjectUuid: computed({
      get: () => filters.value.subject_uuid,
      set: (value) => { filters.value.subject_uuid = value }
    }),
    mediaUuid: computed({
      get: () => filters.value.media_uuid,
      set: (value) => { filters.value.media_uuid = value }
    })
  }
}