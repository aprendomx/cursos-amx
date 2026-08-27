import { describe, it, expect, vi } from 'vitest'
import { decidirNavegacion, resolverRoles, setupGuards } from '../guards.js'

const RUTA = (meta = {}, fullPath = '/x') => ({ meta, fullPath })

// El router estaba al 0% de cobertura, siendo el único control de acceso del
// frontend. Estas pruebas fijan su contrato.
describe('decidirNavegacion', () => {
  const alumno = { session: {}, esAdmin: false, esInstructor: false }
  const instructor = { session: {}, esAdmin: false, esInstructor: true }
  const admin = { session: {}, esAdmin: true, esInstructor: false }

  it('deja pasar las rutas públicas sin sesión', () => {
    expect(decidirNavegacion(RUTA(), null)).toBeNull()
  })

  it('manda a login si la ruta exige sesión y no la hay', () => {
    const r = decidirNavegacion(RUTA({ requiresAuth: true }, '/perfil'), null)
    expect(r.path).toBe('/login')
    expect(r.query.redirect).toBe('/perfil')
  })

  it('conserva el destino para volver después de autenticarse', () => {
    const r = decidirNavegacion(RUTA({ requiresAdmin: true }, '/admin?tab=cursos'), null)
    expect(r.query.redirect).toBe('/admin?tab=cursos')
  })

  it('deja pasar a una ruta autenticada a cualquier sesión', () => {
    expect(decidirNavegacion(RUTA({ requiresAuth: true }), alumno)).toBeNull()
  })

  // Antes /admin solo exigía requiresAuth: cualquier usuario autenticado
  // montaba el panel, y luego cada consulta devolvía 403 o vacío.
  it('saca de /admin a quien no es administrador', () => {
    expect(decidirNavegacion(RUTA({ requiresAdmin: true }), alumno).path).toBe('/')
    expect(decidirNavegacion(RUTA({ requiresAdmin: true }), instructor).path).toBe('/')
  })

  it('deja entrar a /admin al administrador', () => {
    expect(decidirNavegacion(RUTA({ requiresAdmin: true }), admin)).toBeNull()
  })

  it('saca de /instructor a un alumno', () => {
    expect(decidirNavegacion(RUTA({ requiresInstructor: true }), alumno).path).toBe('/')
  })

  it('deja entrar a /instructor al instructor y también al administrador', () => {
    expect(decidirNavegacion(RUTA({ requiresInstructor: true }), instructor)).toBeNull()
    expect(decidirNavegacion(RUTA({ requiresInstructor: true }), admin)).toBeNull()
  })

  // «Hoy» es el destino post-login: sin sesión rebota a login CONSERVANDO el
  // destino, para que el propio login te devuelva ahí.
  it('sin sesión, /hoy exige login y conserva el destino', () => {
    const r = decidirNavegacion(RUTA({ requiresAuth: true }, '/hoy'), null)
    expect(r).toEqual({ path: '/login', query: { redirect: '/hoy' } })
  })

  it('con sesión, /hoy pasa para cualquier rol', () => {
    expect(decidirNavegacion(RUTA({ requiresAuth: true }, '/hoy'), alumno)).toBeNull()
  })
})

// Doble del store de sesión. Ya no hay cliente de Supabase de por medio: el
// guard lee el estado que el store mantiene con onAuthStateChange.
function authFalso({ session = null, perfil = null } = {}) {
  return {
    session,
    perfil,
    init: vi.fn().mockResolvedValue(undefined),
  }
}

describe('resolverRoles', () => {
  it('devuelve null sin sesión', async () => {
    expect(await resolverRoles(authFalso())).toBeNull()
  })

  it('lee los roles del perfil que ya tiene el store', async () => {
    const roles = await resolverRoles(
      authFalso({
        session: { user: { id: 'u1' } },
        perfil: { es_admin: true, es_instructor: false },
      })
    )
    expect(roles.esAdmin).toBe(true)
    expect(roles.esInstructor).toBe(false)
  })

  // Si el perfil no se puede leer, se asume el mínimo privilegio.
  it('no otorga roles si el perfil no llega', async () => {
    const roles = await resolverRoles(authFalso({ session: { user: { id: 'u1' } }, perfil: null }))
    expect(roles.esAdmin).toBe(false)
    expect(roles.esInstructor).toBe(false)
  })

  // Carga en frío: quien pulsa F5 sobre /perfil llega antes de que la sesión
  // esté resuelta. Sin esta espera, el guard lo echaría al login teniendo
  // sesión válida.
  it('espera a que el store resuelva la sesión inicial', async () => {
    const auth = {
      session: null,
      perfil: null,
      init: vi.fn(async () => {
        auth.session = { user: { id: 'u1' } }
        auth.perfil = { es_admin: false, es_instructor: true }
      }),
    }

    const roles = await resolverRoles(auth)

    expect(auth.init).toHaveBeenCalled()
    expect(roles).not.toBeNull()
    expect(roles.esInstructor).toBe(true)
  })
})

describe('setupGuards', () => {
  it('no toca la sesión en rutas públicas', async () => {
    const auth = authFalso()
    let guard
    setupGuards({ beforeEach: (fn) => (guard = fn) }, () => auth)

    expect(await guard(RUTA())).toBe(true)
    expect(auth.init).not.toHaveBeenCalled()
  })

  it('bloquea /admin para un alumno autenticado', async () => {
    const auth = authFalso({
      session: { user: { id: 'u1' } },
      perfil: { es_admin: false, es_instructor: false },
    })
    let guard
    setupGuards({ beforeEach: (fn) => (guard = fn) }, () => auth)

    expect(await guard(RUTA({ requiresAdmin: true }, '/admin'))).toEqual({ path: '/' })
  })

  // La regresión: el guard resolvía consultando a auth-js en CADA navegación,
  // y ese camino podía quedarse atorado tras iniciar sesión, dejando los menús
  // sin responder. Ahora la navegación se decide con lo que el store ya tiene.
  it('resuelve la navegación aunque la API de auth esté colgada', async () => {
    const auth = {
      session: { user: { id: 'u1' } },
      perfil: { es_admin: true, es_instructor: false },
      // Ya inicializado: init() no vuelve a preguntar nada.
      init: vi.fn().mockResolvedValue(undefined),
      // Si el guard cayera en esto, la navegación no terminaría nunca.
      getSession: () => new Promise(() => {}),
    }
    let guard
    setupGuards({ beforeEach: (fn) => (guard = fn) }, () => auth)

    const veredicto = await Promise.race([
      guard(RUTA({ requiresAdmin: true }, '/admin')),
      new Promise((r) => setTimeout(() => r('COLGADO'), 100)),
    ])

    expect(veredicto).toBe(true)
  })
})
