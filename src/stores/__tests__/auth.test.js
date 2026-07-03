import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth.js'

// Mock Supabase client
vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  },
}))

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with null session', () => {
    const store = useAuthStore()
    expect(store.session).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    expect(store.authLoading).toBe(true)
  })

  it('should compute isAdmin correctly', () => {
    const store = useAuthStore()
    expect(store.isAdmin).toBe(false)

    store.perfil = { es_admin: true }
    expect(store.isAdmin).toBe(true)
  })

  it('should compute iniciales correctly', () => {
    const store = useAuthStore()
    expect(store.iniciales).toBe('')

    store.perfil = { nombres: 'Juan', apellido_paterno: 'Perez' }
    expect(store.iniciales).toBe('JP')
  })

  it('should reset state on logout', async () => {
    const store = useAuthStore()
    store.session = { user: { id: '123' } }
    store.perfil = { nombres: 'Juan' }
    store.user = { nombre: 'Juan' }
    store.hasRegistered = true

    const { supabase } = await import('@/lib/supabase.js')
    supabase.auth.signOut.mockResolvedValue({ error: null })

    await store.logout()

    expect(store.session).toBeNull()
    expect(store.perfil).toBeNull()
    expect(store.hasRegistered).toBe(false)
  })
})
