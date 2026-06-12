import { defineStore } from 'pinia'
import localforage from 'localforage'

export interface SettingsState {
  displayImages: boolean
  requireLoginEverytime: boolean
  // Faceswap I2I source-face picker: which media purposes to show as selectable
  // faces. Independent toggles (both can be on). Persisted across sessions.
  fsShowSubjectImages: boolean
  fsShowOutputImages: boolean
  fsShowFavoritesOnly: boolean
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    displayImages: true, // Default to on since we're using base64 data now
    requireLoginEverytime: false, // Default to off for convenience
    fsShowSubjectImages: true, // Default: show the subject's source images
    fsShowOutputImages: false, // Default: hide output images
    fsShowFavoritesOnly: false // Default: show all images, not just favorites
  }),

  actions: {
    async initializeSettings() {
      try {
        const savedDisplayImages = await localforage.getItem<boolean>('displayImages')
        if (savedDisplayImages !== null) {
          this.displayImages = savedDisplayImages
        }

        const savedRequireLoginEverytime = await localforage.getItem<boolean>('requireLoginEverytime')
        if (savedRequireLoginEverytime !== null) {
          this.requireLoginEverytime = savedRequireLoginEverytime
        }

        const savedFsShowSubjectImages = await localforage.getItem<boolean>('fsShowSubjectImages')
        if (savedFsShowSubjectImages !== null) {
          this.fsShowSubjectImages = savedFsShowSubjectImages
        }

        const savedFsShowOutputImages = await localforage.getItem<boolean>('fsShowOutputImages')
        if (savedFsShowOutputImages !== null) {
          this.fsShowOutputImages = savedFsShowOutputImages
        }

        const savedFsShowFavoritesOnly = await localforage.getItem<boolean>('fsShowFavoritesOnly')
        if (savedFsShowFavoritesOnly !== null) {
          this.fsShowFavoritesOnly = savedFsShowFavoritesOnly
        }
      } catch (error) {
        console.error('Failed to load settings from localforage:', error)
      }
    },

    async setFsShowSubjectImages(value: boolean) {
      this.fsShowSubjectImages = value
      try {
        await localforage.setItem('fsShowSubjectImages', value)
      } catch (error) {
        console.error('Failed to save fsShowSubjectImages setting:', error)
      }
    },

    async setFsShowOutputImages(value: boolean) {
      this.fsShowOutputImages = value
      try {
        await localforage.setItem('fsShowOutputImages', value)
      } catch (error) {
        console.error('Failed to save fsShowOutputImages setting:', error)
      }
    },

    async setFsShowFavoritesOnly(value: boolean) {
      this.fsShowFavoritesOnly = value
      try {
        await localforage.setItem('fsShowFavoritesOnly', value)
      } catch (error) {
        console.error('Failed to save fsShowFavoritesOnly setting:', error)
      }
    },

    async setDisplayImages(value: boolean) {
      this.displayImages = value
      try {
        await localforage.setItem('displayImages', value)
      } catch (error) {
        console.error('Failed to save displayImages setting:', error)
      }
    },

    async toggleDisplayImages() {
      await this.setDisplayImages(!this.displayImages)
    },

    async setRequireLoginEverytime(value: boolean) {
      this.requireLoginEverytime = value
      try {
        await localforage.setItem('requireLoginEverytime', value)
      } catch (error) {
        console.error('Failed to save requireLoginEverytime setting:', error)
      }
    },

    async toggleRequireLoginEverytime() {
      await this.setRequireLoginEverytime(!this.requireLoginEverytime)
    }
  }
})