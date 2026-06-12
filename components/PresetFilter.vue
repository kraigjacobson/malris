<template>
  <USelect
    v-model="proxy"
    :items="options"
    :placeholder="placeholder"
    class="w-full"
  />
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string | null | undefined
  jobType?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const presets = ref<Array<{ id: string; name: string; jobType: string }>>([])

const proxy = computed({
  get: () => props.modelValue || 'all',
  set: (value: string) => emit('update:modelValue', value === 'all' ? null : value)
})

const options = computed(() => [
  { label: 'All presets', value: 'all' },
  ...presets.value.map(p => ({ label: p.name, value: p.id }))
])

const placeholder = computed(() => props.placeholder || 'Filter by preset...')

onMounted(async () => {
  try {
    const url = props.jobType ? `/api/presets?job_type=${props.jobType}` : '/api/presets'
    const data = await $fetch<{ presets: any[] }>(url)
    presets.value = data?.presets || []
  } catch (e) {
    console.error('Failed to fetch presets for filter:', e)
  }
})
</script>
