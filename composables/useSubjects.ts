import { useSubjectsStore } from '~/stores/subjects'

export const useSubjects = () => {
  const subjectsStore = useSubjectsStore()

  /**
   * Get subjects with full data (including thumbnails)
   * Now supports API calls with filtering and sorting
   */
  const getSubjects = async (options: {
    tags?: string[],
    nameFilters?: { celeb: boolean, asmr: boolean, real: boolean },
    sortBy?: string,
    sortOrder?: string
  } = {}): Promise<any[]> => {
    const { tags = [], nameFilters, sortBy, sortOrder } = options
    
    // If we have name filters or custom sorting, make an API call
    if (nameFilters || sortBy || sortOrder) {
      return await subjectsStore.loadFullSubjectsWithFilters({
        tags,
        nameFilters,
        sortBy,
        sortOrder
      })
    }
    
    // Otherwise use cached data
    const cachedSubjects = subjectsStore.getCachedFullSubjects(tags) || []
    console.log('✅ Using cached subjects:', cachedSubjects.length, 'for tags:', tags)
    return cachedSubjects
  }

  /**
   * Get subject items for dropdowns/search (derived from full subjects cache)
   * Filters locally - no API calls
   */
  const getSubjectItems = (searchQuery: string = ''): any[] => {
    // Get all cached full subjects
    const allSubjects = subjectsStore.getCachedFullSubjects([]) || []
    
    // Convert to items format and filter by search query
    let items = allSubjects.map(subject => ({
      value: subject.id,
      label: subject.name
    }))
    
    // Filter by search query if provided
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      items = items.filter(item =>
        item.label.toLowerCase().includes(query)
      )
    }
    
    // Sort alphabetically
    items.sort((a, b) => a.label.localeCompare(b.label))
    
    console.log('✅ Generated subject items from cache:', items.length)
    return items
  }

  /**
   * Initialize subjects cache (called once globally on app start)
   * Only loads full subjects since that's all we need
   */
  const initializeSubjects = async (): Promise<void> => {
    try {
      console.log('🚀 Initializing subjects cache...')
      await subjectsStore.initializeFullSubjects()
      console.log('✅ Subjects cache initialized')
    } catch (error) {
      console.error('❌ Failed to initialize subjects cache:', error)
      throw error
    }
  }

  /**
   * Get a specific subject by ID from cache
   */
  const getSubjectById = (id: string): any | null => {
    const cachedSubjects = subjectsStore.getCachedFullSubjects([])
    if (cachedSubjects) {
      const found = cachedSubjects.find(s => s.id === id)
      if (found) {
        console.log('✅ Found subject in cache:', id)
        return found
      }
    }
    
    console.log('❌ Subject not found in cache:', id)
    return null
  }

  // Reactive state for subject filtering (used by jobs page)
  const selectedSubject = ref(null)
  const searchQuery = ref('')
  
  // Computed subject items that updates when search query changes
  const subjectItems = computed(() => {
    // Get all cached full subjects
    const allSubjects = subjectsStore.getCachedFullSubjects([]) || []
    
    // If no cached subjects, return empty array
    if (!allSubjects || allSubjects.length === 0) {
      return []
    }
    
    // Convert to items format and filter by search query
    let items = allSubjects.map(subject => ({
      value: subject.id,
      label: subject.name
    }))
    
    // Filter by search query if provided
    if (searchQuery.value && searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase().trim()
      items = items.filter(item =>
        item.label.toLowerCase().includes(query)
      )
    }
    
    // Sort alphabetically
    items.sort((a, b) => a.label.localeCompare(b.label))
    
    return items
  })

  // Handle subject selection
  const handleSubjectSelection = (selected: any) => {
    selectedSubject.value = selected
  }

  // Clear subject selection
  const clearSubject = () => {
    selectedSubject.value = null
    searchQuery.value = ''
  }

  return {
    // Reactive state for filtering (used by jobs page)
    selectedSubject,
    searchQuery,
    subjectItems,
    handleSubjectSelection,
    clearSubject,
    
    // Main functions
    getSubjects,
    getSubjectItems,
    getSubjectById,
    
    // Initialization (called once globally)
    initializeSubjects,
    
    // Store access (for reactive state)
    store: subjectsStore
  }
}