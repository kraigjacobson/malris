<template>
  <USlideover v-model:open="isOpen" title="Settings" side="right">
    <template #body>
      <div class="space-y-6 p-4">
        <!-- Display Images Setting -->
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <label class="text-sm font-medium block mb-1">
              Display Images
            </label>
            <p class="text-sm text-muted-foreground">
              Show images in the media gallery. When disabled, placeholders will be shown instead.
            </p>
          </div>
          <div class="flex-shrink-0 mt-1">
            <USwitch
              v-model="settingsStore.displayImages"
              @update:model-value="handleDisplayImagesChange"
            />
          </div>
        </div>

        <!-- Require Login Everytime Setting -->
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <label class="text-sm font-medium block mb-1">
              Require Login Everytime
            </label>
            <p class="text-sm text-muted-foreground">
              When enabled, you will be logged out each time you visit the site and need to login again. This provides maximum security.
            </p>
          </div>
          <div class="flex-shrink-0 mt-1">
            <USwitch
              v-model="settingsStore.requireLoginEverytime"
              @update:model-value="handleRequireLoginEverytimeChange"
            />
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const settingsStore = useSettingsStore()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const handleDisplayImagesChange = async (value: boolean) => {
  await settingsStore.setDisplayImages(value)
}

const handleRequireLoginEverytimeChange = async (value: boolean) => {
  await settingsStore.setRequireLoginEverytime(value)
}

// Initialize settings when component mounts
onMounted(async () => {
  await settingsStore.initializeSettings()
})
</script>