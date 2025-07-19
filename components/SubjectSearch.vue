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

// Internal state
const selectedSubject = ref(props.modelValue)
const searchQuery = ref('')
const subjectItems = ref([])
const isLoading = ref(false)

// Debounce timer
let debounceTimer = null

// Load subjects function
const loadSubjects = async () => {
  isLoading.value = true
  try {
    const params = new URLSearchParams()
    params.append('name_only', 'true')
    params.append('limit', '100')
    
    // Add search query if provided
    if (searchQuery.value.trim()) {
      params.append('name_pattern', searchQuery.value.trim())
    }

    console.log('🔍 Loading subjects with params:', Object.fromEntries(params))
    
    // Use direct API call to media server for faster response
    const data = await $fetch(`http://localhost:8000/subjects?${params.toString()}`)
    
    console.log('📊 Subjects response:', data)
    
    if (data.subjects && Array.isArray(data.subjects)) {
      subjectItems.value = data.subjects.map((subject) => ({
        value: subject.id,
        label: subject.name
      }))
      console.log('✅ Mapped subject items:', subjectItems.value)
    } else {
      console.warn('⚠️ No subjects found in response:', data)
      subjectItems.value = []
    }
  } catch (error) {
    console.error('❌ Failed to load subjects:', error)
    subjectItems.value = []
  } finally {
    isLoading.value = false
  }
}

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

// Watch for search query changes with debounce
watch(searchQuery, () => {
  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  
  // Set new timer - wait 300ms after user stops typing
  debounceTimer = setTimeout(() => {
    loadSubjects()
  }, 300)
})

// Watch for prop changes
watch(() => props.modelValue, (newValue) => {
  selectedSubject.value = newValue
})

// Load initial subjects
onMounted(() => {
  loadSubjects()
})
</script>