import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { storageKey } from '@/lib/theme.js'

const TWEAK_DEFAULTS: Record<string, any> = {
  primary: 'brand',
  density: 'cozy',
  playerLayout: 'split',
  liveChat: true,
}

function loadTweaks(): Record<string, any> {
  try {
    const saved = localStorage.getItem(storageKey('tweaks'))
    return saved ? { ...TWEAK_DEFAULTS, ...JSON.parse(saved) } : { ...TWEAK_DEFAULTS }
  } catch {
    return { ...TWEAK_DEFAULTS }
  }
}

function loadTheme(): 'light' | 'dark' | 'system' {
  try {
    const saved = localStorage.getItem(storageKey('theme'))
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {}
  return 'system'
}

let mediaQuery: MediaQueryList | null = null

function applyThemeAttribute(theme: 'light' | 'dark' | 'system') {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else if (theme === 'light') {
    document.documentElement.removeAttribute('data-theme')
  } else if (theme === 'system') {
    const prefersDark =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false
    if (prefersDark) {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }
}

function listenToSystemTheme(theme: 'light' | 'dark' | 'system', callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return
  if (theme === 'system') {
    if (!mediaQuery) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', callback)
    }
  } else {
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', callback)
      mediaQuery = null
    }
  }
}

export const useUiStore = defineStore('ui', () => {
  const tweaks = ref(loadTweaks())
  const tweaksOpen = ref(false)
  const theme = ref<'light' | 'dark' | 'system'>(loadTheme())

  // Persist tweaks and apply data attributes
  watch(
    tweaks,
    (val: any) => {
      localStorage.setItem(storageKey('tweaks'), JSON.stringify(val))
      document.documentElement.setAttribute('data-primary', val.primary)
      document.documentElement.setAttribute('data-density', val.density)
    },
    { deep: true, immediate: true }
  )

  // Persist theme and apply data-theme
  function syncTheme(val: 'light' | 'dark' | 'system') {
    localStorage.setItem(storageKey('theme'), val)
    applyThemeAttribute(val)
    listenToSystemTheme(val, () => applyThemeAttribute('system'))
  }

  watch(() => theme.value, syncTheme, { immediate: true, flush: 'sync' })

  function updateTweaks(val: any) {
    tweaks.value = val
  }

  function updateTheme(val: 'light' | 'dark' | 'system') {
    theme.value = val
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
    theme,
    updateTweaks,
    updateTheme,
    openTweaks,
    closeTweaks,
  }
})
