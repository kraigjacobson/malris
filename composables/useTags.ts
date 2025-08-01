/**
 * Tag utility composable for managing and filtering tags
 */
export const useTags = () => {
  // State for storing subject tags
  const currentSubjectTags = ref<string[]>([])
  const currentVideoTags = ref<string[]>([])

  /**
   * Check if a tag is related to hair styling/color
   * @param tag - The tag to check
   * @returns boolean indicating if the tag is hair-related
   */
  const isHairTag = (tag: string): boolean => {
    const lowerTag = tag.toLowerCase()
    return lowerTag.includes('black_hair') ||
           lowerTag.includes('blonde_hair') ||
           lowerTag.includes('blonde') ||
           lowerTag.includes('brunette') ||
           lowerTag.includes('brunette_hair') ||
           lowerTag.includes('ginger') ||
           lowerTag.includes('brown_hair') ||
           lowerTag.includes('curly_hair') ||
           lowerTag.includes('grey_hair') ||
           lowerTag.includes('orange_hair') ||
           lowerTag.includes('red_hair') ||
           lowerTag.includes('braid') ||
           lowerTag === 'bangs'  // Only exact match for bangs, not blunt_bangs etc.
  }

  /**
   * Filter an array of tags to only include hair-related tags
   * @param tags - Array of tags to filter
   * @returns Array of hair-related tags only
   */
  const filterHairTags = (tags: string[]): string[] => {
    return tags.filter(isHairTag)
  }

  /**
   * Set subject tags and extract hair tags
   * @param tags - Array of all subject tags
   */
  const setSubjectTags = (tags: string[]) => {
    currentSubjectTags.value = tags || []
  }

  /**
   * Set video tags and extract hair tags
   * @param tags - Array of all video tags
   */
  const setVideoTags = (tags: string[]) => {
    currentVideoTags.value = tags || []
  }

  /**
   * Get hair tags from current subject
   * @returns Array of hair-related tags from current subject
   */
  const getSubjectHairTags = (): string[] => {
    return filterHairTags(currentSubjectTags.value)
  }

  /**
   * Get hair tags from current video
   * @returns Array of hair-related tags from current video
   */
  const getVideoHairTags = (): string[] => {
    return filterHairTags(currentVideoTags.value)
  }

  /**
   * Clear all stored tags
   */
  const clearTags = () => {
    currentSubjectTags.value = []
    currentVideoTags.value = []
  }

  return {
    isHairTag,
    filterHairTags,
    setSubjectTags,
    setVideoTags,
    getSubjectHairTags,
    getVideoHairTags,
    clearTags,
    currentSubjectTags: readonly(currentSubjectTags),
    currentVideoTags: readonly(currentVideoTags)
  }
}