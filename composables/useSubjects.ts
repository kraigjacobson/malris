import { ref, watch } from 'vue'

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
}

export const useSubjects = () => {
  const selectedSubject = ref<SubjectItem | null>(null)
  const searchQuery = ref('')
  const subjectItems = ref<SubjectItem[]>([])
  const isLoading = ref(false)

  const loadSubjects = async () => {
    isLoading.value = true
    try {
      const params = new URLSearchParams()
      params.append('name_only', 'true')
      params.append('limit', '100')
      
      // Add search query if provided
      if (searchQuery.value && searchQuery.value.trim()) {
        params.append('name_pattern', searchQuery.value.trim())
      }

      console.log('🔍 Loading subjects with params:', Object.fromEntries(params))
      
      // Use Nuxt API route instead of direct media server call
      const response = await $fetch<ApiSubjectsResponse>(`/api/subjects?${params.toString()}`)
      
      console.log('📊 Subjects response:', response)
      
      if (response.subjects && Array.isArray(response.subjects)) {
        subjectItems.value = response.subjects.map((subject: Subject) => ({
          value: subject.id, // Use id instead of uuid for consistency
          label: subject.name
        }))
        console.log('✅ Mapped subject items:', subjectItems.value)
      } else {
        console.warn('⚠️ No subjects found in response:', response)
        subjectItems.value = []
      }
    } catch (error) {
      console.error('❌ Failed to load subjects:', error)
      subjectItems.value = []
    } finally {
      isLoading.value = false
    }
  }

  const handleSubjectSelection = (selected: SubjectItem | null) => {
    selectedSubject.value = selected
  }

  const clearSubject = () => {
    selectedSubject.value = null
    searchQuery.value = ''
  }

  const resetSubjects = () => {
    selectedSubject.value = null
    searchQuery.value = ''
    subjectItems.value = []
  }

  // Debounced search - wait 300ms after user stops typing
  let debounceTimeout: NodeJS.Timeout | null = null
  const debouncedSearch = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }
    debounceTimeout = setTimeout(() => {
      loadSubjects()
    }, 300)
  }

  // Auto-load subjects when search query changes with debounce
  watch(searchQuery, () => {
    debouncedSearch()
  })

  // Load initial subjects when composable is created
  loadSubjects()
  return {
    selectedSubject,
    searchQuery,
    subjectItems,
    isLoading,
    loadSubjects,
    handleSubjectSelection,
    clearSubject,
    resetSubjects
  }
}