import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enqueue, sync } from '../sync-queue'
import { getPendingActions, getAllActions, getDB } from '../offline-db'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
  featureEnabled: vi.fn(),
}))

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: mocks.insert,
      upsert: mocks.upsert,
    })),
    rpc: mocks.rpc,
  },
}))

vi.mock('@/lib/featureFlags', () => ({
  featureEnabled: mocks.featureEnabled,
}))

async function clearDB() {
  const db = await getDB()
  const tx = db.transaction(['syncQueue'], 'readwrite')
  await tx.objectStore('syncQueue').clear()
  await tx.done
}

beforeEach(async () => {
  await clearDB()
  mocks.featureEnabled.mockReturnValue(true)
  mocks.insert.mockReset().mockResolvedValue({ data: null, error: null })
  mocks.upsert.mockReset().mockResolvedValue({ data: null, error: null })
  mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('sync-queue', () => {
  it('encola una acción', async () => {
    const payload = { leccion_id: 'lec-1', respuestas: { p1: ['o1'] } }
    const id = await enqueue('quiz_submit', payload)

    expect(id).toBeGreaterThan(0)

    const pending = await getPendingActions()
    expect(pending).toHaveLength(1)
    expect(pending[0].type).toBe('quiz_submit')
    expect(pending[0].payload).toEqual(payload)
    expect(pending[0].status).toBe('pending')
    expect(pending[0].retries).toBe(0)
  })

  it('sync envía acciones pendientes', async () => {
    const payload = { leccion_id: 'lec-2', respuestas: { p1: ['o2'] } }
    await enqueue('quiz_submit', payload)

    const result = await sync()

    expect(result.done).toBe(1)
    expect(result.errors).toBe(0)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    // Por RPC, no por INSERT directo: el servidor califica, no el cliente.
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('calificar_evaluacion', {
      p_leccion: payload.leccion_id,
      p_respuestas: payload.respuestas,
    })

    const pending = await getPendingActions()
    expect(pending).toHaveLength(0)
  })

  it('sync maneja errores de red sin marcar error inmediato', async () => {
    const payload = { leccion_id: 'lec-3', respuestas: { p1: ['o3'] } }
    await enqueue('quiz_submit', payload)

    mocks.rpc.mockRejectedValueOnce({ status: 0, message: 'Network Error' })

    const result = await sync()

    expect(result.done).toBe(0)
    expect(result.errors).toBe(0)

    const pending = await getPendingActions()
    expect(pending).toHaveLength(1)
    expect(pending[0].retries).toBe(1)
    expect(pending[0].status).toBe('pending')
  })

  it('sync maneja errores de validación marcando error', async () => {
    const payload = { leccion_id: 'lec-4', respuestas: { p1: ['o4'] } }
    await enqueue('quiz_submit', payload)

    mocks.rpc.mockRejectedValueOnce({ status: 400, message: 'Bad Request' })

    const result = await sync()

    expect(result.done).toBe(0)
    expect(result.errors).toBe(1)

    const all = await getAllActions()
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe('error')
    expect(all[0].errorMessage).toBe('Bad Request')
  })
})
