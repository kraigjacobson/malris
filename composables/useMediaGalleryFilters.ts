import localforage from 'localforage'

/**
 * Media Gallery Filters Composable with LocalForage Persistence
 *
 * IMPORTANT: When adding or modifying filters, you must:
 * 1. Add the filter property to the MediaGalleryFilters interface below
 * 2. Add the default value to the defaultFilters object
 * 3. Create a computed property in the return statement for two-way binding
 * 4. Update the clearFilters() function in media-gallery.vue to reset the new filter
 *
 * All filter changes are automatically persisted to localForage via the deep watcher.
 * Filters are restored on page load via loadFilters().
 */

export interface MediaGalleryFilters {
  media_type: { label: string; value: string } | null
  purpose: { label: string; value: string } | null
  subject_uuid: string
  selectedSubjects: string[]
  media_uuid: string
  filenameSearch: string
  selectedTags: string[]
  onlyShowUntagged: boolean
  onlyShowOrphans: boolean
  selectedRatings: number[]
  showUnrated: boolean
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
  purpose: { label: 'All Purposes', value: 'all' },
  subject_uuid: '',
  selectedSubjects: [],
  media_uuid: '',
  filenameSearch: '',
  selectedTags: [],
  onlyShowUntagged: false,
  onlyShowOrphans: false,
  selectedRatings: [],
  showUnrated: false,
  sortOptions: {
    sort_by: 'created_at',
    sort_order: 'desc'
  },
  pagination: {
    limit: 24
  },
  viewMode: 'grid',
  filtersCollapsed: false
}

export const useMediaGalleryFilters = () => {
  const filters = ref<MediaGalleryFilters>({ ...defaultFilters })

  // Load filters from storage
  const loadFilters = async () => {
    try {
      const saved = (await localforage.getItem(STORAGE_KEY)) as MediaGalleryFilters | null
      if (saved) {
        const merged = { ...defaultFilters, ...saved }
        // Normalize sort/limit values — old saves may have stored {label, value} objects
        if (merged.sortOptions) {
          merged.sortOptions = {
            sort_by: typeof merged.sortOptions.sort_by === 'object' ? (merged.sortOptions.sort_by as any).value : merged.sortOptions.sort_by,
            sort_order: typeof merged.sortOptions.sort_order === 'object' ? (merged.sortOptions.sort_order as any).value : merged.sortOptions.sort_order
          }
        }
        if (merged.pagination) {
          merged.pagination = {
            limit: typeof merged.pagination.limit === 'object' ? (merged.pagination.limit as any).value : merged.pagination.limit
          }
        }
        filters.value = merged
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
      set: value => {
        filters.value.media_type = value
      }
    }),
    purpose: computed({
      get: () => filters.value.purpose,
      set: value => {
        filters.value.purpose = value
      }
    }),
    selectedSubjects: computed({
      get: () => filters.value.selectedSubjects,
      set: value => {
        filters.value.selectedSubjects = value
      }
    }),
    filenameSearch: computed({
      get: () => filters.value.filenameSearch,
      set: value => {
        filters.value.filenameSearch = value
      }
    }),
    selectedTags: computed({
      get: () => filters.value.selectedTags,
      set: value => {
        filters.value.selectedTags = value
      }
    }),
    onlyShowUntagged: computed({
      get: () => filters.value.onlyShowUntagged,
      set: value => {
        filters.value.onlyShowUntagged = value
      }
    }),
    onlyShowOrphans: computed({
      get: () => filters.value.onlyShowOrphans,
      set: value => {
        filters.value.onlyShowOrphans = value
      }
    }),
    selectedRatings: computed({
      get: () => filters.value.selectedRatings,
      set: value => {
        filters.value.selectedRatings = value
      }
    }),
    showUnrated: computed({
      get: () => filters.value.showUnrated,
      set: value => {
        filters.value.showUnrated = value
      }
    }),
    sortBy: computed({
      get: () => filters.value.sortOptions.sort_by,
      set: value => {
        filters.value.sortOptions.sort_by = value
      }
    }),
    sortOrder: computed({
      get: () => filters.value.sortOptions.sort_order,
      set: value => {
        filters.value.sortOptions.sort_order = value
      }
    }),
    paginationLimit: computed({
      get: () => filters.value.pagination.limit,
      set: value => {
        filters.value.pagination.limit = value
      }
    }),
    viewMode: computed({
      get: () => filters.value.viewMode,
      set: value => {
        filters.value.viewMode = value
      }
    }),
    filtersCollapsed: computed({
      get: () => filters.value.filtersCollapsed,
      set: value => {
        filters.value.filtersCollapsed = value
      }
    }),
    subjectUuid: computed({
      get: () => filters.value.subject_uuid,
      set: value => {
        filters.value.subject_uuid = value
      }
    }),
    mediaUuid: computed({
      get: () => filters.value.media_uuid,
      set: value => {
        filters.value.media_uuid = value
      }
    })
  }
}
