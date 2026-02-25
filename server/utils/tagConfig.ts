/**
 * Tag Configuration Module
 *
 * Provides filtering/normalization logic for WD14 Tagger output.
 * Uses the shared allowed tags from ~/utils/allowedTags.ts
 */

import { allAllowedTags, allowedTagsSet, type AllowedTag } from '~/utils/allowedTags'

// Re-export for convenience
export { allAllowedTags, allowedTagsSet, type AllowedTag }

/**
 * Tag mapping rules - normalize WD14/Danbooru tags to our canonical tags
 */
export const TAG_MAPPINGS: Array<{ pattern: RegExp; replacement: AllowedTag }> = [
  // Hair colors
  { pattern: /^black_hair$/i, replacement: 'brunette' },
  { pattern: /^brown_hair$/i, replacement: 'brunette' },
  { pattern: /^blonde_hair$/i, replacement: 'blonde' },
  { pattern: /^red_hair$/i, replacement: 'ginger' },
  { pattern: /^orange_hair$/i, replacement: 'ginger' },
  { pattern: /^(pink|blue|green|purple|white|grey|gray|silver)_hair$/i, replacement: 'colored_hair' },
  { pattern: /^multicolored_hair$/i, replacement: 'colored_hair' },

  // Hair style
  { pattern: /^ponytail$/i, replacement: 'long_hair' },
  { pattern: /^twin_braids$/i, replacement: 'braid' },
  { pattern: /^curly_hair$/i, replacement: 'curly' },

  // Body type - busty
  { pattern: /^large_breasts$/i, replacement: 'busty' },
  { pattern: /^huge_breasts$/i, replacement: 'busty' },

  // Body type - chub
  { pattern: /^fat$/i, replacement: 'chub' },
  { pattern: /^fat_man$/i, replacement: 'chub' },

  // Age indicators - teen
  { pattern: /^loli$/i, replacement: 'teen' },
  { pattern: /^flat_chest$/i, replacement: 'teen' },
  { pattern: /^small_breasts$/i, replacement: 'teen' },

  // Age indicators - milf
  { pattern: /^mature_female$/i, replacement: 'milf' },
  { pattern: /^old$/i, replacement: 'milf' },
  { pattern: /^old_woman$/i, replacement: 'milf' },

  // Oral actions - bj
  { pattern: /^fellatio$/i, replacement: 'bj' },
  { pattern: /^oral$/i, replacement: 'bj' },
  { pattern: /^deepthroat$/i, replacement: 'bj' },

  // Multi-person
  { pattern: /^multiple_boys$/i, replacement: 'multi' },
  { pattern: /^2boys$/i, replacement: 'multi' },
  { pattern: /^3boys$/i, replacement: 'multi' },
  { pattern: /^mmf_threesome$/i, replacement: 'multi' },
  { pattern: /^threesome$/i, replacement: 'multi' },
  { pattern: /^group_sex$/i, replacement: 'multi' },
  { pattern: /^gangbang$/i, replacement: 'multi' },
  { pattern: /^multiple_girls$/i, replacement: 'multi' },
  { pattern: /^2girls$/i, replacement: 'multi' },
  { pattern: /^yuri$/i, replacement: 'multi' },
  { pattern: /^spitroast$/i, replacement: 'multi' },
  { pattern: /^double_penetration$/i, replacement: 'multi' },

  // Rough indicators
  { pattern: /^strangling$/i, replacement: 'rough' },
  { pattern: /^asphyxiation$/i, replacement: 'rough' },
  { pattern: /^rape$/i, replacement: 'rough' },
  { pattern: /^bound$/i, replacement: 'rough' },
  { pattern: /^bondage$/i, replacement: 'rough' },
  { pattern: /^bdsm$/i, replacement: 'rough' },
  { pattern: /^collar$/i, replacement: 'rough' },
  { pattern: /^leash$/i, replacement: 'rough' },

  // Rule34/fantasy indicators
  { pattern: /^monster$/i, replacement: 'rule34' },
  { pattern: /^furry_male$/i, replacement: 'rule34' },
  { pattern: /^furry_female$/i, replacement: 'rule34' },
  { pattern: /^interspecies$/i, replacement: 'rule34' },
  { pattern: /^tentacles?$/i, replacement: 'rule34' },
  { pattern: /^elf$/i, replacement: 'rule34' },
  { pattern: /^pointy_ears$/i, replacement: 'rule34' },
  { pattern: /^pokemon_\(creature\)$/i, replacement: 'rule34' },
]

/**
 * Apply tag mappings - convert a tag to its canonical form if a mapping exists
 */
export function applyTagMapping(tag: string): string | null {
  const normalizedTag = tag.toLowerCase().trim().replace(/\s+/g, '_')

  // Check mappings first
  for (const { pattern, replacement } of TAG_MAPPINGS) {
    if (pattern.test(normalizedTag)) {
      return replacement
    }
  }

  // If the tag itself is already in our allowed set, return it
  if (allowedTagsSet.has(normalizedTag)) {
    return normalizedTag
  }

  // No mapping found and not in allowed set
  return null
}

/**
 * Filter and normalize tags from WD14 Tagger output
 *
 * @param rawTags - Comma-separated string of tags from WD14 Tagger
 * @returns Array of filtered and normalized tags (only allowed tags, deduplicated)
 */
export function filterAndNormalizeTags(rawTags: string): string[] {
  if (!rawTags || typeof rawTags !== 'string') {
    return []
  }

  // Split tags by comma and clean up
  const tags = rawTags.split(',').map(tag => tag.trim().toLowerCase())

  const resultSet = new Set<string>()

  for (const tag of tags) {
    if (!tag) continue

    // Apply mappings to normalize the tag
    const normalizedTag = applyTagMapping(tag)

    // Only add if we got a valid mapped tag
    if (normalizedTag) {
      resultSet.add(normalizedTag)
    }
  }

  // Return as sorted array for consistent ordering
  return Array.from(resultSet).sort()
}

/**
 * Check if a tag is in our allowed list (after normalization)
 */
export function isAllowedTag(tag: string): boolean {
  return applyTagMapping(tag) !== null
}

/**
 * Get all allowed tags as an array
 */
export function getAllAllowedTags(): string[] {
  return [...allAllowedTags]
}
