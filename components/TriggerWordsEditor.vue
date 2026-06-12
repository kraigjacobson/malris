<template>
  <div class="flex items-start gap-1 text-xs">
    <!-- Editing: textarea + cancel + (save if changed) -->
    <template v-if="editing">
      <UTextarea
        ref="textareaRef"
        v-model="draft"
        :rows="2"
        autoresize
        placeholder="Trigger words..."
        class="flex-1"
        @keydown.esc="cancel"
        @keydown.enter.ctrl.prevent="hasChanges && save()"
        @keydown.enter.meta.prevent="hasChanges && save()"
      />
      <UButton
        size="xs"
        variant="ghost"
        icon="i-heroicons-x-mark"
        :disabled="saving"
        @click="cancel"
      />
      <UButton
        v-if="hasChanges"
        size="xs"
        variant="solid"
        color="primary"
        icon="i-heroicons-check"
        :loading="saving"
        @click="save"
      />
    </template>

    <!-- Not editing, no trigger words: just edit button -->
    <template v-else-if="!modelValue">
      <span class="flex-1 text-gray-500 italic">No trigger words</span>
      <UButton
        size="xs"
        variant="ghost"
        icon="i-heroicons-pencil-square"
        @click="startEdit"
      />
    </template>

    <!-- Not editing, has trigger words: label + copy + edit -->
    <template v-else>
      <span class="flex-1 text-gray-300 break-words whitespace-pre-wrap">{{ modelValue }}</span>
      <UButton
        size="xs"
        variant="ghost"
        :icon="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'"
        :color="copied ? 'success' : 'neutral'"
        @click="copy"
      />
      <UButton
        size="xs"
        variant="ghost"
        icon="i-heroicons-pencil-square"
        @click="startEdit"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string | null | undefined
  loraName: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const editing = ref(false)
const draft = ref('')
const saving = ref(false)
const copied = ref(false)
const textareaRef = ref<any>(null)

const hasChanges = computed(() => draft.value !== (props.modelValue || ''))

function startEdit() {
  draft.value = props.modelValue || ''
  editing.value = true
  nextTick(() => {
    const el = textareaRef.value?.$el?.querySelector?.('textarea') || textareaRef.value?.textarea
    el?.focus?.()
  })
}

function cancel() {
  editing.value = false
  draft.value = ''
}

async function save() {
  if (!hasChanges.value) return
  saving.value = true
  const toast = useToast()
  try {
    const trimmed = draft.value.trim()
    await useApiFetch(`loras/${encodeURIComponent(props.loraName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: { trigger_words: trimmed },
    })
    emit('update:modelValue', trimmed || null)
    editing.value = false
  } catch (e: any) {
    console.error('Failed to save trigger words:', e)
    toast.add({
      title: 'Save Failed',
      description: e?.data?.statusMessage || e?.message || 'Could not save trigger words',
      color: 'error',
      duration: 4000,
    })
  } finally {
    saving.value = false
  }
}

async function copy() {
  if (!props.modelValue) return
  try {
    await navigator.clipboard.writeText(props.modelValue)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1200)
  } catch (e) {
    console.error('Clipboard write failed:', e)
  }
}
</script>
