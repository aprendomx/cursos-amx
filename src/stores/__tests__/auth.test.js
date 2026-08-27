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

  // El guard de navegación espera a init() en CADA ruta protegida. Si cada
  // llamada volviera a preguntarle a la API de auth, volveríamos al defecto
  // que dejaba los menús muertos tras iniciar sesión: ese camino se serializa
  // dentro de auth-js y podía quedarse atorado. Una consulta por carga.
  it('init() resuelve la sesión una sola vez, aunque se le llame en cada navegación', async () => {
    const { supabase } = await import('@/lib/supabase.js')
    supabase.auth.getSession.mockClear()
    supabase.auth.onAuthStateChange.mockClear()
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    const store = useAuthStore()
    await Promise.all([store.init(), store.init(), store.init()])
    await store.init()

    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1)
    expect(supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
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
