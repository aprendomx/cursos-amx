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
})

function clienteFalso({ session = null, perfil = null } = {}) {
  return {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ single: vi.fn().mockResolvedValue({ data: perfil }) }),
      }),
    }),
  }
}

describe('resolverRoles', () => {
  it('devuelve null sin sesión', async () => {
    expect(await resolverRoles(clienteFalso())).toBeNull()
  })

  it('lee los roles del perfil', async () => {
    const roles = await resolverRoles(
      clienteFalso({
        session: { user: { id: 'u1' } },
        perfil: { es_admin: true, es_instructor: false },
      })
    )
    expect(roles.esAdmin).toBe(true)
    expect(roles.esInstructor).toBe(false)
  })

  // Si el perfil no se puede leer, se asume el mínimo privilegio.
  it('no otorga roles si el perfil no llega', async () => {
    const roles = await resolverRoles(
      clienteFalso({ session: { user: { id: 'u1' } }, perfil: null })
    )
    expect(roles.esAdmin).toBe(false)
    expect(roles.esInstructor).toBe(false)
  })
})

describe('setupGuards', () => {
  it('no consulta la base en rutas públicas', async () => {
    const cliente = clienteFalso()
    let guard
    setupGuards({ beforeEach: (fn) => (guard = fn) }, cliente)

    expect(await guard(RUTA())).toBe(true)
    expect(cliente.auth.getSession).not.toHaveBeenCalled()
  })

  it('bloquea /admin para un alumno autenticado', async () => {
    const cliente = clienteFalso({
      session: { user: { id: 'u1' } },
      perfil: { es_admin: false, es_instructor: false },
    })
    let guard
    setupGuards({ beforeEach: (fn) => (guard = fn) }, cliente)

    expect(await guard(RUTA({ requiresAdmin: true }, '/admin'))).toEqual({ path: '/' })
  })
})
