import { supabase } from '@/lib/supabase.js'

// Guard de navegación.
//
// OJO CON EL ALCANCE: esto NO es control de acceso. La autorización real vive
// en las políticas RLS de Postgres, porque el cliente lleva la anon key y
// cualquiera puede saltarse el router llamando a la API directamente. Lo que
// hace este guard es evitar que se monten pantallas que van a fallar y no
// mostrar enlaces que no llevan a ninguna parte.
//
// Antes solo comprobaba `requiresAuth`, así que /admin era navegable por
// cualquier usuario autenticado: la pantalla se montaba y luego cada consulta
// devolvía 403 o vacío. Ahora se resuelve el rol antes de entrar.

/** Lee los roles del perfil. Devuelve null si no hay sesión. */
export async function resolverRoles(cliente = supabase) {
  const { data } = await cliente.auth.getSession()
  const session = data?.session
  if (!session) return null

  const { data: perfil } = await cliente
    .from('perfiles')
    .select('es_admin, es_instructor')
    .eq('id', session.user.id)
    .single()

  return {
    session,
    esAdmin: perfil?.es_admin === true,
    esInstructor: perfil?.es_instructor === true,
  }
}

/**
 * Decide a dónde va la navegación. Función pura sobre `roles` para poder
 * probarla sin router ni red.
 */
export function decidirNavegacion(to, roles) {
  const necesitaSesion =
    to.meta?.requiresAuth || to.meta?.requiresAdmin || to.meta?.requiresInstructor

  if (necesitaSesion && !roles) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta?.requiresAdmin && !roles.esAdmin) {
    return { path: '/' }
  }
  // Un administrador entra también al panel de instructor: es el patrón de
  // is_instructor_de() en la base, y evita que un admin quede fuera de una
  // pantalla que sí puede usar.
  if (to.meta?.requiresInstructor && !roles.esInstructor && !roles.esAdmin) {
    return { path: '/' }
  }
  return null
}

export function setupGuards(router, cliente = supabase) {
  router.beforeEach(async (to) => {
    const necesitaSesion =
      to.meta?.requiresAuth || to.meta?.requiresAdmin || to.meta?.requiresInstructor
    if (!necesitaSesion) return true

    const roles = await resolverRoles(cliente)
    return decidirNavegacion(to, roles) ?? true
  })
}
