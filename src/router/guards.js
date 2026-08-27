import { useAuthStore } from '@/stores/auth.js'

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
//
// DE DÓNDE SALEN LOS ROLES, y por qué importa: del STORE de sesión, no de la
// API de auth. Cada navegación protegida hacía `supabase.auth.getSession()`
// más una consulta a `perfiles`. Ese getSession se serializa dentro de
// auth-js y puede quedarse atorado justo después de `signInWithPassword`
// (supabase-js#2013): el guard nunca resolvía, la navegación se quedaba a
// medias y «Mi aprendizaje» —y toda ruta con requiresAuth— dejaba de
// responder a los clics hasta recargar la página. Es la tercera vez que ese
// bloqueo muerde a este proyecto.
//
// El store ya mantiene la sesión al día con `onAuthStateChange`, así que
// leerlo a él no solo evita el bloqueo: ahorra dos viajes de red por
// navegación. La única espera que queda es la resolución INICIAL de la
// sesión, que ocurre una vez por carga de página.

/** Lee los roles del store de sesión. Devuelve null si no hay sesión. */
export async function resolverRoles(auth) {
  // Carga en frío (F5 directo a /perfil): la sesión aún no está resuelta y hay
  // que esperarla, o rebotaríamos al login a quien sí tiene sesión válida.
  // `init()` es idempotente, así que de la segunda navegación en adelante esta
  // promesa ya está resuelta y no espera a nada.
  await auth.init()

  if (!auth.session) return null

  return {
    session: auth.session,
    esAdmin: auth.perfil?.es_admin === true,
    esInstructor: auth.perfil?.es_instructor === true,
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

// `obtenerAuth` se resuelve DENTRO del guard, no al importar el módulo: Pinia
// tiene que estar instalada antes de pedir el store, y main.js la instala
// justo antes que el router.
export function setupGuards(router, obtenerAuth = useAuthStore) {
  router.beforeEach(async (to) => {
    const necesitaSesion =
      to.meta?.requiresAuth || to.meta?.requiresAdmin || to.meta?.requiresInstructor
    if (!necesitaSesion) return true

    const roles = await resolverRoles(obtenerAuth())
    return decidirNavegacion(to, roles) ?? true
  })
}
