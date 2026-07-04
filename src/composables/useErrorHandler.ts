import { ref } from 'vue'
import { AppError, mapSupabaseError } from '@/lib/errors'

export function useErrorHandler() {
  const error = ref<AppError | null>(null)
  const loading = ref(false)

  function clear() {
    error.value = null
  }

  async function run<T>(asyncFn: () => Promise<T>, opts: any = {}) {
    const { onError, fallback = null, map = mapSupabaseError } = opts
    loading.value = true
    error.value = null
    try {
      return await asyncFn()
    } catch (e: any) {
      const mapped = e instanceof AppError ? e : map(e)
      error.value = mapped
      if (onError) onError(mapped)
      return fallback
    } finally {
      loading.value = false
    }
  }

  return { error, loading, run, clear }
}
