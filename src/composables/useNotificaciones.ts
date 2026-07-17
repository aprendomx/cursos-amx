import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  cargarNotificaciones,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  cargarPreferencias,
  guardarPreferencias,
} from '@/services/notificaciones.js'
import { supabase } from '@/lib/supabase.js'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type CanalNotificacion = 'in_app' | 'email' | 'push' | 'sms'

/** Fila de notificaciones (051_notificaciones.sql). */
export interface Notificacion {
  id: string
  usuario_id: string
  tipo: string
  titulo: string
  cuerpo: string | null
  datos: Record<string, unknown>
  canal: CanalNotificacion
  estado: 'pendiente' | 'enviado' | 'fallido' | 'cancelado'
  leido: boolean
  enviado_en: string | null
  creado_en: string
}

/** Fila de notificacion_preferencias; 'all' es el default de UI sin fila en BD. */
export interface PreferenciasNotificacion {
  usuario_id?: string
  silenciados: string[]
  canal_default: CanalNotificacion | 'all'
  updated_at?: string
}

export function useNotificaciones() {
  const notificaciones = ref<Notificacion[]>([])
  const preferencias = ref<PreferenciasNotificacion>({ silenciados: [], canal_default: 'all' })
  const loading = ref(false)
  const error = ref<string | null>(null)

  const unreadCount = computed(() => notificaciones.value.filter((n) => !n.leido).length)

  let channel: RealtimeChannel | null = null

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const [notis, prefs] = await Promise.all([cargarNotificaciones(), cargarPreferencias()])
      notificaciones.value = notis
      preferencias.value = prefs
    } catch (e) {
      error.value = (e as Error)?.message || 'Error al cargar notificaciones'
    } finally {
      loading.value = false
    }
  }

  async function marcarLeida(id: string) {
    try {
      await marcarNotificacionLeida(id)
      const n = notificaciones.value.find((x) => x.id === id)
      if (n) n.leido = true
    } catch (e) {
      error.value = (e as Error)?.message || 'Error al marcar como leída'
    }
  }

  async function marcarTodas() {
    try {
      await marcarTodasLeidas()
      notificaciones.value.forEach((n) => {
        n.leido = true
      })
    } catch (e) {
      error.value = (e as Error)?.message || 'Error al marcar todas como leídas'
    }
  }

  async function guardarPrefs(nuevasPrefs: Partial<PreferenciasNotificacion>) {
    try {
      await guardarPreferencias(nuevasPrefs)
      preferencias.value = { ...preferencias.value, ...nuevasPrefs }
    } catch (e) {
      error.value = (e as Error)?.message || 'Error al guardar preferencias'
    }
  }

  async function subscribeRealtime() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    channel = supabase
      .channel(`notificaciones:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const nueva = payload.new as Notificacion
          if (!notificaciones.value.some((n) => n.id === nueva.id)) {
            notificaciones.value.unshift(nueva)
          }
        }
      )
      .subscribe()
  }

  function unsubscribeRealtime() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }

  onMounted(() => {
    subscribeRealtime()
    refresh()
  })

  onUnmounted(() => {
    unsubscribeRealtime()
  })

  return {
    notificaciones,
    unreadCount,
    preferencias,
    loading,
    error,
    refresh,
    marcarLeida,
    marcarTodas,
    guardarPrefs,
  }
}
