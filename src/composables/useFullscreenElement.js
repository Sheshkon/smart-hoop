import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

function getFullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null
}

/**
 * Fullscreen for a canvas container. Uses the Fullscreen API when available,
 * otherwise falls back to a fixed viewport overlay (iOS Safari).
 */
export function useFullscreenElement() {
  const isNativeFullscreen = ref(false)
  const isPseudoFullscreen = ref(false)
  let activeElement = null

  const isFullscreen = computed(
    () => isNativeFullscreen.value || isPseudoFullscreen.value,
  )

  function clearPseudo() {
    isPseudoFullscreen.value = false
    document.body.style.overflow = ''
  }

  function handleFullscreenChange() {
    const fsElement = getFullscreenElement()
    if (activeElement && fsElement === activeElement) {
      isNativeFullscreen.value = true
      isPseudoFullscreen.value = false
      return
    }

    isNativeFullscreen.value = false
    if (!isPseudoFullscreen.value) {
      activeElement = null
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && isPseudoFullscreen.value) {
      clearPseudo()
      activeElement = null
    }
  }

  async function enter(element) {
    if (!element) return false
    activeElement = element

    if (element.requestFullscreen) {
      try {
        await element.requestFullscreen()
        return true
      } catch {
        // fall through to pseudo fullscreen
      }
    }

    if (element.webkitRequestFullscreen) {
      try {
        await element.webkitRequestFullscreen()
        return true
      } catch {
        // fall through
      }
    }

    isPseudoFullscreen.value = true
    document.body.style.overflow = 'hidden'
    return true
  }

  async function exit() {
    const fsElement = getFullscreenElement()
    if (fsElement) {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen()
      }
    }

    clearPseudo()
    isNativeFullscreen.value = false
    activeElement = null
  }

  async function toggle(element) {
    if (isFullscreen.value) {
      await exit()
      return false
    }
    await enter(element)
    return true
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.removeEventListener('keydown', handleKeydown)
    exit()
  })

  return {
    isFullscreen,
    isNativeFullscreen,
    isPseudoFullscreen,
    enter,
    exit,
    toggle,
  }
}
