export default defineAppConfig({
  ui: {
    button: {
      slots: {
        base: 'cursor-pointer'
      }
    },
    // Add locale configuration to fix injection issues
    locale: {
      fallback: 'en'
    }
  }
})