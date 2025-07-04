import { defineStore } from 'pinia'
import localforage from 'localforage'

export interface SettingsState {
  displayImages: boolean
  requireLoginEverytime: boolean
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    displayImages: false, // Default to off as requested
  requireLoginEverytime: true
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

    async setRequireLoginEverytime(value: boolean) {
      this.requireLoginEverytime = value
      try {
        // Save to both localforage and cookie for reliability
        await localforage.setItem('requireLoginEverytime', value)
        // Set cookie that expires in 1 year
        const expires = new Date()
        expires.setFullYear(expires.getFullYear() + 1)
        document.cookie = `requireLoginEverytime=${value}; expires=${expires.toUTCString()}; path=/`
      } catch (error) {
        console.error('Failed to save requireLoginEverytime setting:', error)
      }
    },

    async toggleDisplayImages() {
      await this.setDisplayImages(!this.displayImages)
    },

    async toggleRequireLoginEverytime() {
      await this.setRequireLoginEverytime(!this.requireLoginEverytime)
    }
  }
})