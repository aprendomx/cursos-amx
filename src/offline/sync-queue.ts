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

const MAX_RETRIES = 5
const BACKOFF_BASE_MS = 1000

const endpointMap: Record<
  SyncActionType,
  (payload: Record<string, unknown>) => Promise<unknown>
> = {
  quiz_submit: async (payload) => {
    const { error } = await supabase.from('intentos_evaluacion').insert(payload)
    if (error) throw error
  },
  forum_post: async (payload) => {
    const { error } = await supabase.from('comentarios').insert(payload)
    if (error) throw error
  },
  assignment_submit: async (payload) => {
    const { error } = await supabase.from('entregas').insert(payload)
    if (error) throw error
  },
  progress_update: async (payload) => {
    const { error } = await supabase.from('progreso').upsert(payload)
    if (error) throw error
  },
}

export async function enqueue(
  type: SyncActionType,
  payload: Record<string, unknown>,
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
  const failed = all.filter(
    (a) => a.status === 'error' && (a.retries || 0) >= MAX_RETRIES,
  )

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
