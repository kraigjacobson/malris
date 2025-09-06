import { useSubjectsStore } from '~/stores/subjects'

export const useSubjects = () => {
  const subjectsStore = useSubjectsStore()

  /**
   * Get subjects with full data (including thumbnails)
   * Filters from cache only - no API calls after initial load
   */
  const getSubjects = (tags: string[] = []): any[] => {
    // Get from cache only
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

  return {
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