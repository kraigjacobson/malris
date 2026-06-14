export default defineAppConfig({
  ui: {
    button: {
      slots: {
        base: 'cursor-pointer'
      }
    },
    modal: {
      slots: {
        // Tighter header/footer than the defaults (p-4 sm:px-6, header min-h-16).
        header: 'p-2 sm:px-4 sm:py-2 min-h-0',
        footer: 'p-2 sm:px-4 sm:py-2'
      }
    },
    locale: {
      fallback: 'en'
    }
  }
})
