import { useSettingsStore } from '~/stores/settings'

export const useSettings = () => {
  const settingsStore = useSettingsStore()

  // Initialize settings when the composable is used
  onMounted(async () => {
    await settingsStore.initializeSettings()
  })

  return {
    settingsStore,
    displayImages: computed(() => settingsStore.displayImages),
    requireLoginEverytime: computed(() => settingsStore.requireLoginEverytime),
    fsShowSubjectImages: computed(() => settingsStore.fsShowSubjectImages),
    fsShowOutputImages: computed(() => settingsStore.fsShowOutputImages),
    toggleDisplayImages: () => settingsStore.toggleDisplayImages(),
    toggleRequireLoginEverytime: () => settingsStore.toggleRequireLoginEverytime(),
    setDisplayImages: (value: boolean) => settingsStore.setDisplayImages(value),
    setRequireLoginEverytime: (value: boolean) => settingsStore.setRequireLoginEverytime(value),
    setFsShowSubjectImages: (value: boolean) => settingsStore.setFsShowSubjectImages(value),
    setFsShowOutputImages: (value: boolean) => settingsStore.setFsShowOutputImages(value)
  }
}