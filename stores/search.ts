import localforage from 'localforage'

/**
 * Search Store with LocalForage Persistence
 *
 * IMPORTANT: When adding or modifying filters, you must:
 * 1. Add the filter property to the appropriate search object (videoSearch/subjectSearch)
 * 2. Add the default value to the defaults in reset functions
 * 3. Update the save function if the filter should be excluded from persistence
 *
 * NOTE: selectedTags are intentionally excluded from persistence for both video and subject searches.
 * All other filter changes are automatically persisted to localForage via deep watchers.
 */

export const useSearchStore = defineStore('search', () => {
  // Dropdown item definitions (shared between defaults and component)
  const sortTypeItems = [
    { label: 'Random', value: 'random' },
    { label: 'Created Date', value: 'created_at' },
    { label: 'Updated Date', value: 'updated_at' },
    { label: 'Duration', value: 'duration' },
    { label: 'File Size', value: 'file_size' },
    { label: 'Filename', value: 'filename' }
  ]

  const sortOrderItems = [
    { label: 'Asc', value: 'asc' },
    { label: 'Desc', value: 'desc' }
  ]

  const limitOptionsItems = [
    { label: '24', value: 24 },
    { label: '48', value: 48 },
    { label: '96', value: 96 },
    { label: '192', value: 192 },
    { label: '480', value: 480 }
  ]

  // Helper function to find matching item by value
  const findItemByValue = (items: any[], savedValue: any) => {
    if (!savedValue) return items[0]
    const value = typeof savedValue === 'object' ? savedValue.value : savedValue
    return items.find(item => item.value === value) || items[0]
  }

  // Video search filters state
  const videoSearch = ref({
    selectedTags: [] as string[],
    excludeAssignedVideos: true,
    durationFilters: {
      min_duration: 0,
      max_duration: null as number | null
    },
    selectedRatings: [] as number[],
    showUnrated: false,
    sortType: sortTypeItems[0], // Default to 'Random'
    sortOrder: sortOrderItems[0], // Default to 'Asc'
    limitOptions: limitOptionsItems[1] // Default to '48'
  })

  // Subject search filters state
  const subjectSearch = ref({
    selectedTags: [] as string[],
    tagSearchMode: { label: 'Partial Match', value: 'partial' },
    sortOptions: { label: 'Total Jobs (Most)', value: 'total_jobs_desc' },
    nameFilters: {
      celeb: false,
      asmr: false,
      real: true
    }
  })

  // Media gallery filters state
  const mediaGallerySearch = ref({
    filters: {
      media_type: { label: 'Videos', value: 'video' },
      purpose: { label: 'Output', value: 'output' },
      subject_uuid: ''
    },
    selectedTags: [] as string[],
    onlyShowUntagged: false,
    completionFilters: {
      min_completions: 0,
      max_completions: null as number | null
    },
    sortOptions: {
      sort_by: { label: 'Created Date', value: 'created_at' },
      sort_order: { label: 'Descending', value: 'desc' }
    },
    pagination: {
      limit: { label: '24 results', value: 24 }
    },
    viewMode: 'grid' as 'grid' | 'list',
    filtersCollapsed: false
  })

  // Initialize from localStorage
  const initializeSearch = async () => {
    try {
      const savedVideoSearch = (await localforage.getItem('videoSearch')) as any
      if (savedVideoSearch) {
        // Restore all saved properties except selectedTags (keep default empty array)
        // Normalize select box values to match item references
        videoSearch.value = {
          ...videoSearch.value,
          ...savedVideoSearch,
          selectedTags: [],
          sortType: findItemByValue(sortTypeItems, savedVideoSearch.sortType),
          sortOrder: findItemByValue(sortOrderItems, savedVideoSearch.sortOrder),
          limitOptions: findItemByValue(limitOptionsItems, savedVideoSearch.limitOptions),
          // Ensure nested objects are properly restored
          durationFilters: {
            ...videoSearch.value.durationFilters,
            ...(savedVideoSearch.durationFilters || {})
          }
        }
      }

      const savedSubjectSearch = (await localforage.getItem('subjectSearch')) as any
      if (savedSubjectSearch) {
        // Restore all saved properties except selectedTags (keep default empty array)
        // Deep merge to preserve object structures
        subjectSearch.value = {
          ...subjectSearch.value,
          ...savedSubjectSearch,
          selectedTags: [],
          // Ensure nested objects are properly restored
          nameFilters: {
            ...subjectSearch.value.nameFilters,
            ...(savedSubjectSearch.nameFilters || {})
          }
        }
      }

      const savedMediaGallerySearch = await localforage.getItem('mediaGallerySearch')
      if (savedMediaGallerySearch && typeof savedMediaGallerySearch === 'object') {
        console.log('📂 Loading saved media gallery search settings:', savedMediaGallerySearch)
        // Simply replace the entire object since we know the structure
        mediaGallerySearch.value = savedMediaGallerySearch as typeof mediaGallerySearch.value
        console.log('📂 Loaded settings:', mediaGallerySearch.value)
      } else {
        console.log('📂 No saved media gallery search settings found, using defaults')
      }
    } catch (error) {
      console.error('Failed to load search settings from localforage:', error)
    }
  }

  // Save video search to localStorage (excluding selectedTags)
  const saveVideoSearch = async () => {
    try {
      // Create a serializable copy of the data, excluding selectedTags
      const { selectedTags, ...dataToSave } = videoSearch.value
      const serializableData = JSON.parse(JSON.stringify(dataToSave))
      await localforage.setItem('videoSearch', serializableData)
    } catch (error) {
      console.error('Failed to save video search settings:', error)
    }
  }

  // Save subject search to localStorage (excluding selectedTags)
  const saveSubjectSearch = async () => {
    try {
      // Create a serializable copy of the data, excluding selectedTags
      const { selectedTags, ...dataToSave } = subjectSearch.value
      const serializableData = JSON.parse(JSON.stringify(dataToSave))
      await localforage.setItem('subjectSearch', serializableData)
    } catch (error) {
      console.error('Failed to save subject search settings:', error)
    }
  }

  // Save media gallery search to localStorage
  const saveMediaGallerySearch = async () => {
    try {
      // Create a serializable copy of the data
      const serializableData = JSON.parse(JSON.stringify(mediaGallerySearch.value))
      await localforage.setItem('mediaGallerySearch', serializableData)
      console.log('💾 Media gallery search settings saved:', serializableData)
    } catch (error) {
      console.error('Failed to save media gallery search settings:', error)
    }
  }

  // Reset video search filters to defaults
  const resetVideoFilters = async () => {
    videoSearch.value = {
      selectedTags: [],
      excludeAssignedVideos: true,
      durationFilters: {
        min_duration: 0,
        max_duration: null
      },
      selectedRatings: [],
      showUnrated: false,
      sortType: sortTypeItems[0], // Random
      sortOrder: sortOrderItems[0], // Asc
      limitOptions: limitOptionsItems[1] // 48
    }
    await saveVideoSearch()
  }

  // Reset subject search filters to defaults
  const resetSubjectFilters = async () => {
    subjectSearch.value = {
      selectedTags: [],
      tagSearchMode: { label: 'Partial Match', value: 'partial' },
      sortOptions: { label: 'Total Jobs (Most)', value: 'total_jobs_desc' },
      nameFilters: {
        celeb: false,
        asmr: false,
        real: true
      }
    }
    await saveSubjectSearch()
  }

  // Reset media gallery search filters to defaults
  const resetMediaGalleryFilters = async () => {
    mediaGallerySearch.value = {
      filters: {
        media_type: { label: 'Videos', value: 'video' },
        purpose: { label: 'Output', value: 'output' },
        subject_uuid: ''
      },
      selectedTags: [],
      onlyShowUntagged: false,
      completionFilters: {
        min_completions: 0,
        max_completions: null
      },
      sortOptions: {
        sort_by: { label: 'Created Date', value: 'created_at' },
        sort_order: { label: 'Descending', value: 'desc' }
      },
      pagination: {
        limit: { label: '24 results', value: 24 }
      },
      viewMode: 'grid' as 'grid' | 'list',
      filtersCollapsed: false
    }
    await saveMediaGallerySearch()
  }

  // Watch for changes and save automatically
  watch(videoSearch, saveVideoSearch, { deep: true })
  watch(subjectSearch, saveSubjectSearch, { deep: true })
  watch(mediaGallerySearch, saveMediaGallerySearch, { deep: true })

  return {
    videoSearch,
    subjectSearch,
    mediaGallerySearch,
    initializeSearch,
    resetVideoFilters,
    resetSubjectFilters,
    resetMediaGalleryFilters,
    // Export dropdown items for use in components
    sortTypeItems,
    sortOrderItems,
    limitOptionsItems
  }
})
