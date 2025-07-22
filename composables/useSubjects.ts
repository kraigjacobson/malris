import { ref, watch, computed } from 'vue'
import { useSubjectsStore } from '~/stores/subjects'

interface SubjectItem {
  value: string
  label: string
}

export const useSubjects = () => {
  const subjectsStore = useSubjectsStore()
  const selectedSubject = ref<SubjectItem | null>(null)
  const searchQuery = ref('')

  // Use computed properties to get reactive data from the store
  const subjectItems = computed(() => subjectsStore.subjectItems)
  const isLoading = computed(() => subjectsStore.isLoading)

  const loadSubjects = async () => {
    await subjectsStore.searchSubjects(searchQuery.value)
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
    // Don't clear the store data, just reset local state
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

  // Initialize subjects store on first use
  subjectsStore.initializeSubjects()
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