<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'sm:max-w-2xl' }">
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="text-base sm:text-lg font-semibold">
          Upload {{ uploadMode === 'single' ? 'Media File' : 'Media Files' }}
        </h3>
      </div>
    </template>
    
    <template #body>
      <div class="p-3 sm:p-6">
        <div class="space-y-4">
          <!-- File Selection -->
          <div v-if="!isUploading && selectedFiles.length === 0">
            <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
              <UIcon :name="uploadMode === 'single' ? 'i-heroicons-document-plus' : 'i-heroicons-folder'" class="text-4xl text-gray-400 mb-4" />
              <p class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {{ uploadMode === 'single' ? 'Select Media File' : 'Select Media Folder' }}
              </p>
              <p class="text-sm text-gray-500 mb-4">
                {{ uploadMode === 'single' ? 'Choose a single image or video file to upload' : 'Choose a folder containing images and videos to upload' }}
              </p>
              
              <!-- Hidden file inputs -->
              <input
                ref="folderInput"
                type="file"
                webkitdirectory
                directory
                multiple
                accept="video/*,image/*,.gif"
                class="hidden"
                @change="handleFolderSelection"
              >
              <input
                ref="singleFileInput"
                type="file"
                accept="video/*,image/*,.gif"
                class="hidden"
                @change="handleSingleFileSelection"
              >
              
              <!-- Upload buttons -->
              <div class="flex gap-2 justify-center">
                <UButton
                  v-if="uploadMode === 'folder'"
                  color="primary"
                  @click="folderInput?.click()"
                >
                  <UIcon name="i-heroicons-folder-open" class="mr-2" />
                  Choose Folder
                </UButton>
                <UButton
                  v-if="uploadMode === 'single'"
                  color="primary"
                  @click="singleFileInput?.click()"
                >
                  <UIcon name="i-heroicons-document-plus" class="mr-2" />
                  Choose File
                </UButton>
                
                <!-- Switch mode button -->
                <UButton
                  variant="outline"
                  @click="switchUploadMode"
                >
                  <UIcon :name="uploadMode === 'single' ? 'i-heroicons-folder' : 'i-heroicons-document'" class="mr-2" />
                  {{ uploadMode === 'single' ? 'Upload Folder' : 'Upload Single File' }}
                </UButton>
              </div>
            </div>
          </div>

          <!-- Upload Configuration -->
          <div v-if="selectedFiles.length === 0 && !isUploading">
            <div class="space-y-4">
              <!-- Purpose Selection -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Purpose
                </label>
                <USelect
                  v-model="currentPurpose"
                  :items="uploadPurposeOptions"
                  placeholder="Select purpose..."
                  class="w-full"
                />
              </div>

              <!-- Batch Size Selection -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Batch Size
                </label>
                <USelect
                  v-model="batchSize"
                  :items="batchSizeOptions"
                  placeholder="Select batch size..."
                  class="w-full"
                />
              </div>

              <!-- Category Selection -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categories (Optional)
                </label>
                <UInputMenu
                  v-model="currentCategories"
                  multiple
                  creatable
                  :items="availableCategories"
                  :loading="loadingCategories"
                  placeholder="Select or create categories..."
                  class="w-full"
                />
                <p class="text-xs text-gray-500 mt-1">
                  Select from existing categories or type to create new ones
                </p>
              </div>
            </div>
          </div>

          <!-- Selected Files Preview -->
          <div v-if="selectedFiles.length > 0 && !isUploading">
            <div class="mb-4">
              <h4 class="text-md font-medium text-gray-900 dark:text-white mb-2">
                Selected {{ uploadMode === 'single' ? 'Media File' : 'Media Files' }} ({{ selectedFiles.length }})
              </h4>
              <p class="text-sm text-gray-500">
                {{ uploadMode === 'single' ? 'File size:' : 'Total size:' }} {{ formatFileSize(totalSize) }}
              </p>
            </div>
            
            <!-- Summary Card -->
            <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    Ready to upload {{ selectedFiles.length }} file{{ selectedFiles.length === 1 ? '' : 's' }}
                  </p>
                  <p class="text-xs text-gray-500">
                    {{ formatFileSize(totalSize) }} total{{ selectedFiles.length > 1 ? ` • Will be processed in batches of ${batchSize.value}` : '' }}
                  </p>
                </div>
                <UIcon name="i-heroicons-photo" class="text-2xl text-gray-400" />
              </div>
            </div>

            <div class="flex gap-2">
              <UButton
                color="primary"
                :loading="isUploading"
                @click="startUpload"
              >
                <UIcon name="i-heroicons-arrow-up-tray" class="mr-2" />
                Upload {{ selectedFiles.length }} Files
              </UButton>
              <UButton
                variant="outline"
                @click="clearSelection"
              >
                Clear Selection
              </UButton>
            </div>
          </div>

          <!-- Upload Progress -->
          <div v-if="isUploading">
            <div class="mb-4">
              <div class="flex justify-between items-center mb-2">
                <h4 class="text-md font-medium text-gray-900 dark:text-white">
                  Uploading Media Files...
                </h4>
                <span class="text-sm text-gray-500">
                  {{ uploadProgress.completed }} / {{ uploadProgress.total }} files
                </span>
              </div>
              <UProgress
                v-model="uploadProgress.completed"
                :max="uploadProgress.total"
                class="mb-2"
              />
              <div class="flex justify-between items-center">
                <p class="text-sm text-gray-500">
                  {{ uploadProgress.currentFile || 'Processing...' }}
                </p>
                <span class="text-xs text-gray-400">
                  {{ Math.round(uploadProgress.total > 0 ? (uploadProgress.completed / uploadProgress.total) * 100 : 0) }}%
                </span>
              </div>
              <div v-if="uploadProgress.currentBatch > 0" class="mt-1">
                <p class="text-xs text-gray-400">
                  Batch {{ uploadProgress.currentBatch }} of {{ uploadProgress.totalBatches }}
                </p>
              </div>
            </div>

            <!-- Upload Results -->
            <div v-if="uploadResults.length > 0" class="max-h-40 overflow-y-auto space-y-2">
              <div
                v-for="result in uploadResults"
                :key="result.filename"
                class="flex items-center justify-between p-2 rounded"
                :class="result.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'"
              >
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="result.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="result.success ? 'text-green-500' : 'text-red-500'"
                  />
                  <span class="text-sm font-medium">{{ result.filename }}</span>
                </div>
                <span v-if="!result.success" class="text-xs text-red-600 dark:text-red-400">
                  {{ result.error }}
                </span>
              </div>
            </div>
          </div>

          <!-- Upload Complete -->
          <div v-if="uploadComplete">
            <div class="text-center py-4">
              <UIcon name="i-heroicons-check-circle" class="text-4xl text-green-500 mb-2" />
              <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Upload Complete!
              </h4>
              <p class="text-sm text-gray-500">
                Successfully uploaded {{ uploadResults.filter(r => r.success).length }} files
                {{ uploadResults.filter(r => !r.success).length > 0 ?
                  `(${uploadResults.filter(r => !r.success).length} failed)` : '' }}
              </p>
            </div>
            
            <div class="flex gap-2 justify-center">
              <UButton
                color="primary"
                @click="closeModal"
              >
                Close
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
// Props
const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits([
  'update:isOpen',
  'close'
])

// Template refs
const folderInput = ref(null)
const singleFileInput = ref(null)

// Internal state
const uploadMode = ref('folder') // 'single' or 'folder'
const selectedFiles = ref([])
const isUploading = ref(false)
const uploadComplete = ref(false)
const uploadProgress = ref({
  completed: 0,
  total: 0,
  currentFile: '',
  currentBatch: 0,
  totalBatches: 0
})
const uploadResults = ref([])

// Upload configuration
const currentPurpose = ref({ label: 'Dest', value: 'dest' })
const currentCategories = ref([])
const batchSize = ref({ label: '5', value: 5 })

// Categories management
const availableCategories = ref([])
const loadingCategories = ref(false)

// Computed properties
const isOpen = computed({
  get: () => props.isOpen,
  set: (value) => emit('update:isOpen', value)
})

const totalSize = computed(() => {
  return selectedFiles.value.reduce((total, file) => total + file.size, 0)
})

// Upload purpose options
const uploadPurposeOptions = [
  { label: 'Dest', value: 'dest' },
  { label: 'Output', value: 'output' },
  { label: 'Voyeur', value: 'voyeur' },
  { label: 'Subject', value: 'subject' },
  { label: 'Porn', value: 'porn' },
  { label: 'Todo', value: 'todo' }
]

// Batch size options
const batchSizeOptions = [
  { label: '1', value: 1 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 }
]

// Methods
const handleFolderSelection = (event) => {
  try {
    const files = Array.from(event.target.files || [])
    
    // Filter for video and image files
    const mediaFiles = files.filter(file =>
      (file.type.startsWith('video/') || file.type.startsWith('image/') || file.type === 'image/gif') &&
      file.size > 0
    )
    
    selectedFiles.value = mediaFiles
    
    const toast = useToast()
    toast.add({
      title: 'Files Selected',
      description: `Selected ${mediaFiles.length} media files (${formatFileSize(totalSize.value)})`,
      color: 'green',
      timeout: 3000
    })
  } catch (error) {
    console.error('Error processing folder selection:', error)
  }
}

const handleSingleFileSelection = (event) => {
  try {
    const files = Array.from(event.target.files || [])
    
    // Filter for video and image files
    const mediaFiles = files.filter(file =>
      (file.type.startsWith('video/') || file.type.startsWith('image/') || file.type === 'image/gif') &&
      file.size > 0
    )
    
    selectedFiles.value = mediaFiles
    
    const toast = useToast()
    if (mediaFiles.length > 0) {
      toast.add({
        title: 'File Selected',
        description: `Selected "${mediaFiles[0].name}" (${formatFileSize(mediaFiles[0].size)})`,
        color: 'green',
        timeout: 3000
      })
    } else {
      toast.add({
        title: 'No Valid Files',
        description: 'Please select a valid image or video file',
        color: 'red',
        timeout: 3000
      })
    }
  } catch (error) {
    console.error('Error processing file selection:', error)
  }
}

const switchUploadMode = () => {
  uploadMode.value = uploadMode.value === 'single' ? 'folder' : 'single'
  selectedFiles.value = [] // Clear selection when switching modes
}

const clearSelection = () => {
  selectedFiles.value = []
}

const startUpload = async () => {
  if (selectedFiles.value.length === 0) return
  
  isUploading.value = true
  uploadComplete.value = false
  
  const BATCH_SIZE = uploadMode.value === 'single' ? 1 : batchSize.value.value
  const totalBatches = Math.ceil(selectedFiles.value.length / BATCH_SIZE)
  
  uploadProgress.value = {
    completed: 0,
    total: selectedFiles.value.length,
    currentFile: '',
    currentBatch: 0,
    totalBatches: totalBatches
  }
  uploadResults.value = []
  
  const toast = useToast()
  
  // Process files in batches
  for (let i = 0; i < selectedFiles.value.length; i += BATCH_SIZE) {
    const batch = selectedFiles.value.slice(i, i + BATCH_SIZE)
    const currentBatchNumber = Math.floor(i / BATCH_SIZE) + 1
    
    uploadProgress.value.currentBatch = currentBatchNumber
    
    try {
      // Create FormData for this batch
      const formData = new FormData()
      batch.forEach(file => {
        formData.append('media', file)
      })
      
      // Add upload configuration
      const purposeValue = typeof currentPurpose.value === 'object' ? currentPurpose.value.value : currentPurpose.value
      formData.append('purpose', purposeValue)
      
      // Add categories (extract values from objects if needed)
      const categoryValues = currentCategories.value.map(cat =>
        typeof cat === 'object' ? cat.value || cat.label : cat
      )
      formData.append('categories', JSON.stringify(categoryValues))
      
      // Update progress
      if (uploadMode.value === 'single') {
        uploadProgress.value.currentFile = `Uploading ${batch[0].name}...`
      } else {
        uploadProgress.value.currentFile = `Processing batch ${currentBatchNumber} (${batch.length} files)...`
      }
      
      // Upload batch
      const response = await $fetch('/api/media/upload-media', {
        method: 'POST',
        body: formData
      })
      
      // Process results
      if (response.results) {
        response.results.forEach(result => {
          uploadResults.value.push({
            filename: result.filename,
            success: true,
            media_uuid: result.media_uuid,
            thumbnail_uuid: result.thumbnail_uuid
          })
          uploadProgress.value.completed++
        })
      }
      
      // Process errors
      if (response.errors) {
        response.errors.forEach(error => {
          uploadResults.value.push({
            filename: error.filename,
            success: false,
            error: error.error
          })
          uploadProgress.value.completed++
        })
      }
      
    } catch (error) {
      console.error('Batch upload error:', error)
      
      // Mark all files in this batch as failed
      batch.forEach(file => {
        uploadResults.value.push({
          filename: file.name,
          success: false,
          error: error.data?.message || error.message || 'Upload failed'
        })
        uploadProgress.value.completed++
      })
      
      toast.add({
        title: 'Batch Upload Error',
        description: `Failed to upload batch: ${error.data?.message || error.message}`,
        color: 'red',
        timeout: 5000
      })
    }
  }
  
  // Upload complete
  isUploading.value = false
  uploadComplete.value = true
  
  const successCount = uploadResults.value.filter(r => r.success).length
  const failCount = uploadResults.value.filter(r => !r.success).length
  
  toast.add({
    title: 'Upload Complete',
    description: `Successfully uploaded ${successCount} files${failCount > 0 ? `, ${failCount} failed` : ''}`,
    color: successCount > 0 ? 'green' : 'red',
    timeout: 5000
  })
}

const closeModal = () => {
  emit('close')
  resetUploadState()
}

const resetUploadState = () => {
  selectedFiles.value = []
  isUploading.value = false
  uploadComplete.value = false
  uploadProgress.value = {
    completed: 0,
    total: 0,
    currentFile: '',
    currentBatch: 0,
    totalBatches: 0
  }
  uploadResults.value = []
}

const loadCategories = async () => {
  loadingCategories.value = true
  try {
    const response = await $fetch('/api/categories')
    if (response.success) {
      // Transform categories for UInputMenu format
      availableCategories.value = response.categories.map(cat => ({
        label: cat.name,
        value: cat.name,
        id: cat.id,
        color: cat.color
      }))
    }
  } catch (error) {
    console.error('Failed to load categories:', error)
    const toast = useToast()
    toast.add({
      title: 'Categories Load Error',
      description: 'Failed to load categories. You can still create new ones.',
      color: 'yellow',
      timeout: 3000
    })
  } finally {
    loadingCategories.value = false
  }
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Load categories when modal opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    loadCategories()
  }
})
</script>