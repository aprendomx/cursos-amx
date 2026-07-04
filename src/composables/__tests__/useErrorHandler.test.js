import { describe, it, expect, vi } from 'vitest'
import { useErrorHandler } from '../useErrorHandler.js'
import { AppError, NetworkError } from '@/lib/errors.js'

describe('useErrorHandler', () => {
  it('runs async fn and returns result', async () => {
    const { run, error, loading } = useErrorHandler()
    const result = await run(async () => 42)
    expect(result).toBe(42)
    expect(error.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('maps error and returns fallback', async () => {
    const { run, error, loading } = useErrorHandler()
    const result = await run(
      async () => {
        throw new Error('fail')
      },
      { fallback: 'default' }
    )
    expect(result).toBe('default')
    expect(error.value).toBeInstanceOf(AppError)
    expect(loading.value).toBe(false)
  })

  it('calls onError callback', async () => {
    const onError = vi.fn()
    const { run } = useErrorHandler()
    await run(
      async () => {
        throw new Error('x')
      },
      { onError }
    )
    expect(onError).toHaveBeenCalledOnce()
  })

  it('maps supabase network error to NetworkError', async () => {
    const { run, error } = useErrorHandler()
    await run(async () => {
      throw { message: 'Failed to fetch' }
    })
    expect(error.value).toBeInstanceOf(NetworkError)
  })

  it('clears error', async () => {
    const { run, error, clear } = useErrorHandler()
    await run(async () => {
      throw new Error('fail')
    })
    expect(error.value).not.toBeNull()
    clear()
    expect(error.value).toBeNull()
  })
})
