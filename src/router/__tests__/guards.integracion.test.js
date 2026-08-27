import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import { setupGuards } from '../guards.js'
import { useAuthStore } from '@/stores/auth.js'

// Reproducción del defecto que dejaba los menús muertos tras iniciar sesión.
//
// El guard resolvía cada navegación con `supabase.auth.getSession()`. Esa
// llamada se serializa dentro de auth-js y podía quedarse atorada justo
// después de `signInWithPassword` (supabase-js#2013): la navegación no
// terminaba nunca, así que «Mi aprendizaje» y toda ruta con requiresAuth
// dejaban de responder al clic hasta recargar la página.
//
// Aquí se monta el store REAL y el router REAL, se deja la sesión iniciada, y
// entonces se atasca `getSession` a propósito. Con el guard anterior este
// archivo se colgaba; con el actual, la navegación se decide con lo que el
// store ya tiene.

const SESION = { user: { id: 'u1' } }
const PERFIL_ADMIN = { es_admin: true, es_instructor: false, nombres: 'Ada' }

const authApi = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signOut: vi.fn(),
}

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: (...a) => authApi.getSession(...a),
      onAuthStateChange: (...a) => authApi.onAuthStateChange(...a),
      signOut: (...a) => authApi.signOut(...a),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: PERFIL_ADMIN }) }),
      }),
    }),
  },
}))

vi.mock('@/services/analytics', () => ({ emitirEvento: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/featureFlags.js', () => ({ featureEnabled: () => false }))

const vacio = { template: '<div />' }

function crearRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: vacio },
      { path: '/login', name: 'login', component: vacio },
      { path: '/perfil', name: 'perfil', component: vacio, meta: { requiresAuth: true } },
      {
        path: '/admin',
        name: 'admin',
        component: vacio,
        meta: { requiresAuth: true, requiresAdmin: true },
      },
    ],
  })
  setupGuards(router)
  // Sin `router.isReady()`: con memoria, la navegación inicial solo la dispara
  // `app.use(router)`, así que esperarla aquí cuelga. Se navega directo.
  return router
}

/** Falla la prueba si la navegación no termina, en vez de colgar el archivo. */
function conLimite(promesa, ms = 1000) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new Error('la navegación no resolvió: guard colgado')), ms)
    ),
  ])
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('guard con la API de auth atascada tras iniciar sesión', () => {
  it('navega a una ruta protegida sin volver a preguntarle a auth', async () => {
    authApi.getSession.mockResolvedValue({ data: { session: SESION } })
    const auth = useAuthStore()
    await auth.init() // arranque normal: la sesión queda resuelta

    const router = crearRouter()

    // A partir de aquí, auth-js no responde nunca. Es el estado en que
    // quedaba el cliente tras signInWithPassword.
    authApi.getSession.mockImplementation(() => new Promise(() => {}))

    await conLimite(router.push('/perfil'))
    expect(router.currentRoute.value.path).toBe('/perfil')

    // Y el rol sigue resolviéndose, con lo que el store ya tenía.
    await conLimite(router.push('/admin'))
    expect(router.currentRoute.value.path).toBe('/admin')
  })

  it('varias navegaciones seguidas resuelven, no solo la primera', async () => {
    authApi.getSession.mockResolvedValue({ data: { session: SESION } })
    const auth = useAuthStore()
    await auth.init()

    const router = crearRouter()
    authApi.getSession.mockImplementation(() => new Promise(() => {}))

    for (const destino of ['/perfil', '/', '/perfil', '/admin', '/perfil']) {
      await conLimite(router.push(destino))
      expect(router.currentRoute.value.path).toBe(destino)
    }

    // La sesión se resolvió UNA vez, en el arranque: ninguna navegación
    // volvió a consultar la API de auth.
    expect(authApi.getSession).toHaveBeenCalledTimes(1)
  })

  it('sin sesión sigue mandando al login con el destino a cuestas', async () => {
    authApi.getSession.mockResolvedValue({ data: { session: null } })
    const router = crearRouter()

    await conLimite(router.push('/perfil'))
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/perfil')
  })
})
