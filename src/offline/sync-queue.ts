import {
  saveSyncAction,
  getPendingActions,
  updateSyncAction,
  deleteSyncAction,
  getAllActions,
} from './offline-db'
import type { SyncActionType } from './types'
import { supabase } from '@/lib/supabase.js'
import { featureEnabled } from '@/lib/featureFlags'
import { getIsOnline } from './network-status'

const MAX_RETRIES = 5
const BACKOFF_BASE_MS = 1000

// Cada acción diferida usa EXACTAMENTE la misma ruta de servidor que su
// equivalente en línea. Es deliberado: si la cola escribiera directo a las
// tablas, se saltaría la validación que vive en las RPC.
//
// El caso grave era `quiz_submit`, que insertaba en `intentos_evaluacion` un
// payload con `puntaje` y `aprobado` calculados en el CLIENTE. Hoy falla
// siempre (esa tabla no tiene política de INSERT, y es correcto que no la
// tenga), pero era una trampa cargada: bastaba con que alguien "arreglara" el
// 403 añadiendo la política para que el alumno pudiera autocalificarse y se
// rompiera el diseño de calificar_evaluacion.
const endpointMap: Record<SyncActionType, (payload: Record<string, unknown>) => Promise<unknown>> =
  {
    // El servidor califica: el cliente solo manda las respuestas.
    quiz_submit: async (payload) => {
      const { error } = await supabase.rpc('calificar_evaluacion', {
        p_leccion: payload.leccion_id,
        p_respuestas: payload.respuestas ?? {},
      })
      if (error) throw error
    },
    forum_post: async (payload) => {
      const { error } = await supabase.from('comentarios').insert(payload)
      if (error) throw error
    },
    assignment_submit: async (payload) => {
      const { error } = await supabase.rpc('registrar_entrega', {
        p_leccion_id: payload.leccion_id,
        p_archivo_path: payload.archivo_path,
        p_archivo_nombre: payload.archivo_nombre,
        p_archivo_tipo: payload.archivo_tipo,
        p_archivo_bytes: payload.archivo_bytes,
      })
      if (error) throw error
    },
    // guardar_posicion acota los segundos a la duración real de la lección y
    // marcar_leccion_completada verifica inscripción y continuidad (059).
    progress_update: async (payload) => {
      const { error } = await supabase.rpc('guardar_posicion', {
        p_leccion: payload.leccion_id,
        p_segundos: Math.max(0, Math.floor(Number(payload.segundos_vistos) || 0)),
      })
      if (error) throw error

      if (payload.completado === true) {
        const { error: errCompletar } = await supabase.rpc('marcar_leccion_completada', {
          p_leccion_id: payload.leccion_id,
        })
        if (errCompletar) throw errCompletar
      }
    },
  }

/**
 * ¿El fallo es de red, o lo rechazó el servidor?
 *
 * Distinguirlo es lo único que hace útil a la cola: un 403 por RLS o un
 * "sin intentos restantes" NO deben reintentarse —fallarían igual mil veces—
 * mientras que un corte de conexión sí.
 */
export function esFalloDeRed(e: any): boolean {
  if (e?.status && e.status >= 400 && e.status < 500) return false
  const msg = String(e?.message || e || '').toLowerCase()
  return (
    e?.status === 0 ||
    e?.status === undefined ||
    /failed to fetch|network|networkerror|timeout|offline|load failed/.test(msg)
  )
}

export interface ResultadoDiferible<T> {
  /** true = quedó en la cola; no hay resultado del servidor todavía. */
  diferido: boolean
  resultado: T | null
}

/**
 * Ejecuta la acción ahora si se puede, y la difiere si no.
 *
 * Es el punto de entrada que faltaba: la cola existía completa —IndexedDB,
 * reintentos con backoff, panel de estado— y NADIE la llamaba. `enqueue()` a
 * secas tampoco servía: con el flag encendido encolaba SIEMPRE, incluso con
 * conexión, y el usuario no veía su comentario hasta el siguiente sync.
 *
 * Con el flag apagado se comporta como antes de que existiera la cola: se
 * ejecuta y, si falla, se propaga el error.
 */
export async function ejecutarODiferir<T = unknown>(
  type: SyncActionType,
  payload: Record<string, unknown>
): Promise<ResultadoDiferible<T>> {
  if (!featureEnabled('offline_sync')) {
    return { diferido: false, resultado: (await endpointMap[type](payload)) as T }
  }

  if (!getIsOnline().value) {
    await saveSyncAction({ type, payload, status: 'pending', retries: 0, createdAt: Date.now() })
    return { diferido: true, resultado: null }
  }

  try {
    return { diferido: false, resultado: (await endpointMap[type](payload)) as T }
  } catch (e) {
    // Un rechazo del servidor se propaga: encolarlo solo aplazaría el mismo
    // error y le daría al usuario la falsa impresión de que se guardó.
    if (!esFalloDeRed(e)) throw e
    await saveSyncAction({ type, payload, status: 'pending', retries: 0, createdAt: Date.now() })
    return { diferido: true, resultado: null }
  }
}

export async function enqueue(
  type: SyncActionType,
  payload: Record<string, unknown>
): Promise<number> {
  if (!featureEnabled('offline_sync')) {
    await endpointMap[type](payload)
    return -1
  }
  return saveSyncAction({
    type,
    payload,
    status: 'pending',
    retries: 0,
    createdAt: Date.now(),
  })
}

export async function sync(): Promise<{ done: number; errors: number }> {
  if (!featureEnabled('offline_sync')) return { done: 0, errors: 0 }

  const actions = await getPendingActions()
  let done = 0
  let errors = 0

  for (const action of actions) {
    if (!action.id) continue
    await updateSyncAction(action.id, { status: 'syncing' })

    try {
      await endpointMap[action.type](action.payload)
      await updateSyncAction(action.id, { status: 'done' })
      await deleteSyncAction(action.id)
      done++
    } catch (e: any) {
      const isValidationError = e?.status >= 400 && e?.status < 500

      if (isValidationError) {
        await updateSyncAction(action.id, {
          status: 'error',
          errorMessage: e?.message || 'Error de validación',
        })
        errors++
        continue
      }

      // Network error
      const newRetries = action.retries + 1

      if (newRetries >= MAX_RETRIES) {
        await updateSyncAction(action.id, {
          status: 'error',
          retries: newRetries,
          errorMessage: e?.message || 'Error de red (máximos reintentos alcanzados)',
        })
        errors++
        continue
      }

      const delay = Math.min(2 ** newRetries * BACKOFF_BASE_MS, 30000)
      await updateSyncAction(action.id, {
        status: 'pending',
        retries: newRetries,
      })
      setTimeout(() => sync(), delay)
      break
    }
  }

  return { done, errors }
}

export async function retryFailed(): Promise<void> {
  const all = await getAllActions()
  const failed = all.filter((a) => a.status === 'error' && (a.retries || 0) >= MAX_RETRIES)

  for (const action of failed) {
    if (action.id) {
      await updateSyncAction(action.id, {
        status: 'pending',
        retries: 0,
        errorMessage: undefined,
      })
    }
  }

  await sync()
}
