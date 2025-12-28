<template>
  <UModal v-model:open="isOpen" @close="handleCancel" :ui="{ overlay: 'z-[60]', content: 'z-[60]' }">
    <template #header>
      <h3 class="text-lg font-semibold leading-6">
        {{ title }}
      </h3>
    </template>
    <template #body>
      <div class="p-6">
        <p class="text-sm text-neutral-500 mb-4">
          {{ message }}
        </p>

        <!-- Display deletion preview items if present -->
        <div v-if="items && items.length > 0" class="mb-4 max-h-96 overflow-y-auto">
          <div v-for="(section, index) in items" :key="index" class="mb-4">
            <h4 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
              {{ section.label }}
            </h4>
            <div class="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-3">
              <ul class="space-y-1 max-h-48 overflow-y-auto">
                <li v-for="(item, itemIndex) in section.items" :key="itemIndex" class="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
                  {{ item }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <UButton :label="cancelLabel" color="neutral" variant="outline" size="md" @click="handleCancel" />
          <UButton v-if="alternateLabel" :label="alternateLabel" color="error" variant="outline" size="md" @click="handleAlternate" />
          <UButton :label="confirmLabel" color="error" size="lg" @click="handleConfirm" />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
const confirmDialog = useConfirmDialog()

// Destructure for easier access in template
const { isOpen, title, message, confirmLabel, alternateLabel, cancelLabel, items, handleConfirm, handleAlternate, handleCancel } = confirmDialog

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
      items: items.value
    })
  }
})
</script>
