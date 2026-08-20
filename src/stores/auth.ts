import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase.js'
import { featureEnabled } from '@/lib/featureFlags.js'
import { evaluarBadges } from '@/services/badgeEngine.js'
import { emitirEvento } from '@/services/analytics'

// Perfil vacío: es lo que se muestra antes de autenticarse y al cerrar sesión.
// Antes se usaba el USER de mock de data.js, así que la UI llegaba a mostrar
// el nombre de una persona inventada como si fuera la sesión actual.
function perfilVacio() {
  return {
    nombre: '',
    apellidos: '',
    correo: '',
    telefono: '',
    dependencia: '',
    iniciales: '',
    es_admin: false,
    es_instructor: false,
    cursos_activos: 0,
    cursos_completados: 0,
    horas: 0,
    constancias: 0,
  }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<any>(null)
  const perfil = ref<any>(null)
  const authLoading = ref(true)
  const hasRegistered = ref(false)

  const user = ref<any>(perfilVacio())

  const isLoggedIn = computed(() => !!session.value)
  const isAdmin = computed(() => perfil.value?.es_admin === true)
  const iniciales = computed(() => {
    if (!perfil.value) return ''
    const n = perfil.value.nombres?.[0] || ''
    const a = perfil.value.apellido_paterno?.[0] || ''
    return (n + a).toUpperCase()
  })

  async function fetchPerfil(userId: string) {
    const { data } = await supabase
      .from('perfiles')
      .select('*, dependencias(nombre, siglas)')
      .eq('id', userId)
      .single()
    if (data) {
      perfil.value = data
      user.value = {
        nombre: data.nombres,
        apellidos: `${data.apellido_paterno} ${data.apellido_materno || ''}`.trim(),
        correo: data.correo,
        telefono: data.telefono_movil,
        dependencia: data.dependencias?.nombre || '',
        iniciales: ((data.nombres?.[0] || '') + (data.apellido_paterno?.[0] || '')).toUpperCase(),
        es_admin: data.es_admin,
        es_instructor: data.es_instructor,
        cursos_activos: 0,
        cursos_completados: 0,
        horas: 0,
        constancias: 0,
      }
      hasRegistered.value = true
      if (featureEnabled('gamificacion')) {
        try {
          await evaluarBadges(userId)
        } catch (e) {
          console.error('Error evaluando badges en login:', e)
        }
      }
    }
  }

  async function init() {
    authLoading.value = true
    try {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      if (data.session) {
        await fetchPerfil(data.session.user.id)
        try {
          await emitirEvento({ verb: 'logged_in', objectType: 'platform' })
        } catch {
          /* best effort */
        }
      }
    } catch {}
    authLoading.value = false

    supabase.auth.onAuthStateChange(async (_event: any, newSession: any) => {
      session.value = newSession
      if (newSession) {
        await fetchPerfil(newSession.user.id)
      } else {
        perfil.value = null
        user.value = perfilVacio()
        hasRegistered.value = false
      }
    })
  }

  async function logout() {
    await supabase.auth.signOut()
    session.value = null
    perfil.value = null
    user.value = perfilVacio()
    hasRegistered.value = false
  }

  return {
    session,
    perfil,
    user,
    authLoading,
    hasRegistered,
    isLoggedIn,
    isAdmin,
    iniciales,
    fetchPerfil,
    init,
    logout,
  }
})
