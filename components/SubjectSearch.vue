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

// Use the subjects composable
const { getSubjectItems } = useSubjects()

// Internal state
const selectedSubject = ref(props.modelValue)
const searchQuery = ref('')

// Filter subjects locally based on search query
const subjectItems = computed(() => {
  // Get filtered subjects from cache
  const filteredSubjects = getSubjectItems(searchQuery.value)

  // Always include "None" option at the top
  const noneOption = { value: '', label: 'None' }

  // If searching for "none", show only the none option
  if (searchQuery.value && searchQuery.value.toLowerCase().trim() === 'none') {
    return [noneOption]
  }

  // Include "None" option with filtered results
  return [noneOption, ...filteredSubjects]
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

// No need to initialize - subjects are loaded globally in app.vue
</script>