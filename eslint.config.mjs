// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'warn',
      'vue/max-len': 'off',
      'max-len': 'off'
    }
  }
)
