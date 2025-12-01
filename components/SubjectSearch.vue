<template>
  <USelect v-model="selectedSubjects" :items="subjectItems" multiple :placeholder="placeholder" :class="inputClass"
    :disabled="disabled" @update:model-value="handleSelection" />
</template>

<script setup>

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  placeholder: {
    type: String,
    default: 'Select subjects...'
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
const selectedSubjects = ref(props.modelValue || [])

// Get all subject items with "None" option at the top
const subjectItems = computed(() => {
  // Get all subjects from cache
  const allSubjects = getSubjectItems('')

  // Add "None" option at the top
  const noneOption = { value: undefined, label: 'None' }

  return [noneOption, ...allSubjects]
})

// Handle selection
const handleSelection = (selected) => {
  // If "None" (undefined) is selected, clear the array
  if (selected.includes(undefined)) {
    selectedSubjects.value = []
    emit('update:modelValue', [])
    emit('select', [])
  } else {
    selectedSubjects.value = selected
    emit('update:modelValue', selected)
    emit('select', selected)
  }
}

// Watch for prop changes
watch(() => props.modelValue, (newValue) => {
  selectedSubjects.value = newValue || []
})

// No need to initialize - subjects are loaded globally in app.vue
</script>