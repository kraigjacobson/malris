<template>
  <UModal v-model:open="isOpen" @close="handleCancel" :fullscreen="isMobile" :ui="{ overlay: 'z-[60]', content: 'z-[60]' }">
    <template #header>
      <h3 class="text-lg font-semibold leading-6">
        {{ title }}
      </h3>
    </template>
    <template #body>
      <!-- Action buttons using ThumbButtons component -->
      <ThumbButtons :slot2="cancelButton" :slot3="alternateButton" :slot4="confirmButton" @thumb-click-slot-2="handleCancel" @thumb-click-slot-3="handleAlternate" @thumb-click-slot-4="handleConfirm" />

      <div class="p-6 relative h-full flex flex-col">
        <!-- Desktop action buttons -->
        <div v-if="!isMobile" class="relative float-left mr-4 flex flex-col-reverse gap-3 pointer-events-auto">
          <!-- Cancel - X icon (lowest on mobile for easy reach) -->
          <UButton icon="i-heroicons-x-mark" color="neutral" variant="ghost" size="xl" @click="handleCancel" class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-full" square :title="cancelLabel" />
          <!-- Delete This - Yellow trash icon (middle) -->
          <UButton v-if="alternateLabel" icon="i-heroicons-trash" color="warning" variant="ghost" size="xl" @click="handleAlternate" class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-full" square :title="alternateLabel" />
          <!-- Delete All - Red trash icon (highest) -->
          <UButton icon="i-heroicons-trash" color="error" variant="ghost" size="xl" @click="handleConfirm" class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-full" square :title="confirmLabel" />
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto" :class="{ 'sm:ml-20': !isMobile }">
          <p v-if="message" class="text-sm text-neutral-500 mb-4">
            {{ message }}
          </p>

          <!-- Display both sections side by side or stacked if we have alternateItems -->
          <div v-if="alternateItems && alternateItems.length > 0" class="space-y-4">
            <!-- Section for "Delete This" option -->
            <div class="border border-neutral-300 dark:border-neutral-600 rounded-lg p-3">
              <h3 class="text-sm font-bold text-blue-700 dark:text-blue-300 mb-3">If you click "{{ alternateLabel }}":</h3>
              <div v-for="(section, index) in alternateItems" :key="`alt-${index}`" class="mb-3 last:mb-0">
                <h4 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  {{ section.label }}
                </h4>
                <div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3">
                  <ul class="space-y-1">
                    <li v-for="(item, itemIndex) in section.items" :key="itemIndex" class="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                      {{ item }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Section for "Delete All" option -->
            <div class="border border-neutral-300 dark:border-neutral-600 rounded-lg p-3">
              <h3 class="text-sm font-bold text-error-700 dark:text-error-300 mb-3">If you click "{{ confirmLabel }}":</h3>
              <div v-for="(section, index) in items" :key="`main-${index}`" class="mb-3 last:mb-0">
                <h4 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  {{ section.label }}
                </h4>
                <div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3">
                  <ul class="space-y-1">
                    <li v-for="(item, itemIndex) in section.items" :key="itemIndex" class="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                      {{ item }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Fallback: Display single section if no alternateItems -->
          <div v-else-if="items && items.length > 0">
            <div v-for="(section, index) in items" :key="index" class="mb-4">
              <h4 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                {{ section.label }}
              </h4>
              <div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3">
                <ul class="space-y-1">
                  <li v-for="(item, itemIndex) in section.items" :key="itemIndex" class="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                    {{ item }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
// Use Nuxt's device detection
const { isMobile } = useDevice()

const confirmDialog = useConfirmDialog()

// Destructure for easier access in template
const { isOpen, title, message, confirmLabel, alternateLabel, cancelLabel, items, alternateItems, handleConfirm, handleAlternate, handleCancel } = confirmDialog

// Create button configurations
const cancelButton = computed(() => ({
  icon: 'i-heroicons-x-mark',
  title: cancelLabel.value
}))

const alternateButton = computed(() =>
  alternateLabel.value
    ? {
        icon: 'i-heroicons-trash',
        color: 'warning' as const,
        title: alternateLabel.value
      }
    : null
)

const confirmButton = computed(() => ({
  icon: 'i-heroicons-trash',
  color: 'error' as const,
  title: confirmLabel.value
}))

// Add debug logging
watch(isOpen, newVal => {
  console.log('ConfirmDialog isOpen changed to:', newVal)
  if (newVal) {
    console.log('Dialog content:', {
      title: title.value,
      message: message.value,
      confirmLabel: confirmLabel.value,
      alternateLabel: alternateLabel.value,
      cancelLabel: cancelLabel.value,
      items: items.value,
      alternateItems: alternateItems.value
    })
  }
})
</script>
