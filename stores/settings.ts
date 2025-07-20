import { defineStore } from 'pinia'
import localforage from 'localforage'

export interface SettingsState {
  displayImages: boolean
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    displayImages: false // Default to off as requested
  }),

  actions: {
    async initializeSettings() {
      try {
        const savedDisplayImages = await localforage.getItem<boolean>('displayImages')
        if (savedDisplayImages !== null) {
          this.displayImages = savedDisplayImages
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
    }
  }
})