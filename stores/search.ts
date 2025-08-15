import localforage from 'localforage'

export const useSearchStore = defineStore('search', () => {
  // Video search filters state
  const videoSearch = ref({
    selectedTags: [] as string[],
    excludeAssignedVideos: true,
    durationFilters: {
      min_duration: 0,
      max_duration: null as number | null
    },
    sortOptions: { label: 'Random', value: 'random' },
    limitOptions: { label: '48', value: 48 }
  })

  // Subject search filters state
  const subjectSearch = ref({
    selectedTags: [] as string[],
    tagSearchMode: { label: 'Partial Match', value: 'partial' },
    sortOptions: { label: 'Name (A-Z)', value: 'name_asc' }
  })

  // Media gallery filters state
  const mediaGallerySearch = ref({
    filters: {
      media_type: { label: 'Videos', value: 'video' },
      purpose: { label: 'Output', value: 'output' },
      subject_uuid: ''
    },
    selectedTags: [] as string[],
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
      const savedVideoSearch = await localforage.getItem('videoSearch')
      if (savedVideoSearch) {
        videoSearch.value = { ...videoSearch.value, ...savedVideoSearch }
      }
      
      const savedSubjectSearch = await localforage.getItem('subjectSearch')
      if (savedSubjectSearch) {
        subjectSearch.value = { ...subjectSearch.value, ...savedSubjectSearch }
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

  // Save video search to localStorage
  const saveVideoSearch = async () => {
    try {
      // Create a serializable copy of the data
      const serializableData = JSON.parse(JSON.stringify(videoSearch.value))
      await localforage.setItem('videoSearch', serializableData)
    } catch (error) {
      console.error('Failed to save video search settings:', error)
    }
  }

  // Save subject search to localStorage
  const saveSubjectSearch = async () => {
    try {
      // Create a serializable copy of the data
      const serializableData = JSON.parse(JSON.stringify(subjectSearch.value))
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
      sortOptions: { label: 'Random', value: 'random' },
      limitOptions: { label: '48', value: 48 }
    }
    await saveVideoSearch()
  }

  // Reset subject search filters to defaults
  const resetSubjectFilters = async () => {
    subjectSearch.value = {
      selectedTags: [],
      tagSearchMode: { label: 'Partial Match', value: 'partial' },
      sortOptions: { label: 'Name (A-Z)', value: 'name_asc' }
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
    resetMediaGalleryFilters
  }
})