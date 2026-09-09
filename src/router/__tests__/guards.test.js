import { describe, it, expect, vi } from 'vitest'
import { decidirNavegacion, decidirEntradaInvitado, resolverRoles, setupGuards } from '../guards.js'

// La consulta real de leccionAbierta usa sbRest; aquí siempre se inyecta un
// resolver falso, pero el import del módulo no debe tocar la red.
vi.mock('@/lib/leccionAbierta.js', () => ({
  primeraLeccionAbierta: vi.fn(() => Promise.resolve(null)),
}))

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

// La excepción del modo invitado: player sin sesión, solo la primera lección
// de un curso publicado (change portada-cursos-primero, fase 2).
describe('decidirEntradaInvitado', () => {
  const PLAYER = (params) => ({
    name: 'player',
    meta: { requiresAuth: true },
    params,
    fullPath: '/player/c1',
  })
  const resolver = async (cursoId) => (cursoId === 'c1' ? 'l1' : null)

  it('deja pasar la primera lección abierta', async () => {
    expect(await decidirEntradaInvitado(PLAYER({ cursoId: 'c1', leccionId: 'l1' }), resolver)).toBe(
      true
    )
  })

  it('sin leccionId redirige a la primera explícita', async () => {
    expect(await decidirEntradaInvitado(PLAYER({ cursoId: 'c1' }), resolver)).toEqual({
      name: 'player',
      params: { cursoId: 'c1', leccionId: 'l1' },
    })
  })

  it('cualquier otra lección no aplica (seguirá al login)', async () => {
    expect(
      await decidirEntradaInvitado(PLAYER({ cursoId: 'c1', leccionId: 'l2' }), resolver)
    ).toBeNull()
  })

  it('un curso sin lección abierta (sin publicar, inexistente) no aplica', async () => {
    expect(
      await decidirEntradaInvitado(PLAYER({ cursoId: 'c9', leccionId: 'l1' }), resolver)
    ).toBeNull()
  })

  it('fuera de player no aplica nunca', async () => {
    expect(
      await decidirEntradaInvitado(
        { name: 'perfil', meta: { requiresAuth: true }, params: {}, fullPath: '/perfil' },
        resolver
      )
    ).toBeNull()
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

  it('sin sesión, player pasa solo con la primera lección abierta', async () => {
    const auth = authFalso()
    let guard
    setupGuards(
      { beforeEach: (fn) => (guard = fn) },
      () => auth,
      async () => 'l1'
    )

    const abierta = {
      name: 'player',
      meta: { requiresAuth: true },
      params: { cursoId: 'c1', leccionId: 'l1' },
      fullPath: '/player/c1/l1',
    }
    expect(await guard(abierta)).toBe(true)

    const cerrada = {
      name: 'player',
      meta: { requiresAuth: true },
      params: { cursoId: 'c1', leccionId: 'l2' },
      fullPath: '/player/c1/l2',
    }
    expect((await guard(cerrada)).path).toBe('/login')
  })

  it('sin sesión y sin lección abierta, player rebota al login como siempre', async () => {
    const auth = authFalso()
    let guard
    setupGuards(
      { beforeEach: (fn) => (guard = fn) },
      () => auth,
      async () => null
    )

    const r = await guard({
      name: 'player',
      meta: { requiresAuth: true },
      params: { cursoId: 'c1', leccionId: 'l1' },
      fullPath: '/player/c1/l1',
    })
    expect(r.path).toBe('/login')
    expect(r.query.redirect).toBe('/player/c1/l1')
  })

  it('con sesión, player no consulta la lección abierta', async () => {
    const auth = authFalso({ session: { user: { id: 'u1' } }, perfil: {} })
    const resolver = vi.fn()
    let guard
    setupGuards({ beforeEach: (fn) => (guard = fn) }, () => auth, resolver)

    expect(
      await guard({
        name: 'player',
        meta: { requiresAuth: true },
        params: { cursoId: 'c1', leccionId: 'l2' },
        fullPath: '/player/c1/l2',
      })
    ).toBe(true)
    expect(resolver).not.toHaveBeenCalled()
  })
})
