import { defineStore } from 'pinia'

interface Subject {
  uuid: string
  id: string
  name: string
  has_thumbnail?: boolean
  thumbnail_data?: string
  tags?: string[]
}

interface SubjectItem {
  value: string
  label: string
}

interface ApiSubjectsResponse {
  subjects: Subject[]
  total_count?: number
  page?: number
  per_page?: number
  total_pages?: number
}

export const useSubjectsStore = defineStore('subjects', () => {
  // State
  const subjects = ref<Subject[]>([])
  const subjectItems = ref<SubjectItem[]>([])
  const isLoading = ref(false)
  const isInitialized = ref(false)
  const lastSearchQuery = ref('')
  
  // Cache for different search queries
  const searchCache = ref<Map<string, SubjectItem[]>>(new Map())
  
  // Actions
  const loadSubjects = async (searchQuery = '', forceRefresh = false) => {
    // If we have cached results for this search query and not forcing refresh, return them
    const cacheKey = (searchQuery || '').trim().toLowerCase()
    if (!forceRefresh && searchCache.value.has(cacheKey)) {
      subjectItems.value = searchCache.value.get(cacheKey) || []
      return
    }
    
    isLoading.value = true
    try {
      const params = new URLSearchParams()
      params.append('name_only', 'true')
      params.append('per_page', '1000')
      
      // Add search query if provided
      if (searchQuery && searchQuery.trim && searchQuery.trim()) {
        params.append('name_pattern', searchQuery.trim())
      }

      // Use Nuxt API route instead of direct media server call
      const response = await $fetch<ApiSubjectsResponse>(`/api/subjects?${params.toString()}`)
      
      if (response.subjects && Array.isArray(response.subjects)) {
        const mappedItems = response.subjects.map((subject: Subject) => ({
          value: subject.id, // Use id instead of uuid for consistency
          label: subject.name
        }))
        
        // Cache the results
        searchCache.value.set(cacheKey, mappedItems)
        subjectItems.value = mappedItems
        
        // If this is the initial load (no search query), also store the raw subjects
        if (!searchQuery || !searchQuery.trim()) {
          subjects.value = response.subjects
          isInitialized.value = true
        }
        
        lastSearchQuery.value = searchQuery
      } else {
        console.warn('⚠️ No subjects found in response:', response)
        subjectItems.value = []
        searchCache.value.set(cacheKey, [])
      }
    } catch (error) {
      console.error('❌ Failed to load subjects:', error)
      subjectItems.value = []
      searchCache.value.set(cacheKey, [])
    } finally {
      isLoading.value = false
    }
  }

  const initializeSubjects = async () => {
    if (!isInitialized.value) {
      await loadSubjects()
    }
  }

  const searchSubjects = async (query: string = '') => {
    await loadSubjects(query || '')
  }

  const clearCache = () => {
    searchCache.value.clear()
    isInitialized.value = false
  }

  const refreshSubjects = async () => {
    clearCache()
    await loadSubjects(lastSearchQuery.value, true)
  }

  // Get a specific subject by ID
  const getSubjectById = (id: string): Subject | undefined => {
    return subjects.value.find(subject => subject.id === id)
  }

  // Fetch a single subject with full data including tags
  const fetchSubjectWithTags = async (id: string): Promise<Subject | null> => {
    try {
      const response = await $fetch<Subject>(`/api/subjects/${id}`)
      return response
    } catch (error) {
      console.error('❌ Failed to fetch subject with tags:', error)
      return null
    }
  }

  // Get subject items for a specific search (from cache if available)
  const getSubjectItems = (searchQuery = ''): SubjectItem[] => {
    const cacheKey = searchQuery.trim().toLowerCase()
    return searchCache.value.get(cacheKey) || []
  }

  return {
    // State
    subjects: readonly(subjects),
    subjectItems: readonly(subjectItems),
    isLoading: readonly(isLoading),
    isInitialized: readonly(isInitialized),
    lastSearchQuery: readonly(lastSearchQuery),
    
    // Actions
    loadSubjects,
    initializeSubjects,
    searchSubjects,
    clearCache,
    refreshSubjects,
    getSubjectById,
    fetchSubjectWithTags,
    getSubjectItems
  }
})