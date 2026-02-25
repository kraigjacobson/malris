<template>
  <UModal v-model:open="isOpen" @close="handleCancel" :ui="{ overlay: 'z-[60]', content: 'z-[60]', footer: 'justify-end' }">
    <template #header>
      <h3 class="text-lg font-semibold leading-6">
        {{ title }}
      </h3>
    </template>
    <template #body>
      <div class="p-6">
        <p v-if="message" class="text-sm text-neutral-500 mb-4">
          {{ message }}
        </p>

        <!-- Display both sections if we have alternateItems -->
        <div v-if="alternateItems && alternateItems.length > 0" class="space-y-4">
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

        <!-- Single section fallback -->
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
    </template>
    <template #footer>
      <UButton :label="cancelLabel" color="neutral" variant="outline" @click="handleCancel" />
      <UButton v-if="alternateLabel" :label="alternateLabel" color="warning" variant="solid" @click="handleAlternate" />
      <UButton :label="confirmLabel" :color="variant === 'error' ? 'error' : (variant || 'primary')" variant="solid" @click="handleConfirm" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
const confirmDialog = useConfirmDialog()

const { isOpen, title, message, confirmLabel, alternateLabel, cancelLabel, variant, items, alternateItems, handleConfirm, handleAlternate, handleCancel } = confirmDialog
</script>
