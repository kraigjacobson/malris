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
    limitOptions: { label: '50', value: 50 }
  })

  // Subject search filters state
  const subjectSearch = ref({
    selectedTags: [] as string[],
    tagSearchMode: { label: 'Partial Match', value: 'partial' },
    sortOptions: { label: 'Name (A-Z)', value: 'name_asc' }
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
      limitOptions: { label: '50', value: 50 }
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

  // Watch for changes and save automatically
  watch(videoSearch, saveVideoSearch, { deep: true })
  watch(subjectSearch, saveSubjectSearch, { deep: true })

  return {
    videoSearch,
    subjectSearch,
    initializeSearch,
    resetVideoFilters,
    resetSubjectFilters
  }
})