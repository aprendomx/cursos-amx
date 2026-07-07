import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enqueue, sync } from '../sync-queue'
import { getPendingActions, getAllActions, getDB } from '../offline-db'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  upsert: vi.fn(),
  featureEnabled: vi.fn(),
}))

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: mocks.insert,
      upsert: mocks.upsert,
    })),
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
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('sync-queue', () => {
  it('encola una acción', async () => {
    const payload = { quizId: 1, answers: ['A'] }
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
    const payload = { quizId: 2, answers: ['B'] }
    await enqueue('quiz_submit', payload)

    const result = await sync()

    expect(result.done).toBe(1)
    expect(result.errors).toBe(0)
    expect(mocks.insert).toHaveBeenCalledTimes(1)
    expect(mocks.insert).toHaveBeenCalledWith(payload)

    const pending = await getPendingActions()
    expect(pending).toHaveLength(0)
  })

  it('sync maneja errores de red sin marcar error inmediato', async () => {
    const payload = { quizId: 3, answers: ['C'] }
    await enqueue('quiz_submit', payload)

    mocks.insert.mockRejectedValueOnce({ status: 0, message: 'Network Error' })

    const result = await sync()

    expect(result.done).toBe(0)
    expect(result.errors).toBe(0)

    const pending = await getPendingActions()
    expect(pending).toHaveLength(1)
    expect(pending[0].retries).toBe(1)
    expect(pending[0].status).toBe('pending')
  })

  it('sync maneja errores de validación marcando error', async () => {
    const payload = { quizId: 4, answers: ['D'] }
    await enqueue('quiz_submit', payload)

    mocks.insert.mockRejectedValueOnce({ status: 400, message: 'Bad Request' })

    const result = await sync()

    expect(result.done).toBe(0)
    expect(result.errors).toBe(1)

    const all = await getAllActions()
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe('error')
    expect(all[0].errorMessage).toBe('Bad Request')
  })
})
