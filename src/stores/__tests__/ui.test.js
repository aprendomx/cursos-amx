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
document.documentElement.removeAttribute = vi.fn()

// Mock matchMedia
const matchMediaMock = vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}))
Object.defineProperty(window, 'matchMedia', {
  value: matchMediaMock,
})

describe('UI Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('should initialize with default tweaks', () => {
    const store = useUiStore()
    expect(store.tweaks.primary).toBe('brand')
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
    expect(localStorageMock.setItem).toHaveBeenCalledWith('cursosamx.tweaks', expect.any(String))

    // Verify document attributes are set by the watch
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-primary', 'brand')
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

  it('should initialize with default theme "system"', () => {
    const store = useUiStore()
    expect(store.theme).toBe('system')
  })

  it('should load saved theme from localStorage', () => {
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'cursosamx.theme') return 'dark'
      return null
    })
    const store = useUiStore()
    expect(store.theme).toBe('dark')
  })

  it('should persist theme to localStorage and apply data-theme', () => {
    const store = useUiStore()
    store.updateTheme('dark')
    expect(localStorageMock.setItem).toHaveBeenCalledWith('cursosamx.theme', 'dark')
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark')

    store.updateTheme('light')
    expect(document.documentElement.removeAttribute).toHaveBeenCalledWith('data-theme')
  })

  it('should use system preference when theme is "system"', () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'cursosamx.theme') return 'system'
      return null
    })
    const store = useUiStore()
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark')
  })
})
