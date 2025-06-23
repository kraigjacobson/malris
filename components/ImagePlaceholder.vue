<template>
  <div class="w-full h-full bg-muted flex items-center justify-center">
    <div class="text-center">
      <UIcon name="i-heroicons-photo" class="text-4xl text-muted-foreground mb-2" />
      <p v-if="props.message" class="text-sm text-muted-foreground">{{ props.message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  message?: string
}

const props = withDefaults(defineProps<Props>(), {
  message: ''
})
</script>