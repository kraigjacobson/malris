<template>
  <UInputMenu
    v-model="selectedSubject"
    v-model:search-term="searchQuery"
    :items="subjectItems"
    :placeholder="placeholder"
    :class="inputClass"
    by="value"
    option-attribute="label"
    searchable
    :disabled="disabled"
    @update:model-value="handleSelection"
  >
    <template #trailing>
      <UButton
        v-if="selectedSubject && selectedSubject.value"
        variant="ghost"
        size="xs"
        icon="i-heroicons-x-mark"
        @click="clearSelection"
        :disabled="disabled"
      />
    </template>
  </UInputMenu>
</template>

<script setup>
import { useSubjectsStore } from '~/stores/subjects'

const props = defineProps({
  modelValue: {
    type: Object,
    default: null
  },
  placeholder: {
    type: String,
    default: 'Search for a subject...'
  },
  disabled: {
    type: Boolean,
    default: false
  },
  inputClass: {
    type: String,
    default: 'w-full'
  }
})

const emit = defineEmits(['update:modelValue', 'select'])

// Use the subjects store
const subjectsStore = useSubjectsStore()

// Internal state
const selectedSubject = ref(props.modelValue)
const searchQuery = ref('')

// Filter subjects locally based on search query
const subjectItems = computed(() => {
  const allSubjects = subjectsStore.subjectItems
  
  // Always include "None" option at the top
  const noneOption = { value: '', label: 'None' }
  
  if (!searchQuery.value || !searchQuery.value.trim()) {
    return [noneOption, ...allSubjects]
  }
  
  const query = searchQuery.value.toLowerCase().trim()
  
  // If searching for "none", show only the none option
  if (query === 'none') {
    return [noneOption]
  }
  
  const filtered = allSubjects.filter(subject =>
    subject.label.toLowerCase().includes(query)
  )
  
  // Sort results: exact matches first, then partial matches
  const sorted = filtered.sort((a, b) => {
    const aExact = a.label.toLowerCase() === query
    const bExact = b.label.toLowerCase() === query
    const aStarts = a.label.toLowerCase().startsWith(query)
    const bStarts = b.label.toLowerCase().startsWith(query)
    
    if (aExact && !bExact) return -1
    if (!aExact && bExact) return 1
    if (aStarts && !bStarts) return -1
    if (!aStarts && bStarts) return 1
    
    return a.label.localeCompare(b.label)
  })
  
  // Include "None" option if it matches the search or if there are results
  return [noneOption, ...sorted]
})

// Handle selection
const handleSelection = (selected) => {
  selectedSubject.value = selected
  emit('update:modelValue', selected)
  emit('select', selected)
}

// Clear selection
const clearSelection = () => {
  selectedSubject.value = null
  emit('update:modelValue', null)
  emit('select', null)
}

// Watch for prop changes
watch(() => props.modelValue, (newValue) => {
  selectedSubject.value = newValue
})

// Initialize subjects store on mount
onMounted(() => {
  subjectsStore.initializeSubjects()
})
</script>