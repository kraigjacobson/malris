/**
 * Composable for handling touch/swipe gestures
 * Provides reusable gesture handling logic for navigation
 */
export const useGesture = (options = {}) => {
  const {
    minSwipeDistance = 50,
    onSwipeLeft = () => {},
    onSwipeRight = () => {},
    debug = false
  } = options

  // Touch/swipe state
  const touchStartX = ref(0)
  const touchStartY = ref(0)
  const touchEndX = ref(0)
  const touchEndY = ref(0)

  // Touch event handlers
  const handleTouchStart = (event) => {
    touchStartX.value = event.touches[0].clientX
    touchStartY.value = event.touches[0].clientY
    if (debug) {
      console.log('Gesture touch start:', touchStartX.value, touchStartY.value)
    }
  }

  const handleTouchMove = (event) => {
    // Don't prevent default to allow normal scrolling
    // Only prevent if we detect a clear horizontal swipe
    const currentX = event.touches[0].clientX
    const deltaX = Math.abs(currentX - touchStartX.value)
    const deltaY = Math.abs(event.touches[0].clientY - touchStartY.value)
    
    if (deltaX > deltaY && deltaX > 20) {
      event.preventDefault()
    }
  }

  const handleTouchEnd = (event) => {
    touchEndX.value = event.changedTouches[0].clientX
    touchEndY.value = event.changedTouches[0].clientY
    
    const deltaX = touchEndX.value - touchStartX.value
    const deltaY = touchEndY.value - touchStartY.value
    
    if (debug) {
      console.log('Gesture touch end - deltaX:', deltaX, 'deltaY:', deltaY)
    }
    
    // Check if it's a horizontal swipe (more horizontal than vertical movement)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      if (debug) {
        console.log('Swipe detected!')
      }
      if (deltaX > 0) {
        // Swipe right - go to previous
        if (debug) {
          console.log('Swipe right - going to previous')
        }
        onSwipeRight()
      } else {
        // Swipe left - go to next
        if (debug) {
          console.log('Swipe left - going to next')
        }
        onSwipeLeft()
      }
    } else {
      if (debug) {
        console.log('No swipe detected - deltaX:', Math.abs(deltaX), 'minDistance:', minSwipeDistance)
      }
    }
  }

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  }
}