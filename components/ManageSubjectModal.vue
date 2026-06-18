<template>
  <UModal v-model:open="isOpen" fullscreen>
    <template #header>
      <div class="flex items-center justify-between w-full">
        <h3 class="text-lg font-semibold">
          {{ isEditMode ? `Manage Subject: ${subjectData.name}` : 'Add New Subject' }}
        </h3>
        <div v-if="hasMultipleSubjects && currentSubjectInfo"
          class="text-sm text-gray-600 dark:text-gray-400 font-medium">
          Subject {{ currentSubjectInfo.current }} of {{ currentSubjectInfo.total }}
        </div>
        <UButton variant="ghost" size="lg" icon="i-heroicons-x-mark" @click="closeModal"
          :disabled="isUploading || isSaving" class="ml-4" />
      </div>
    </template>

    <template #body>
      <!-- Subject Picker view (replaces normal body when moving images) -->
      <div v-if="isPickerOpen" class="h-full overflow-y-auto custom-scrollbar space-y-4">
        <div class="flex items-center justify-between sticky top-0 z-10 bg-white dark:bg-gray-900 pb-2">
          <h4 class="text-base font-semibold text-gray-800 dark:text-gray-200">
            Move {{ selectedImageUuids.size }} image{{ selectedImageUuids.size === 1 ? '' : 's' }} to:
          </h4>
          <UButton size="sm" variant="ghost" icon="i-heroicons-arrow-left" @click="closeSubjectPicker"
            :disabled="isMovingImages">
            Back
          </UButton>
        </div>

        <!-- Suggested matches (by face similarity) -->
        <div v-if="!showNewSubjectInput && (suggestionsLoading || suggestedSubjectCards.length > 0)"
          class="space-y-2 pb-2 border-b border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-2 text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400">
            <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
            <span>Suggested matches</span>
            <UIcon v-if="suggestionsLoading" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
          </div>
          <div v-if="suggestedSubjectCards.length > 0" class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            <div v-for="subject in suggestedSubjectCards" :key="`sug-${subject.id}`"
              class="aspect-square rounded-lg overflow-hidden cursor-pointer border-2 border-fuchsia-400 hover:border-fuchsia-500 transition-all bg-gray-100 dark:bg-gray-700 relative"
              :class="{ 'opacity-50 pointer-events-none': isMovingImages }"
              @click="moveImagesToSubject(subject.id, subject.name)">
              <img v-if="subject.thumbnail_url" :src="subject.thumbnail_url" :alt="subject.name"
                class="w-full h-full object-cover object-top" loading="lazy" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-user-circle" class="w-10 h-10 text-gray-400" />
              </div>
              <div class="absolute top-1 right-1 bg-fuchsia-600 text-white text-[10px] font-semibold px-1 py-0.5 rounded">
                {{ Math.round(subject.score * 100) }}%
              </div>
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
                <div class="text-xs text-white truncate">{{ subject.name }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- New Subject inline creator -->
        <div v-if="!showNewSubjectInput" class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
          <div
            class="aspect-square bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-dashed border-primary/40 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
            @click="showNewSubjectInput = true">
            <UIcon name="i-heroicons-plus-circle" class="w-8 h-8 text-primary mb-1" />
            <span class="text-xs font-medium text-primary">New Subject</span>
          </div>
          <div v-for="subject in pickerVisibleSubjects" :key="subject.id"
            class="aspect-square rounded-lg overflow-hidden cursor-pointer border-2 border-transparent hover:border-primary transition-all bg-gray-100 dark:bg-gray-700 relative"
            :class="{ 'opacity-50 pointer-events-none': isMovingImages }"
            @click="moveImagesToSubject(subject.id, subject.name)">
            <img v-if="subject.thumbnail_url" :src="subject.thumbnail_url" :alt="subject.name"
              class="w-full h-full object-cover object-top" loading="lazy" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-heroicons-user-circle" class="w-10 h-10 text-gray-400" />
            </div>
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
              <div class="text-xs text-white truncate">{{ subject.name }}</div>
            </div>
          </div>
        </div>

        <!-- Inline New Subject form -->
        <div v-if="showNewSubjectInput" class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">New Subject Name</label>
          <UInput v-model="newSubjectName" placeholder="Enter subject name..." autofocus
            :disabled="isMovingImages" @keyup.enter="createSubjectAndMove" />
          <div>
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
            <div class="flex gap-2 flex-wrap">
              <UButton v-for="opt in categoryOptions" :key="opt.value ?? 'auto'"
                :variant="newSubjectCategory === opt.value ? 'solid' : 'outline'"
                :color="newSubjectCategory === opt.value ? 'primary' : 'neutral'"
                size="xs"
                :disabled="isMovingImages"
                @click="newSubjectCategory = opt.value">
                {{ opt.label }}
              </UButton>
            </div>
          </div>
          <div class="flex gap-2">
            <UButton size="sm" color="primary" :loading="isMovingImages"
              :disabled="!newSubjectName.trim()" @click="createSubjectAndMove">
              Create &amp; Move Here
            </UButton>
            <UButton size="sm" variant="ghost" :disabled="isMovingImages"
              @click="showNewSubjectInput = false; newSubjectName = ''; newSubjectCategory = null">
              Cancel
            </UButton>
          </div>
        </div>

        <div v-if="pickerLoading" class="text-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl mb-2" />
          <p class="text-sm text-gray-500">Loading subjects...</p>
        </div>
      </div>

      <div v-else class="space-y-6 h-full overflow-y-auto custom-scrollbar" @touchstart="handleSubjectSwipeTouchStart"
        @touchmove="handleSubjectSwipeTouchMove" @touchend="handleSubjectSwipeTouchEnd">

        <!-- Subject Form -->
        <div class="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <!-- Name Field -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Subject Name *
            </label>
            <UInput v-model="subjectData.name" placeholder="Enter subject name..." :disabled="isUploading || isSaving"
              class="w-full" />
          </div>

          <!-- Tags Field -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tags
            </label>
            <UInputTags v-model="subjectData.tags" placeholder="Add tags (e.g., portrait, landscape, anime)"
              :disabled="isUploading || isSaving" class="w-full" :ui="{ trailing: 'pe-1' }">
              <template v-if="subjectData.tags?.length" #trailing>
                <UButton color="neutral" variant="link" size="sm" icon="i-lucide-circle-x" aria-label="Clear all tags"
                  @click="subjectData.tags = []" />
              </template>
            </UInputTags>
          </div>

          <!-- Category Field -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Category
            </label>
            <div class="flex gap-2 flex-wrap">
              <UButton v-for="opt in categoryOptions" :key="opt.value ?? 'auto'"
                :variant="subjectData.category === opt.value ? 'solid' : 'outline'"
                :color="subjectData.category === opt.value ? 'primary' : 'neutral'"
                size="sm"
                :disabled="isUploading || isSaving"
                @click="subjectData.category = opt.value">
                {{ opt.label }}
              </UButton>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              "Auto" infers from the subject name (celeb/asmr substring, else real).
            </p>
          </div>
        </div>

        <!-- Current Images Display -->
        <div v-if="subjectImages.length > 0" class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold text-purple-700 dark:text-purple-400">Current Images</h4>
            <UButton size="xs" color="primary" variant="solid" icon="i-heroicons-plus"
              :loading="isUploading"
              :disabled="isUploading || isSaving || !canUpload"
              title="Upload more images"
              @click="fileInput?.click()" />
          </div>
          <input ref="fileInput" type="file" multiple accept="image/*" class="hidden"
            :disabled="isUploading || isSaving || !canUpload" @change="handleFileSelection" />
          <div v-if="isUploading" class="space-y-1">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
              <span class="text-xs text-gray-500">Uploading images...</span>
            </div>
            <UProgress :value="uploadProgress" />
          </div>

          <!-- Main Image Display -->
          <div v-if="currentImage" class="text-center">
            <div v-if="settingsStore.displayImages" class="relative w-full group">
              <div ref="imageContainer"
                class="relative overflow-hidden rounded-lg shadow-lg w-full bg-gray-100 dark:bg-gray-800 h-96 md:h-[50vh] lg:h-[60vh] xl:h-[70vh]"
                style="touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;"
                @wheel.prevent="handleWheel" @mousedown.prevent="handleMouseDown" @touchstart.prevent="handleTouchStart"
                @touchmove.prevent="handleTouchMove" @touchend.prevent="handleTouchEnd" @gesturestart.prevent
                @gesturechange.prevent @gestureend.prevent>

                <img ref="zoomableImage" v-if="currentImage" :src="getImageUrl(currentImage)"
                  :alt="currentImage.filename"
                  class="absolute inset-0 w-full h-full object-contain transition-all duration-200 ease-out select-none"
                  :style="imageTransformStyle" :key="currentImage.uuid" @dragstart.prevent />
              </div>

              <!-- Left Arrow Overlay -->
              <div v-if="subjectImages.length > 1"
                class="absolute left-0 top-0 w-1/2 h-full flex items-center justify-start pl-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                @click="goToPreviousImage">
                <UIcon name="i-heroicons-chevron-left"
                  class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
              </div>

              <!-- Right Arrow Overlay -->
              <div v-if="subjectImages.length > 1"
                class="absolute right-0 top-0 w-1/2 h-full flex items-center justify-end pr-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                @click="goToNextImage">
                <UIcon name="i-heroicons-chevron-right"
                  class="w-8 h-8 text-white drop-shadow-lg hover:scale-110 transition-transform" />
              </div>

              <!-- Image Counter -->
              <div v-if="subjectImages.length > 1" class="absolute top-2 left-2">
                <div class="bg-black bg-opacity-70 text-white text-sm font-medium px-2 py-1 rounded">
                  {{ currentImageIndex + 1 }}/{{ subjectImages.length }}
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="absolute top-2 right-2 flex gap-2">
                <!-- Set as Thumbnail Button (only show if not already the thumbnail) -->
                <UButton v-if="isEditMode && currentImage && currentSubject?.thumbnail !== currentImage.uuid"
                  color="primary" variant="solid" size="sm" icon="i-heroicons-star" :loading="isSettingThumbnail"
                  @click="setAsSubjectThumbnail" class="opacity-80 hover:opacity-100 transition-opacity"
                  title="Set as subject thumbnail" />
                <!-- Crop/Edit Button -->
                <UButton v-if="isEditMode && currentImage" color="primary" variant="solid" size="sm"
                  icon="i-heroicons-scissors" @click="openCropModal"
                  class="opacity-80 hover:opacity-100 transition-opacity"
                  title="Crop image" />
                <!-- Delete Button -->
                <UButton color="error" variant="solid" size="sm" icon="i-heroicons-trash" :loading="isDeletingImage"
                  @click="confirmDeleteImage" class="opacity-80 hover:opacity-100 transition-opacity" />
              </div>

            </div>

            <!-- Image Placeholder (when images are hidden) -->
            <div v-else class="text-center py-8">
              <UIcon name="i-heroicons-photo" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p class="text-gray-600 dark:text-gray-400 mb-2">Image display is disabled</p>
              <p class="text-sm text-gray-500 dark:text-gray-500">{{ currentImage.filename }}</p>
              <div v-if="subjectImages.length > 1" class="mt-4 flex justify-center gap-4">
                <UButton variant="outline" size="sm" icon="i-heroicons-chevron-left" @click="goToPreviousImage"
                  :disabled="subjectImages.length <= 1">
                  Previous
                </UButton>
                <span class="flex items-center text-sm text-gray-500">
                  {{ currentImageIndex + 1 }} of {{ subjectImages.length }}
                </span>
                <UButton variant="outline" size="sm" icon="i-heroicons-chevron-right" @click="goToNextImage"
                  :disabled="subjectImages.length <= 1">
                  Next
                </UButton>
              </div>
            </div>

            <!-- Image Details (collapsible, under the main image) -->
            <div class="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <button type="button"
                class="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors rounded-lg"
                @click="isDetailsExpanded = !isDetailsExpanded">
                <h4 class="text-sm font-semibold text-purple-700 dark:text-purple-400">Image Details</h4>
                <UIcon
                  :name="isDetailsExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                  class="w-4 h-4 text-gray-500" />
              </button>
              <div v-if="isDetailsExpanded" class="px-4 pb-4">
                <div class="space-y-1 text-sm text-left">
                  <div>
                    <span class="font-medium text-gray-600 dark:text-gray-400">UUID:</span>
                    <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ currentImage.uuid }}</div>
                  </div>
                  <div>
                    <span class="font-medium text-gray-600 dark:text-gray-400">Filename:</span>
                    <div class="text-gray-800 dark:text-gray-200 break-all">{{ currentImage.filename }}</div>
                  </div>
                  <div v-if="currentImage.type">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Type:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.type }}</div>
                  </div>
                  <div v-if="currentImage.purpose">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Purpose:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.purpose }}</div>
                  </div>
                  <div v-if="currentImage.status">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Status:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.status }}</div>
                  </div>
                  <div v-if="currentImage.width && currentImage.height">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Dimensions:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.width }} × {{ currentImage.height }}</div>
                  </div>
                  <div v-if="currentImage.file_size">
                    <span class="font-medium text-gray-600 dark:text-gray-400">File Size:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ formatFileSize(currentImage.file_size) }}</div>
                  </div>
                  <div v-if="currentImage.original_size && currentImage.original_size !== currentImage.file_size">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Original Size:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ formatFileSize(currentImage.original_size) }}</div>
                  </div>
                  <div v-if="currentImage.duration != null">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Duration:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.duration }}s</div>
                  </div>
                  <div v-if="currentImage.fps != null">
                    <span class="font-medium text-gray-600 dark:text-gray-400">FPS:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.fps }}</div>
                  </div>
                  <div v-if="currentImage.codec">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Codec:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.codec }}</div>
                  </div>
                  <div v-if="currentImage.bitrate != null">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Bitrate:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.bitrate }} bps</div>
                  </div>
                  <div v-if="currentImage.subject_uuid">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Subject UUID:</span>
                    <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ currentImage.subject_uuid }}</div>
                  </div>
                  <div v-if="currentImage.job_id">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Job ID:</span>
                    <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ currentImage.job_id }}</div>
                  </div>
                  <div v-if="currentImage.source_media_uuid_ref">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Source Media UUID:</span>
                    <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ currentImage.source_media_uuid_ref }}</div>
                  </div>
                  <div v-if="currentImage.dest_media_uuid_ref">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Dest Media UUID:</span>
                    <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ currentImage.dest_media_uuid_ref }}</div>
                  </div>
                  <div v-if="currentImage.thumbnail_uuid">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Thumbnail UUID:</span>
                    <div class="text-gray-800 dark:text-gray-200 font-mono text-xs break-all">{{ currentImage.thumbnail_uuid }}</div>
                  </div>
                  <div v-if="currentImage.rating != null">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Rating:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.rating }}</div>
                  </div>
                  <div v-if="currentImage.favorite != null">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Favorite:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.favorite ? 'Yes' : 'No' }}</div>
                  </div>
                  <div v-if="currentImage.access_count != null">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Access Count:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.access_count }}</div>
                  </div>
                  <div v-if="currentImage.completions != null">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Completions:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.completions }}</div>
                  </div>
                  <div v-if="currentImage.created_at">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Created:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ formatDateTime(currentImage.created_at) }}</div>
                  </div>
                  <div v-if="currentImage.updated_at">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Updated:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ formatDateTime(currentImage.updated_at) }}</div>
                  </div>
                  <div v-if="currentImage.last_accessed">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Last Accessed:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ formatDateTime(currentImage.last_accessed) }}</div>
                  </div>
                  <div>
                    <span class="font-medium text-gray-600 dark:text-gray-400">
                      Tags<span v-if="currentImage.tags?.tags?.length"> ({{ currentImage.tags.tags.length }})</span><span v-if="currentImage.tags_confirmed" class="ml-1 text-green-600 dark:text-green-400" title="Confirmed">✓</span>:
                    </span>
                    <div v-if="currentImage.tags?.tags?.length" class="flex flex-wrap gap-1 mt-1">
                      <span
                        v-for="tag in currentImage.tags.tags"
                        :key="tag"
                        class="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded"
                      >
                        {{ tag }}
                      </span>
                    </div>
                    <div v-else class="text-xs text-gray-500 italic mt-1">
                      No tags yet
                    </div>
                  </div>
                  <div v-if="currentImage.tags?.rawTags">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Raw Tags:</span>
                    <div class="text-gray-800 dark:text-gray-200 text-xs break-words">{{ currentImage.tags.rawTags }}</div>
                  </div>
                  <div v-if="currentImage.tags?.model">
                    <span class="font-medium text-gray-600 dark:text-gray-400">Tag Model:</span>
                    <div class="text-gray-800 dark:text-gray-200">{{ currentImage.tags.model }}<span v-if="currentImage.tags.confidence != null"> @ {{ currentImage.tags.confidence }}</span></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- All Images Grid (replaces old thumbnail strip) -->
            <div v-if="settingsStore.displayImages && subjectImages.length > 0" class="mt-4">
              <!-- Sticky stack: grid header + (when active) selection action bar.
                   Wrapping both in one sticky container keeps them pinned together.
                   pb-2 on the sticky block + no mt on the grid means the opaque
                   background extends flush to the grid — no sliver of scrolling
                   images peeking through between the bar and the grid. -->
              <div class="sticky top-0 z-20 bg-white dark:bg-gray-900 pb-2 border-b border-gray-200 dark:border-gray-800">
                <!-- Grid toolbar: select toggle + selection count -->
                <div class="flex items-center justify-between py-2">
                  <h4 class="text-sm font-semibold text-purple-700 dark:text-purple-400">
                    All Images ({{ subjectImages.length }})
                  </h4>
                  <div class="flex items-center gap-2">
                    <span v-if="isSelectionMode && selectedImageUuids.size > 0" class="text-xs text-gray-500">
                      {{ selectedImageUuids.size }} selected
                    </span>
                    <USelect v-model="imageSortBy" :items="imageSortOptions" size="xs" class="w-40"
                      :disabled="isLoadingImages" @update:model-value="onSortChange" />
                    <UButton size="xs" :variant="isSelectionMode ? 'solid' : 'outline'"
                      :color="isSelectionMode ? 'primary' : 'neutral'"
                      :icon="isSelectionMode ? 'i-heroicons-check-circle' : 'i-heroicons-squares-plus'"
                      @click="toggleSelectionMode">
                      {{ isSelectionMode ? 'Done' : 'Select' }}
                    </UButton>
                  </div>
                </div>

                <!-- Selection action bar (sticky with the header above) -->
                <div v-if="isSelectionMode && selectedImageUuids.size > 0"
                  class="flex flex-wrap items-center justify-between gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <span class="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {{ selectedImageUuids.size }} image{{ selectedImageUuids.size === 1 ? '' : 's' }} selected
                  </span>
                  <div class="flex gap-2">
                    <UButton size="sm" variant="ghost" @click="clearSelection">Clear</UButton>
                    <UButton size="sm" color="warning" icon="i-heroicons-star"
                      :loading="isBulkFavoriting" @click="bulkMarkFavorites">
                      Favorite
                    </UButton>
                    <UButton size="sm" color="primary" icon="i-heroicons-arrow-right-circle"
                      :loading="isMovingImages" @click="openSubjectPicker">
                      Move to Subject...
                    </UButton>
                  </div>
                </div>
              </div>

              <div ref="thumbnailStrip" class="pt-2">
                <SourceImageGrid
                  :images="subjectImages"
                  :selected-uuids="selectedImageUuids"
                  :current-uuid="!isSelectionMode ? currentImage?.uuid : null"
                  :job-counts="imageJobCounts"
                  :show-job-count="true"
                  :enable-rotate="true"
                  :rotating-uuids="rotatingImageUuids"
                  :enable-favorite="true"
                  :cache-busters="imageCacheBusters"
                  @click="handleThumbnailClick"
                  @rotate="rotateImage"
                  @favorite-toggle="toggleImageFavorite"
                />
              </div>
            </div>

          </div>
        </div>

        <!-- No Images State -->
        <div v-else class="space-y-3">
          <div v-if="!isLoadingImages" class="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p class="text-gray-600 dark:text-gray-400 mb-3">
              {{ isEditMode ? 'No images found for this subject.' : 'Upload images to get started.' }}
            </p>
            <UButton color="primary" icon="i-heroicons-plus" size="sm"
              :loading="isUploading"
              :disabled="isUploading || isSaving || !canUpload"
              @click="fileInput?.click()">
              Upload Images
            </UButton>
            <input ref="fileInput" type="file" multiple accept="image/*" class="hidden"
              :disabled="isUploading || isSaving || !canUpload" @change="handleFileSelection" />
          </div>
          <div v-if="isUploading" class="space-y-1">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
              <span class="text-xs text-gray-500">Uploading images...</span>
            </div>
            <UProgress :value="uploadProgress" />
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoadingImages" class="text-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl mb-4" />
          <p class="text-gray-600 dark:text-gray-400">Loading images...</p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-between items-center w-full">
        <div class="flex gap-2">
          <UButton variant="outline" @click="closeModal" :disabled="isUploading || isSaving || isDeletingSubject">
            Cancel
          </UButton>
          <!-- Delete Subject Button (only in edit mode) -->
          <UButton v-if="isEditMode" color="error" variant="outline" :loading="isDeletingSubject"
            @click="confirmDeleteSubject" :disabled="isUploading || isSaving" icon="i-heroicons-trash">
            Delete Subject
          </UButton>
          <!-- Subject Navigation Buttons -->
          <div v-if="hasMultipleSubjects" class="flex gap-2">
            <UButton variant="outline" size="lg" :disabled="isUploading || isSaving || isDeletingSubject"
              @click="goToPreviousSubject" square class="w-12 h-12 flex items-center justify-center">
              <UIcon name="i-heroicons-chevron-left" class="w-6 h-6" />
            </UButton>
            <UButton variant="outline" size="lg" :disabled="isUploading || isSaving || isDeletingSubject"
              @click="goToNextSubject" square class="w-12 h-12 flex items-center justify-center">
              <UIcon name="i-heroicons-chevron-right" class="w-6 h-6" />
            </UButton>
          </div>
        </div>
        <div class="flex gap-2">
          <UButton v-if="!isEditMode" color="primary" :loading="isSaving" @click="createSubject"
            :disabled="!subjectData.name.trim() || isUploading || isDeletingSubject">
            Create Subject
          </UButton>
          <UButton v-else color="primary" :loading="isSaving" @click="updateSubject"
            :disabled="!subjectData.name.trim() || isUploading || isDeletingSubject">
            Save Changes
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- Full-size crop modal (image + video), opened from the crop button. -->
  <CropModal v-model:open="cropModalOpen" :media="currentImage" @cropped="onImageCropped" />
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { useGesture } from '~/composables/useGesture'
import SourceImageGrid from '~/components/SourceImageGrid.vue'

// Use Nuxt's device detection
const { isMobile } = useDevice()

// Props
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  subject: {
    type: Object,
    default: null
  },
  subjects: {
    type: Array,
    default: () => []
  },
  currentSubjectIndex: {
    type: Number,
    default: 0
  }
})

// Emits
const emit = defineEmits(['update:modelValue', 'subjectCreated', 'subjectUpdated', 'subjectChanged', 'subjectDeleted'])

// Initialize settings store
const settingsStore = useSettingsStore()

// Reactive data
const subjectData = ref({
  name: '',
  tags: [],
  note: '',
  category: null // null = auto (infer from name), otherwise 'celeb' | 'asmr' | 'real'
})

const categoryOptions = [
  { label: 'Auto', value: null },
  { label: 'Celeb', value: 'celeb' },
  { label: 'ASMR', value: 'asmr' },
  { label: 'Real', value: 'real' }
]

const subjectImages = ref([])
const currentImageIndex = ref(0)
const isLoadingImages = ref(false)
const isUploading = ref(false)
const isSaving = ref(false)
const isDeletingImage = ref(false)
const isDeletingSubject = ref(false)
const uploadProgress = ref(0)
const fileInput = ref(null)
const thumbnailStrip = ref(null)
const thumbnailRefs = ref({})
const createdSubject = ref(null)
const imageJobCounts = ref({})
const isSettingThumbnail = ref(false)
const autoThumbedSubjectId = ref(null) // guard so we auto-pick a thumbnail at most once per subject/session

// Image details collapsible (closed by default — frees up vertical space)
const isDetailsExpanded = ref(false)

// Per-image rotate state: set of in-flight uuids + cache-bust tokens for thumbnails
// (so the browser re-fetches after we overwrite the bytes on the server).
const rotatingImageUuids = ref(new Set())
const imageCacheBusters = ref({})

// Cropping is handled by the shared full-size <CropModal>; we just toggle it open.
const cropModalOpen = ref(false)

// Multi-select state for moving images between subjects
const isSelectionMode = ref(false)
const imageSortBy = ref('face_similarity')
const imageSortOptions = [
  { label: 'Oldest first', value: 'created_at' },
  { label: 'Filename', value: 'filename' },
  { label: 'Face similarity', value: 'face_similarity' }
]
const selectedImageUuids = ref(new Set())
const isPickerOpen = ref(false)
const pickerSubjects = ref([])
const pickerLoading = ref(false)
const pickerSuggestions = ref([]) // [{ subject_uuid, score, matchCount }] by face similarity
const suggestionsLoading = ref(false)
const suggestionsQueried = ref(0) // how many selected images actually had a face embedding
const showNewSubjectInput = ref(false)
const newSubjectName = ref('')
const newSubjectCategory = ref(null)
const isMovingImages = ref(false)
const isBulkFavoriting = ref(false)

// Zoom functionality reactive data
const imageContainer = ref(null)
const zoomableImage = ref(null)
const sharedZoomState = ref({
  scale: 1,
  translateX: 0,
  translateY: 0
})
const isDragging = ref(false)
const lastMousePos = ref({ x: 0, y: 0 })
const dragStart = ref({ x: 0, y: 0 })
const isZooming = ref(false)
const lastTouchDistance = ref(0)

// Computed
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const isEditMode = computed(() => !!props.subject)

const currentSubject = computed(() => props.subject || createdSubject.value)

const canUpload = computed(() => {
  return isEditMode.value || subjectData.value.name.trim()
})

const currentImage = computed(() => {
  return subjectImages.value[currentImageIndex.value] || null
})

// Subjects visible in the picker — exclude the current subject since you'd never
// move images to the subject they're already on.
const pickerVisibleSubjects = computed(() => {
  const currentId = currentSubject.value?.id
  return pickerSubjects.value.filter(s => s.id !== currentId)
})

// Face-similarity suggestions resolved to full subject objects (so we can show
// the same thumbnail/name cards), each tagged with its match score.
const suggestedSubjectCards = computed(() => {
  const byId = new Map(pickerSubjects.value.map(s => [s.id, s]))
  return pickerSuggestions.value
    .map(sug => {
      const subject = byId.get(sug.subject_uuid)
      return subject ? { ...subject, score: sug.score } : null
    })
    .filter(Boolean)
})

const imageTransformStyle = computed(() => {
  const state = sharedZoomState.value
  return {
    transform: `scale(${state.scale}) translate(${state.translateX}px, ${state.translateY}px)`,
    transformOrigin: 'center center'
  }
})

// Subject navigation computed properties
const hasMultipleSubjects = computed(() => props.subjects.length > 1)

const currentSubjectInfo = computed(() => {
  if (props.subjects.length === 0) return null
  return {
    current: props.currentSubjectIndex + 1,
    total: props.subjects.length
  }
})

// Methods
const closeModal = () => {
  if (isUploading.value || isSaving.value) return

  isOpen.value = false
  resetForm()
  resetZoom()
}

const resetForm = () => {
  subjectData.value = {
    name: '',
    tags: [],
    note: '',
    category: null
  }
  subjectImages.value = []
  currentImageIndex.value = 0
  uploadProgress.value = 0
  createdSubject.value = null
  // Reset multi-select/picker state so re-opening the modal is clean
  isSelectionMode.value = false
  selectedImageUuids.value = new Set()
  isPickerOpen.value = false
  pickerSubjects.value = []
  showNewSubjectInput.value = false
  newSubjectName.value = ''
  newSubjectCategory.value = null
  rotatingImageUuids.value = new Set()
  imageCacheBusters.value = {}
  cropModalOpen.value = false
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const openCropModal = () => {
  if (!currentImage.value) return
  cropModalOpen.value = true
}

// CropModal applied a crop — update local dims so the grid tile reflects the new
// aspect ratio immediately, and bump the cache-buster so the display + thumbnail refetch.
const onImageCropped = ({ uuid, width, height }) => {
  if (!uuid) return
  const idx = subjectImages.value.findIndex(i => i.uuid === uuid)
  if (idx !== -1) {
    const updated = { ...subjectImages.value[idx] }
    if (typeof width === 'number' && typeof height === 'number') {
      updated.width = width
      updated.height = height
    }
    subjectImages.value = [
      ...subjectImages.value.slice(0, idx),
      updated,
      ...subjectImages.value.slice(idx + 1)
    ]
  }
  imageCacheBusters.value = { ...imageCacheBusters.value, [uuid]: Date.now() }
}

// Toggle the favorite flag on a source image. Optimistically updates the local
// list so the star reacts instantly, then PUTs to the server; on failure we
// roll back and toast.
const toggleImageFavorite = async (image, newValue) => {
  if (!image?.uuid) return
  const idx = subjectImages.value.findIndex(i => i.uuid === image.uuid)
  if (idx === -1) return

  const before = !!subjectImages.value[idx].favorite
  const updated = { ...subjectImages.value[idx], favorite: newValue }
  subjectImages.value = [
    ...subjectImages.value.slice(0, idx),
    updated,
    ...subjectImages.value.slice(idx + 1)
  ]

  try {
    await useApiFetch(`media/${image.uuid}/favorite`, {
      method: 'PUT',
      body: { favorite: newValue }
    })
  } catch (error) {
    const rollback = { ...subjectImages.value[idx], favorite: before }
    subjectImages.value = [
      ...subjectImages.value.slice(0, idx),
      rollback,
      ...subjectImages.value.slice(idx + 1)
    ]
    const toast = useToast()
    toast.add({
      title: 'Favorite update failed',
      description: error.data?.statusMessage || error.message || 'Could not update favorite',
      color: 'error',
      duration: 3000
    })
  }
}

// Bulk-mark every selected image as favorite. Already-favorited images are
// skipped to avoid a useless round-trip. Optimistic local update; on partial
// failure we roll back the rows that errored and toast the count.
const bulkMarkFavorites = async () => {
  if (selectedImageUuids.value.size === 0) return
  const targets = subjectImages.value.filter(
    img => selectedImageUuids.value.has(img.uuid) && !img.favorite
  )
  if (targets.length === 0) {
    const toast = useToast()
    toast.add({
      title: 'Already favorites',
      description: 'Every selected image is already marked as favorite.',
      color: 'info',
      duration: 2500
    })
    return
  }

  isBulkFavoriting.value = true
  const targetUuids = new Set(targets.map(t => t.uuid))
  // Optimistic: flip every targeted image's favorite flag.
  subjectImages.value = subjectImages.value.map(img =>
    targetUuids.has(img.uuid) ? { ...img, favorite: true } : img
  )

  const failedUuids = []
  await Promise.all(
    targets.map(async img => {
      try {
        await useApiFetch(`media/${img.uuid}/favorite`, {
          method: 'PUT',
          body: { favorite: true }
        })
      } catch (e) {
        console.error('Bulk favorite failed for', img.uuid, e)
        failedUuids.push(img.uuid)
      }
    })
  )

  if (failedUuids.length > 0) {
    const failedSet = new Set(failedUuids)
    subjectImages.value = subjectImages.value.map(img =>
      failedSet.has(img.uuid) ? { ...img, favorite: false } : img
    )
  }

  const toast = useToast()
  const succeeded = targets.length - failedUuids.length
  if (succeeded > 0) {
    toast.add({
      title: 'Marked Favorite',
      description: `${succeeded} image${succeeded === 1 ? '' : 's'} marked as favorite${failedUuids.length > 0 ? ` (${failedUuids.length} failed)` : ''}.`,
      color: failedUuids.length > 0 ? 'warning' : 'success',
      duration: 3000
    })
  } else {
    toast.add({
      title: 'Favorite Failed',
      description: 'No images were marked as favorite.',
      color: 'error',
      duration: 4000
    })
  }
  isBulkFavoriting.value = false
}

// Rotate a single image 90° CW on the server, then refresh the local view:
// swap width/height locally (so the aspect-ratio tile flips without waiting for a refetch),
// and bump the cache-buster so the <img> URL changes and the browser redownloads.
const rotateImage = async (image) => {
  if (!image?.uuid) return
  if (rotatingImageUuids.value.has(image.uuid)) return

  const next = new Set(rotatingImageUuids.value)
  next.add(image.uuid)
  rotatingImageUuids.value = next

  try {
    const res = await useApiFetch(`media/${image.uuid}/rotate`, { method: 'POST' })

    // Swap local dims so the grid tile flips its aspect ratio immediately
    const idx = subjectImages.value.findIndex(i => i.uuid === image.uuid)
    if (idx !== -1) {
      const updated = { ...subjectImages.value[idx] }
      if (typeof res?.width === 'number' && typeof res?.height === 'number') {
        updated.width = res.width
        updated.height = res.height
      } else {
        const { width, height } = updated
        updated.width = height
        updated.height = width
      }
      subjectImages.value = [
        ...subjectImages.value.slice(0, idx),
        updated,
        ...subjectImages.value.slice(idx + 1)
      ]
    }

    // Bump cache-bust so the thumbnail URL changes and the browser refetches bytes
    imageCacheBusters.value = {
      ...imageCacheBusters.value,
      [image.uuid]: Date.now()
    }

    const toast = useToast()
    toast.add({
      title: 'Rotated',
      description: 'Image rotated 90°',
      color: 'success',
      duration: 1500
    })
  } catch (error) {
    console.error('Failed to rotate image:', error)
    const toast = useToast()
    toast.add({
      title: 'Rotate Failed',
      description: error.data?.statusMessage || error.message || 'Failed to rotate image',
      color: 'error',
      duration: 4000
    })
  } finally {
    const after = new Set(rotatingImageUuids.value)
    after.delete(image.uuid)
    rotatingImageUuids.value = after
  }
}

const handleThumbnailClick = (image) => {
  if (isSelectionMode.value) {
    const next = new Set(selectedImageUuids.value)
    if (next.has(image.uuid)) next.delete(image.uuid)
    else next.add(image.uuid)
    selectedImageUuids.value = next
    return
  }
  const idx = subjectImages.value.findIndex(i => i.uuid === image.uuid)
  if (idx >= 0) currentImageIndex.value = idx
}

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value
  if (!isSelectionMode.value) clearSelection()
}

const clearSelection = () => {
  selectedImageUuids.value = new Set()
}

const openSubjectPicker = async () => {
  if (selectedImageUuids.value.size === 0) return
  isPickerOpen.value = true
  pickerLoading.value = true
  try {
    const data = await useApiFetch('subjects/search', {
      query: { sort_by: 'name', sort_order: 'asc' }
    })
    pickerSubjects.value = data?.subjects || []
  } catch (e) {
    console.error('Failed to load subjects for picker:', e)
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: 'Failed to load subjects',
      color: 'error',
      duration: 3000
    })
  } finally {
    pickerLoading.value = false
  }

  // Fetch face-similarity suggestions for the selected images (best-effort).
  loadSubjectSuggestions()
}

// Ask the backend which subjects the selected images most likely belong to,
// by face similarity. Best-effort: silently no-ops if nothing has embeddings.
const loadSubjectSuggestions = async () => {
  pickerSuggestions.value = []
  suggestionsQueried.value = 0
  const media_uuids = Array.from(selectedImageUuids.value)
  if (media_uuids.length === 0) return

  suggestionsLoading.value = true
  try {
    const res = await useApiFetch('media/faces/suggest-subjects', {
      method: 'POST',
      body: {
        mediaUuids: media_uuids,
        excludeSubjectUuid: currentSubject.value?.id
      }
    })
    pickerSuggestions.value = res?.suggestions || []
    suggestionsQueried.value = res?.queried ?? 0
  } catch (e) {
    console.error('Failed to load subject suggestions:', e)
  } finally {
    suggestionsLoading.value = false
  }
}

const closeSubjectPicker = () => {
  isPickerOpen.value = false
  showNewSubjectInput.value = false
  newSubjectName.value = ''
  newSubjectCategory.value = null
  pickerSuggestions.value = []
  suggestionsQueried.value = 0
}

const moveImagesToSubject = async (targetSubjectId, targetSubjectName) => {
  if (!targetSubjectId || selectedImageUuids.value.size === 0) return

  isMovingImages.value = true
  try {
    const media_uuids = Array.from(selectedImageUuids.value)
    const res = await useApiFetch('media/reassign-subject', {
      method: 'POST',
      body: { media_uuids, subject_uuid: targetSubjectId }
    })

    const moved = res?.updated ?? media_uuids.length
    const toast = useToast()
    toast.add({
      title: 'Images Moved',
      description: `Moved ${moved} image${moved === 1 ? '' : 's'} to "${targetSubjectName}"`,
      color: 'success',
      duration: 3000
    })

    // Let parents know so they can refresh lists/thumbnails
    emit('subjectUpdated', { ...currentSubject.value })

    // Reset selection + picker state and reload this subject's images
    clearSelection()
    isSelectionMode.value = false
    closeSubjectPicker()
    await loadSubjectImages()
  } catch (error) {
    console.error('Failed to move images:', error)
    const toast = useToast()
    toast.add({
      title: 'Move Failed',
      description: error.data?.statusMessage || error.message || 'Failed to move images',
      color: 'error',
      duration: 5000
    })
  } finally {
    isMovingImages.value = false
  }
}

const createSubjectAndMove = async () => {
  const name = newSubjectName.value.trim()
  if (!name || selectedImageUuids.value.size === 0) return

  isMovingImages.value = true
  try {
    const created = await useApiFetch('subjects/create', {
      method: 'POST',
      body: { name, tags: [], category: newSubjectCategory.value }
    })

    if (!created?.id) {
      throw new Error('Subject creation did not return an id')
    }

    newSubjectName.value = ''
    showNewSubjectInput.value = false
    // Hand off to the regular move flow (this also handles toast + cleanup)
    await moveImagesToSubject(created.id, created.name || name)
  } catch (error) {
    console.error('Failed to create subject and move:', error)
    const toast = useToast()
    toast.add({
      title: 'Create Failed',
      description: error.data?.message || error.message || 'Failed to create subject',
      color: 'error',
      duration: 5000
    })
  } finally {
    isMovingImages.value = false
  }
}

const loadSubjectData = () => {
  if (props.subject) {
    subjectData.value = {
      name: props.subject.name || '',
      tags: props.subject.tags?.tags || [],
      note: props.subject.note || '',
      category: props.subject.category ?? null
    }
    loadSubjectImages()
  }
}

const loadSubjectImages = async () => {
  if (!currentSubject.value?.id) return

  isLoadingImages.value = true
  try {
    const response = await useApiFetch('media/search', {
      query: {
        subject_uuid: currentSubject.value.id,
        purpose: 'source',
        media_type: 'image',
        limit: 1000,
        sort_by: imageSortBy.value,
        sort_order: 'asc'
      }
    })

    subjectImages.value = response.results || []
    currentImageIndex.value = 0

    // Fetch job counts for the loaded images
    await fetchImageJobCounts()

    // New/blank subjects: auto-pick the first image as the main thumbnail so the
    // card isn't blank until manually chosen.
    await ensureSubjectThumbnail()
  } catch (error) {
    console.error('Failed to load subject images:', error)
    subjectImages.value = []
  } finally {
    isLoadingImages.value = false
  }
}

// Re-fetch with the new sort when the dropdown changes. We set the value
// explicitly from the event payload (rather than relying on v-model timing) so
// loadSubjectImages always reads the freshly-selected sort.
const onSortChange = (value) => {
  if (value == null) return
  imageSortBy.value = value
  loadSubjectImages()
}

const handleFileSelection = async (event) => {
  const files = Array.from(event.target.files || [])
  if (files.length === 0) return

  if (!canUpload.value) {
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: 'Please enter a subject name before uploading images',
      color: 'red',
      timeout: 3000
    })
    return
  }

  // If we're creating a new subject, create it first
  if (!isEditMode.value) {
    const created = await createSubject(false)
    if (!created) return

    // Wait a moment for the subject to be fully created
    await nextTick()
  }

  await uploadImages(files)
}

const uploadImages = async (files) => {
  if (!currentSubject.value?.id) return

  isUploading.value = true
  uploadProgress.value = 0

  try {
    const formData = new FormData()
    formData.append('subject_uuid', currentSubject.value.id)

    files.forEach(file => {
      formData.append('images', file)
    })

    const response = await $fetch('/api/media/upload-subject-images', {
      method: 'POST',
      body: formData,
      onUploadProgress: (progress) => {
        uploadProgress.value = Math.round((progress.loaded / progress.total) * 100)
      }
    })

    if (response.success) {
      const toast = useToast()
      toast.add({
        title: 'Success',
        description: response.message,
        color: 'green',
        timeout: 3000
      })

      // Reload images (this will also fetch job counts)
      await loadSubjectImages()

      // Clear file input
      if (fileInput.value) {
        fileInput.value.value = ''
      }
    }
  } catch (error) {
    console.error('Upload failed:', error)
    const toast = useToast()
    toast.add({
      title: 'Upload Failed',
      description: error.data?.message || 'Failed to upload images',
      color: 'red',
      timeout: 5000
    })
  } finally {
    isUploading.value = false
    uploadProgress.value = 0
  }
}

const createSubject = async (closeAfter = true) => {
  if (!subjectData.value.name.trim()) return false

  isSaving.value = true
  try {
    const response = await useApiFetch('subjects/create', {
      method: 'POST',
      body: {
        name: subjectData.value.name.trim(),
        tags: subjectData.value.tags,
        note: subjectData.value.note.trim() || null,
        category: subjectData.value.category
      }
    })

    if (response.id) {
      // Create a temporary subject object for subsequent operations
      const newSubject = {
        id: response.id,
        name: response.name || subjectData.value.name,
        created_at: response.created_at
      }

      // Update the component's subject reference for image uploads
      createdSubject.value = newSubject

      // Emit the created subject
      emit('subjectCreated', newSubject)

      const toast = useToast()
      toast.add({
        title: 'Success',
        description: 'Subject created successfully',
        color: 'green',
        timeout: 3000
      })

      if (closeAfter) {
        closeModal()
      }
      return newSubject
    }
  } catch (error) {
    console.error('Failed to create subject:', error)
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to create subject',
      color: 'red',
      timeout: 5000
    })
    return false
  } finally {
    isSaving.value = false
  }
}

const updateSubject = async () => {
  if (!currentSubject.value?.id || !subjectData.value.name.trim()) return

  isSaving.value = true
  try {
    const trimmedName = subjectData.value.name.trim()

    // Update name if it changed
    const prevName = props.subject?.name || ''
    if (trimmedName !== prevName) {
      await useApiFetch(`subjects/${currentSubject.value.id}`, {
        method: 'PATCH',
        body: { name: trimmedName }
      })
    }

    // Update subject tags
    await useApiFetch(`subjects/${currentSubject.value.id}/tags`, {
      method: 'PUT',
      body: {
        tags: subjectData.value.tags
      }
    })

    // Only PUT category when it actually changed — avoids a needless round trip
    const prevCategory = props.subject?.category ?? null
    if (subjectData.value.category !== prevCategory) {
      await useApiFetch(`subjects/${currentSubject.value.id}/category`, {
        method: 'PUT',
        body: { category: subjectData.value.category }
      })
    }

    emit('subjectUpdated', {
      ...currentSubject.value,
      name: trimmedName,
      tags: { tags: subjectData.value.tags },
      category: subjectData.value.category
    })

    const toast = useToast()
    toast.add({
      title: 'Success',
      description: 'Subject updated successfully',
      color: 'green',
      duration: 500
    })

    closeModal()
  } catch (error) {
    console.error('Failed to update subject:', error)
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to update subject',
      color: 'red',
      timeout: 5000
    })
  } finally {
    isSaving.value = false
  }
}

const confirmDeleteImage = async () => {
  if (!currentImage.value) return

  const confirmed = confirm(`Are you sure you want to delete "${currentImage.value.filename}"? This action cannot be undone.`)

  if (!confirmed) return

  await deleteCurrentImage()
}

const deleteCurrentImage = async () => {
  if (!currentImage.value) return

  isDeletingImage.value = true
  try {
    await useApiFetch(`media/${currentImage.value.uuid}/delete`, {
      method: 'DELETE'
    })

    // Remove from local array
    subjectImages.value.splice(currentImageIndex.value, 1)

    // Adjust current index if necessary
    if (subjectImages.value.length === 0) {
      currentImageIndex.value = 0
    } else if (currentImageIndex.value >= subjectImages.value.length) {
      currentImageIndex.value = subjectImages.value.length - 1
    }

    const toast = useToast()
    toast.add({
      title: 'Success',
      description: 'Image deleted successfully',
      color: 'success',
      duration: 500
    })
  } catch (error) {
    console.error('Failed to delete image:', error)
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: 'Failed to delete image',
      color: 'error',
      duration: 2000
    })
  } finally {
    isDeletingImage.value = false
  }
}

const goToPreviousImage = () => {
  if (subjectImages.value.length > 1) {
    if (currentImageIndex.value > 0) {
      currentImageIndex.value--
    } else {
      currentImageIndex.value = subjectImages.value.length - 1
    }
    scrollToCurrentThumbnail()
  }
}

const goToNextImage = () => {
  if (subjectImages.value.length > 1) {
    if (currentImageIndex.value < subjectImages.value.length - 1) {
      currentImageIndex.value++
    } else {
      currentImageIndex.value = 0
    }
    scrollToCurrentThumbnail()
  }
}

const scrollToCurrentThumbnail = () => {
  nextTick(() => {
    if (thumbnailStrip.value && thumbnailRefs.value[currentImageIndex.value]) {
      const selectedThumbnail = thumbnailRefs.value[currentImageIndex.value]
      const stripContainer = thumbnailStrip.value

      const thumbnailLeft = selectedThumbnail.offsetLeft
      const thumbnailWidth = selectedThumbnail.offsetWidth
      const stripWidth = stripContainer.clientWidth

      const scrollPosition = thumbnailLeft - (stripWidth / 2) + (thumbnailWidth / 2)

      stripContainer.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
      })
    }
  })
}

const formatFileSize = (bytes) => {
  if (!bytes) return 'Unknown'
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

const formatDateTime = (value) => {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

const getImageUrl = (image, size = 'full') => {
  // 'full' returns the unaltered original — the smaller sizes (md/lg) use
  // sharp's fit:'cover', position:'top' which silently crops the image to a
  // 3:4 portrait, hiding the bottom. We want the whole image in the main view.
  if (!image || !image.uuid) return ''
  const v = imageCacheBusters.value?.[image.uuid]
  return v
    ? `/api/media/${image.uuid}/image?size=${size}&v=${v}`
    : `/api/media/${image.uuid}/image?size=${size}`
}

const getThumbnailUrl = (image) => {
  if (!image || !image.uuid) return ''
  return `/api/media/${image.uuid}/image?size=thumbnail`
}

const fetchImageJobCounts = async () => {
  if (subjectImages.value.length === 0) return

  try {
    const imageUuids = subjectImages.value.map(image => image.uuid)
    const response = await $fetch('/api/media/job-counts', {
      method: 'POST',
      body: {
        image_uuids: imageUuids
      }
    })

    if (response.success) {
      imageJobCounts.value = response.job_counts
    }
  } catch (error) {
    console.error('Failed to fetch image job counts:', error)
    // Don't show error to user as this is supplementary information
  }
}

// If a subject has no main image yet, set the first loaded image as its
// thumbnail. Runs after loadSubjectImages; guarded so it fires at most once per
// subject per session.
const ensureSubjectThumbnail = async () => {
  const subj = currentSubject.value
  if (!subj?.id || subj.thumbnail) return
  if (autoThumbedSubjectId.value === subj.id) return
  const first = subjectImages.value[0]
  if (!first?.uuid) return

  autoThumbedSubjectId.value = subj.id
  try {
    await useApiFetch(`subjects/${subj.id}/thumbnail`, {
      method: 'PUT',
      body: { thumbnail_uuid: first.uuid }
    })
    if (createdSubject.value) createdSubject.value.thumbnail = first.uuid
    emit('subjectUpdated', { ...subj, thumbnail: first.uuid })
  } catch (e) {
    console.error('Failed to auto-set subject thumbnail:', e)
    autoThumbedSubjectId.value = null // allow a retry next load
  }
}

const setAsSubjectThumbnail = async () => {
  if (!currentImage.value || !currentSubject.value?.id) return

  isSettingThumbnail.value = true
  try {
    await useApiFetch(`subjects/${currentSubject.value.id}/thumbnail`, {
      method: 'PUT',
      body: {
        thumbnail_uuid: currentImage.value.uuid
      }
    })

    // Emit event to update the subject in parent component
    if (props.subject) {
      emit('subjectUpdated', {
        ...props.subject,
        thumbnail: currentImage.value.uuid
      })
    }
    if (createdSubject.value) {
      createdSubject.value.thumbnail = currentImage.value.uuid
    }

    const toast = useToast()
    toast.add({
      title: 'Success',
      description: 'Subject thumbnail updated successfully',
      color: 'success',
      duration: 3000
    })
  } catch (error) {
    console.error('Failed to set thumbnail:', error)
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to set thumbnail',
      color: 'error',
      duration: 3000
    })
  } finally {
    isSettingThumbnail.value = false
  }
}

const confirmDeleteSubject = async () => {
  if (!currentSubject.value) return

  const confirmed = confirm(
    `Are you sure you want to delete "${currentSubject.value.name}"?\n\n` +
    `This will permanently delete:\n` +
    `- The subject\n` +
    `- All associated images\n` +
    `- All associated jobs\n\n` +
    `This action cannot be undone.`
  )

  if (!confirmed) return

  await deleteSubject()
}

const deleteSubject = async () => {
  if (!currentSubject.value?.id) return

  isDeletingSubject.value = true
  try {
    const response = await useApiFetch(`subjects/${currentSubject.value.id}/delete`, {
      method: 'DELETE'
    })

    const toast = useToast()
    toast.add({
      title: 'Success',
      description: response.message || 'Subject deleted successfully',
      color: 'success',
      duration: 3000
    })

    // Emit event to parent to refresh and close modal
    emit('subjectDeleted', currentSubject.value)

    // Close modal
    closeModal()
  } catch (error) {
    console.error('Failed to delete subject:', error)
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to delete subject',
      color: 'error',
      duration: 5000
    })
  } finally {
    isDeletingSubject.value = false
  }
}

// Zoom functionality methods
const updateSharedZoom = (updates) => {
  Object.assign(sharedZoomState.value, updates)
}

const resetZoom = () => {
  updateSharedZoom({ scale: 1, translateX: 0, translateY: 0 })
}

const constrainTranslation = (scale, translateX, translateY) => {
  if (!imageContainer.value || !zoomableImage.value) return { translateX, translateY }

  const containerRect = imageContainer.value.getBoundingClientRect()
  const imageRect = zoomableImage.value.getBoundingClientRect()

  const scaledWidth = imageRect.width * scale
  const scaledHeight = imageRect.height * scale

  const maxTranslateX = Math.max(0, (scaledWidth - containerRect.width) / 2 / scale)
  const maxTranslateY = Math.max(0, (scaledHeight - containerRect.height) / 2 / scale)

  return {
    translateX: Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX)),
    translateY: Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY))
  }
}

const handleWheel = (event) => {
  if (!currentImage.value) return

  event.preventDefault()

  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const currentState = sharedZoomState.value
  const newScale = Math.max(0.5, Math.min(5, currentState.scale + delta))

  if (newScale !== currentState.scale) {
    updateSharedZoom({ scale: newScale })
  }
}

const handleMouseDown = (event) => {
  if (!currentImage.value || sharedZoomState.value.scale <= 1) return

  event.preventDefault()
  isDragging.value = true
  lastMousePos.value = { x: event.clientX, y: event.clientY }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const handleMouseMove = (event) => {
  if (!isDragging.value || !currentImage.value) return

  const deltaX = event.clientX - lastMousePos.value.x
  const deltaY = event.clientY - lastMousePos.value.y

  const currentState = sharedZoomState.value
  const newTranslateX = currentState.translateX + deltaX / currentState.scale
  const newTranslateY = currentState.translateY + deltaY / currentState.scale

  const constrained = constrainTranslation(currentState.scale, newTranslateX, newTranslateY)
  updateSharedZoom(constrained)

  lastMousePos.value = { x: event.clientX, y: event.clientY }
}

const handleMouseUp = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
}

const getTouchDistance = (touches) => {
  if (touches.length < 2) return 0

  const touch1 = touches[0]
  const touch2 = touches[1]

  return Math.sqrt(
    Math.pow(touch2.clientX - touch1.clientX, 2) +
    Math.pow(touch2.clientY - touch1.clientY, 2)
  )
}

const handleTouchStart = (event) => {
  if (!currentImage.value) return

  event.preventDefault()
  event.stopPropagation()

  if (event.touches.length === 1) {
    if (sharedZoomState.value.scale > 1) {
      isDragging.value = true
      const touch = event.touches[0]
      dragStart.value = { x: touch.clientX, y: touch.clientY }
    }
  } else if (event.touches.length === 2) {
    isZooming.value = true
    isDragging.value = false
    lastTouchDistance.value = getTouchDistance(event.touches)
  }
}

const handleTouchMove = (event) => {
  if (!currentImage.value) return

  event.preventDefault()
  event.stopPropagation()

  if (event.touches.length === 1 && isDragging.value) {
    const touch = event.touches[0]
    const deltaX = touch.clientX - dragStart.value.x
    const deltaY = touch.clientY - dragStart.value.y

    const currentState = sharedZoomState.value
    const newTranslateX = currentState.translateX + deltaX / currentState.scale
    const newTranslateY = currentState.translateY + deltaY / currentState.scale

    const constrained = constrainTranslation(currentState.scale, newTranslateX, newTranslateY)
    updateSharedZoom(constrained)

    dragStart.value = { x: touch.clientX, y: touch.clientY }
  } else if (event.touches.length === 2 && isZooming.value) {
    const currentDistance = getTouchDistance(event.touches)
    const distanceRatio = currentDistance / lastTouchDistance.value

    const currentState = sharedZoomState.value
    const newScale = Math.max(0.5, Math.min(5, currentState.scale * distanceRatio))

    updateSharedZoom({ scale: newScale })
    lastTouchDistance.value = currentDistance
  }
}

const handleTouchEnd = (event) => {
  event.preventDefault()
  event.stopPropagation()

  if (event.touches.length === 0) {
    isDragging.value = false
    isZooming.value = false
  } else if (event.touches.length === 1) {
    isZooming.value = false
    if (sharedZoomState.value.scale > 1) {
      isDragging.value = true
      const touch = event.touches[0]
      dragStart.value = { x: touch.clientX, y: touch.clientY }
    }
  }
}

// Subject navigation gesture handling
const {
  handleTouchStart: originalSubjectSwipeTouchStart,
  handleTouchMove: originalSubjectSwipeTouchMove,
  handleTouchEnd: originalSubjectSwipeTouchEnd
} = useGesture({
  minSwipeDistance: 50,
  onSwipeLeft: () => {
    console.log('🔥 [GESTURE DEBUG] onSwipeLeft callback triggered', {
      hasMultipleSubjects: hasMultipleSubjects.value,
      subjects: props.subjects,
      currentIndex: props.currentSubjectIndex
    })
    if (hasMultipleSubjects.value) {
      console.log('🔥 [GESTURE DEBUG] Calling goToNextSubject')
      goToNextSubject()
    } else {
      console.log('🔥 [GESTURE DEBUG] Not calling goToNextSubject - hasMultipleSubjects is false')
    }
  },
  onSwipeRight: () => {
    console.log('🔥 [GESTURE DEBUG] onSwipeRight callback triggered', {
      hasMultipleSubjects: hasMultipleSubjects.value,
      subjects: props.subjects,
      currentIndex: props.currentSubjectIndex
    })
    if (hasMultipleSubjects.value) {
      console.log('🔥 [GESTURE DEBUG] Calling goToPreviousSubject')
      goToPreviousSubject()
    } else {
      console.log('🔥 [GESTURE DEBUG] Not calling goToPreviousSubject - hasMultipleSubjects is false')
    }
  },
  debug: true
})

// Wrapper functions that check for image container and thumbnail strip interference
const handleSubjectSwipeTouchStart = (event) => {
  console.log('🔥 [SUBJECT SWIPE DEBUG] handleSubjectSwipeTouchStart called', {
    target: event.target,
    imageContainer: imageContainer.value,
    thumbnailStrip: thumbnailStrip.value,
    imageContainerContains: imageContainer.value?.contains(event.target),
    thumbnailStripContains: thumbnailStrip.value?.contains(event.target),
    targetClasses: event.target?.className
  })

  // Check if the touch is within the image container or thumbnail strip
  if ((imageContainer.value && imageContainer.value.contains(event.target)) ||
    (thumbnailStrip.value && thumbnailStrip.value.contains(event.target))) {
    console.log('🔥 [SUBJECT SWIPE DEBUG] Touch started within image container or thumbnail strip, ignoring for subject swipe')
    return
  }

  console.log('🔥 [SUBJECT SWIPE DEBUG] Calling original touch start handler')
  originalSubjectSwipeTouchStart(event)
}

const handleSubjectSwipeTouchMove = (event) => {
  console.log('🔥 [SUBJECT SWIPE DEBUG] handleSubjectSwipeTouchMove called')

  // Check if the touch is within the image container or thumbnail strip
  if ((imageContainer.value && imageContainer.value.contains(event.target)) ||
    (thumbnailStrip.value && thumbnailStrip.value.contains(event.target))) {
    console.log('🔥 [SUBJECT SWIPE DEBUG] Touch moved within image container or thumbnail strip, ignoring for subject swipe')
    return
  }

  console.log('🔥 [SUBJECT SWIPE DEBUG] Calling original touch move handler')
  originalSubjectSwipeTouchMove(event)
}

const handleSubjectSwipeTouchEnd = (event) => {
  console.log('🔥 [SUBJECT SWIPE DEBUG] handleSubjectSwipeTouchEnd called')

  // Check if the touch is within the image container or thumbnail strip
  if ((imageContainer.value && imageContainer.value.contains(event.target)) ||
    (thumbnailStrip.value && thumbnailStrip.value.contains(event.target))) {
    console.log('🔥 [SUBJECT SWIPE DEBUG] Touch ended within image container or thumbnail strip, ignoring for subject swipe')
    return
  }

  console.log('🔥 [SUBJECT SWIPE DEBUG] Calling original touch end handler')
  originalSubjectSwipeTouchEnd(event)
}

// Subject navigation methods
const goToPreviousSubject = () => {
  console.log('🔥 [SUBJECT NAV DEBUG] goToPreviousSubject called', {
    hasMultipleSubjects: hasMultipleSubjects.value,
    currentIndex: props.currentSubjectIndex,
    totalSubjects: props.subjects.length,
    subjects: props.subjects
  })

  if (hasMultipleSubjects.value) {
    let newIndex
    if (props.currentSubjectIndex > 0) {
      newIndex = props.currentSubjectIndex - 1
    } else {
      // Wrap to last subject
      newIndex = props.subjects.length - 1
    }
    const newSubject = props.subjects[newIndex]
    console.log('🔥 [SUBJECT NAV DEBUG] Emitting subjectChanged', { newSubject, newIndex })
    emit('subjectChanged', { subject: newSubject, index: newIndex })
  } else {
    console.log('🔥 [SUBJECT NAV DEBUG] Cannot navigate - no multiple subjects')
  }
}

const goToNextSubject = () => {
  console.log('🔥 [SUBJECT NAV DEBUG] goToNextSubject called', {
    hasMultipleSubjects: hasMultipleSubjects.value,
    currentIndex: props.currentSubjectIndex,
    totalSubjects: props.subjects.length,
    subjects: props.subjects
  })

  if (hasMultipleSubjects.value) {
    let newIndex
    if (props.currentSubjectIndex < props.subjects.length - 1) {
      newIndex = props.currentSubjectIndex + 1
    } else {
      // Wrap to first subject
      newIndex = 0
    }
    const newSubject = props.subjects[newIndex]
    console.log('🔥 [SUBJECT NAV DEBUG] Emitting subjectChanged', { newSubject, newIndex })
    emit('subjectChanged', { subject: newSubject, index: newIndex })
  } else {
    console.log('🔥 [SUBJECT NAV DEBUG] Cannot navigate - no multiple subjects')
  }
}

// Watch for modal opening/closing
watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    console.log('🔥 [MODAL DEBUG] Modal opened with props:', {
      subject: props.subject,
      subjects: props.subjects,
      currentSubjectIndex: props.currentSubjectIndex,
      hasMultipleSubjects: hasMultipleSubjects.value,
      currentSubjectInfo: currentSubjectInfo.value
    })
    loadSubjectData()
    resetZoom()
  } else {
    resetForm()
    resetZoom()
  }
})

// Watch for subject prop changes to reload data when navigating between subjects
watch(() => props.subject, (newSubject, oldSubject) => {
  if (newSubject && oldSubject && newSubject.id !== oldSubject.id) {
    console.log('🔥 [SUBJECT CHANGE DEBUG] Subject prop changed, reloading data', {
      oldSubject: oldSubject?.name,
      newSubject: newSubject?.name
    })
    loadSubjectData()
    resetZoom()
  }
}, { deep: true })

// Watch for currentImageIndex changes to auto-scroll thumbnail strip
watch(() => currentImageIndex.value, () => {
  scrollToCurrentThumbnail()
})

// Keyboard navigation handler
const handleKeydown = (event) => {
  if (!isOpen.value) return

  const tag = event.target?.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd + Left Arrow: Previous subject
        if (hasMultipleSubjects.value) {
          goToPreviousSubject()
        }
      } else if (subjectImages.value.length > 0) {
        // Left Arrow: Previous image
        goToPreviousImage()
      }
      break
    case 'ArrowRight':
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd + Right Arrow: Next subject
        if (hasMultipleSubjects.value) {
          goToNextSubject()
        }
      } else if (subjectImages.value.length > 0) {
        // Right Arrow: Next image
        goToNextImage()
      }
      break
    case 'Escape':
      event.preventDefault()
      closeModal()
      break
    case '0':
    case 'r':
    case 'R':
      // Reset zoom with '0' or 'r' key
      event.preventDefault()
      resetZoom()
      break
  }
}

// Initialize settings on mount
onMounted(async () => {
  await settingsStore.initializeSettings()
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.custom-scrollbar {
  scrollbar-width: none;
  /* Firefox */
  -ms-overflow-style: none;
  /* Internet Explorer 10+ */
}

.custom-scrollbar::-webkit-scrollbar {
  display: none;
  /* Safari and Chrome */
}
</style>