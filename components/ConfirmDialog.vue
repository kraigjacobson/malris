<template>
  <UModal v-model:open="isOpen" @close="handleCancel">
    <template #content>
      <div class="p-6">
        <h3 class="text-lg font-semibold leading-6 mb-2">
          {{ title }}
        </h3>
        <p class="text-sm text-neutral-500 mb-4">
          {{ message }}
        </p>
        <div class="flex justify-end gap-3">
          <UButton
            :label="cancelLabel"
            color="gray"
            variant="outline"
            size="md"
            @click="handleCancel"
          />
          <UButton
            :label="confirmLabel"
            color="error"
            size="lg"
            @click="handleConfirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
const confirmDialog = useConfirmDialog()

// Destructure for easier access in template
const {
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  handleConfirm,
  handleCancel
} = confirmDialog

// Add debug logging
watch(isOpen, (newVal) => {
  console.log('ConfirmDialog isOpen changed to:', newVal)
  if (newVal) {
    console.log('Dialog content:', {
      title: title.value,
      message: message.value,
      confirmLabel: confirmLabel.value,
      cancelLabel: cancelLabel.value
    })
  }
})
</script>