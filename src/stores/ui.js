import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { storageKey } from '@/lib/theme.js'

const TWEAK_DEFAULTS = {
  primary: 'brand',
  density: 'cozy',
  playerLayout: 'split',
  liveChat: true,
}

function loadTweaks() {
  try {
    const saved = localStorage.getItem(storageKey('tweaks'))
    return saved ? { ...TWEAK_DEFAULTS, ...JSON.parse(saved) } : { ...TWEAK_DEFAULTS }
  } catch {
    return { ...TWEAK_DEFAULTS }
  }
}

export const useUiStore = defineStore('ui', () => {
  const tweaks = ref(loadTweaks())
  const tweaksOpen = ref(false)

  // Persist tweaks and apply data attributes
  watch(
    tweaks,
    (val) => {
      localStorage.setItem(storageKey('tweaks'), JSON.stringify(val))
      document.documentElement.setAttribute('data-primary', val.primary)
      document.documentElement.setAttribute('data-density', val.density)
    },
    { deep: true, immediate: true }
  )

  function updateTweaks(val) {
    tweaks.value = val
  }

  function openTweaks() {
    tweaksOpen.value = true
  }

  function closeTweaks() {
    tweaksOpen.value = false
  }

  return {
    tweaks,
    tweaksOpen,
    updateTweaks,
    openTweaks,
    closeTweaks,
  }
})
