import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from '@/stores/ui.js'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock document.documentElement
document.documentElement.setAttribute = vi.fn()

describe('UI Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('should initialize with default tweaks', () => {
    const store = useUiStore()
    expect(store.tweaks.primary).toBe('guinda')
    expect(store.tweaks.density).toBe('cozy')
    expect(store.tweaks.playerLayout).toBe('split')
    expect(store.tweaks.liveChat).toBe(true)
  })

  it('should update tweaks', () => {
    const store = useUiStore()
    store.updateTweaks({ ...store.tweaks, primary: 'azul' })
    expect(store.tweaks.primary).toBe('azul')
  })

  it('should persist tweaks to localStorage', () => {
    const store = useUiStore()

    // Verify that immediate watch called setItem during initialization
    expect(localStorageMock.setItem).toHaveBeenCalledWith('conasama.tweaks', expect.any(String))

    // Verify document attributes are set by the watch
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-primary', 'guinda')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-density', 'cozy')
  })

  it('should manage tweaks panel visibility', () => {
    const store = useUiStore()
    expect(store.tweaksOpen).toBe(false)

    store.openTweaks()
    expect(store.tweaksOpen).toBe(true)

    store.closeTweaks()
    expect(store.tweaksOpen).toBe(false)
  })
})
