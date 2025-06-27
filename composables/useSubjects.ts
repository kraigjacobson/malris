interface Subject {
  uuid: string
  name: string
}

interface SubjectItem {
  value: string
  label: string
}

interface SubjectsResponse {
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
      const data = await useAuthFetch('subjects', {
        query: {
          search: searchQuery.value,
          limit: 100
        }
      }) as SubjectsResponse
      
      if (data.subjects && Array.isArray(data.subjects)) {
        subjectItems.value = data.subjects.map((subject: Subject) => ({
          value: subject.uuid,
          label: subject.name
        }))
      }
    } catch (error) {
      console.error('Failed to load subjects:', error)
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

  // Auto-load subjects when search query changes
  watch(searchQuery, () => {
    loadSubjects()
  })

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