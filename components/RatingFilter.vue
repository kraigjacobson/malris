<template>
  <div class="flex items-center gap-2">
    <div class="flex items-center gap-1">
      <UIcon v-for="star in 5" :key="star" name="i-heroicons-star-solid" class="w-6 h-6 cursor-pointer transition-colors" :class="selectedRatings.includes(star) ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500'" @click="!disabled && toggleRating(star)" />
    </div>
    <UIcon name="i-heroicons-minus-circle" class="w-6 h-6 cursor-pointer transition-colors" :class="showUnrated ? 'text-red-400' : 'text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500'" :title="showUnrated ? 'Showing unrated' : 'Show unrated'" @click="!disabled && toggleShowUnrated()" />
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  showUnrated: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'update:showUnrated'])

const selectedRatings = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})

const toggleRating = rating => {
  const newRatings = [...selectedRatings.value]
  const index = newRatings.indexOf(rating)

  if (index > -1) {
    newRatings.splice(index, 1)
  } else {
    newRatings.push(rating)
  }

  emit('update:modelValue', newRatings)
}

const toggleShowUnrated = () => {
  emit('update:showUnrated', !props.showUnrated)
}
</script>
