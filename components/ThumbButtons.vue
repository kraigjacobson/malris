<template>
  <!-- Fixed thumb button container - positioned at left-2, bottom: 33% -->
  <div v-if="isMobile" class="fixed left-2 flex flex-col-reverse gap-3 z-50 pointer-events-auto" style="bottom: 33%">
    <!-- Slot 1 (lowest position - easiest to reach) -->
    <UButton v-if="slot1" :icon="slot1.icon" :color="slot1.color || 'neutral'" :variant="slot1.variant || 'ghost'" :size="slot1.size || 'xl'" :title="slot1.title" class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-full" square @click="$emit('thumb-click-slot-1')" @touchstart="$emit('thumb-click-slot-1')" @touchend.prevent />

    <!-- Slot 2 -->
    <UButton v-if="slot2" :icon="slot2.icon" :color="slot2.color || 'neutral'" :variant="slot2.variant || 'ghost'" :size="slot2.size || 'xl'" :title="slot2.title" class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-full" square @click="$emit('thumb-click-slot-2')" @touchstart="$emit('thumb-click-slot-2')" @touchend.prevent />

    <!-- Slot 3 -->
    <slot name="slot3">
      <UButton v-if="slot3" :icon="slot3.icon" :color="slot3.color || 'neutral'" :variant="slot3.variant || 'ghost'" :size="slot3.size || 'xl'" :title="slot3.title" class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-full" square @click="$emit('thumb-click-slot-3')" @touchstart="$emit('thumb-click-slot-3')" @touchend.prevent />
    </slot>

    <!-- Slot 4 -->
    <UButton v-if="slot4" :icon="slot4.icon" :color="slot4.color || 'neutral'" :variant="slot4.variant || 'ghost'" :size="slot4.size || 'xl'" :title="slot4.title" class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-full" square @click="$emit('thumb-click-slot-4')" @touchstart="$emit('thumb-click-slot-4')" @touchend.prevent />

    <!-- Slot 5 (highest position) -->
    <UButton v-if="slot5" :icon="slot5.icon" :color="slot5.color || 'neutral'" :variant="slot5.variant || 'ghost'" :size="slot5.size || 'xl'" :title="slot5.title" class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-full" square @click="$emit('thumb-click-slot-5')" @touchstart="$emit('thumb-click-slot-5')" @touchend.prevent />
  </div>
</template>

<script setup lang="ts">
// Use Nuxt's device detection
const { isMobile } = useDevice()

// Type for button configuration
export interface ThumbButtonConfig {
  icon: string
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  variant?: 'link' | 'ghost' | 'solid' | 'outline' | 'soft' | 'subtle'
  size?: 'xl' | 'xs' | 'sm' | 'md' | 'lg'
  title?: string
}

// Props for each button slot
defineProps<{
  slot1?: ThumbButtonConfig | null
  slot2?: ThumbButtonConfig | null
  slot3?: ThumbButtonConfig | null
  slot4?: ThumbButtonConfig | null
  slot5?: ThumbButtonConfig | null
}>()

// Define emits
defineEmits<{
  'thumb-click-slot-1': []
  'thumb-click-slot-2': []
  'thumb-click-slot-3': []
  'thumb-click-slot-4': []
  'thumb-click-slot-5': []
}>()
</script>
