/**
 * Allowed Tags Configuration
 *
 * Shared between frontend UI and backend tag filtering.
 * Tags are organized into categories matching the UI button groups.
 */

// Hair color tags
export const hairColorTags = ['ginger', 'blonde', 'brunette', 'colored_hair'] as const

// Hair style tags
export const hairStyleTags = ['braid', 'bangs', 'curly', 'short_hair', 'long_hair'] as const

// Age/body type tags
export const ageBodyTags = ['teen', 'milf', 'chub', 'glasses', 'busty', 'small_breasts'] as const

// Action/content tags
export const actionTags = ['rough', 'ass', 'bj', 'handjob', 'anal', 'multi', 'rule34', 'scat'] as const

// All tag categories for easy iteration in UI
export const tagCategories = {
  hairColor: hairColorTags,
  hairStyle: hairStyleTags,
  ageBody: ageBodyTags,
  action: actionTags,
} as const

// Flattened array of all allowed tags (for backend filtering)
export const allAllowedTags = [
  ...hairColorTags,
  ...hairStyleTags,
  ...ageBodyTags,
  ...actionTags,
] as const

// Type for a single allowed tag
export type AllowedTag = typeof allAllowedTags[number]

// Set for fast lookup (useful for filtering)
export const allowedTagsSet = new Set<string>(allAllowedTags)
