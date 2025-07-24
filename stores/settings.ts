import { defineStore } from 'pinia'
import localforage from 'localforage'

export interface SettingsState {
  displayImages: boolean
  requireLoginEverytime: boolean
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    displayImages: true, // Default to on since we're using base64 data now
    requireLoginEverytime: false // Default to off for convenience
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
      } catch (error) {
        console.error('Failed to load settings from localforage:', error)
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