import { ref, computed, onMounted, onUnmounted } from 'vue'

export const useBreakpoints = () => {
  const windowWidth = ref(0)

  const updateWidth = () => {
    windowWidth.value = window.innerWidth
  }

  onMounted(() => {
    updateWidth()
    window.addEventListener('resize', updateWidth)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateWidth)
  })

  // Tailwind CSS breakpoints
  const breakpoints = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536
  }

  const isMobile = computed(() => windowWidth.value < breakpoints.sm)
  const isTablet = computed(() => windowWidth.value >= breakpoints.sm && windowWidth.value < breakpoints.lg)
  const isDesktop = computed(() => windowWidth.value >= breakpoints.lg)
  const isSmall = computed(() => windowWidth.value < breakpoints.md)
  const isMedium = computed(() => windowWidth.value >= breakpoints.md && windowWidth.value < breakpoints.lg)
  const isLarge = computed(() => windowWidth.value >= breakpoints.lg && windowWidth.value < breakpoints.xl)
  const isXLarge = computed(() => windowWidth.value >= breakpoints.xl && windowWidth.value < breakpoints['2xl'])
  const is2XLarge = computed(() => windowWidth.value >= breakpoints['2xl'])

  // Utility functions for specific breakpoint checks
  const isAtLeast = (breakpoint: keyof typeof breakpoints) => {
    return computed(() => windowWidth.value >= breakpoints[breakpoint])
  }

  const isAtMost = (breakpoint: keyof typeof breakpoints) => {
    return computed(() => windowWidth.value < breakpoints[breakpoint])
  }

  const isBetween = (min: keyof typeof breakpoints, max: keyof typeof breakpoints) => {
    return computed(() => windowWidth.value >= breakpoints[min] && windowWidth.value < breakpoints[max])
  }

  return {
    windowWidth: readonly(windowWidth),
    isMobile,
    isTablet,
    isDesktop,
    isSmall,
    isMedium,
    isLarge,
    isXLarge,
    is2XLarge,
    isAtLeast,
    isAtMost,
    isBetween,
    breakpoints
  }
}