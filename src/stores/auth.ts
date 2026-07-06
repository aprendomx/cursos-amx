import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase.js'
import { USER as MOCK_USER } from '@/data.js'
import { featureEnabled } from '@/lib/featureFlags.js'
import { evaluarBadges } from '@/services/badgeEngine.js'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<any>(null)
  const perfil = ref<any>(null)
  const authLoading = ref(true)
  const hasRegistered = ref(false)

  // User data: real profile when authenticated, mock fallback otherwise
  const user = ref<any>({ ...MOCK_USER })

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
      if (data.session) await fetchPerfil(data.session.user.id)
    } catch {}
    authLoading.value = false

    supabase.auth.onAuthStateChange(async (_event: any, newSession: any) => {
      session.value = newSession
      if (newSession) {
        await fetchPerfil(newSession.user.id)
      } else {
        perfil.value = null
        user.value = { ...MOCK_USER }
        hasRegistered.value = false
      }
    })
  }

  async function logout() {
    await supabase.auth.signOut()
    session.value = null
    perfil.value = null
    user.value = { ...MOCK_USER }
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
