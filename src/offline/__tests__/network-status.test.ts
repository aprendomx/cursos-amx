import { describe, it, expect, beforeEach, vi } from 'vitest'

// El módulo guarda un singleton a nivel de módulo; cada test necesita un import
// fresco (vi.resetModules) para que el estado y los listeners arranquen de cero.
async function importFresh() {
  vi.resetModules()
  return await import('../network-status')
}

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

beforeEach(() => {
  setOnLine(true)
})

describe('network-status', () => {
  it('arranca con navigator.onLine = true', async () => {
    const { getIsOnline } = await importFresh()
    setOnLine(true)

    expect(getIsOnline().value).toBe(true)
  })

  it('arranca con navigator.onLine = false', async () => {
    const { getIsOnline } = await importFresh()
    setOnLine(false)

    expect(getIsOnline().value).toBe(false)
  })

  it('el evento offline apaga el ref sin disparar callbacks', async () => {
    const { getIsOnline, onOnline } = await importFresh()
    setOnLine(true)
    const callback = vi.fn()
    onOnline(callback)

    window.dispatchEvent(new Event('offline'))

    expect(getIsOnline().value).toBe(false)
    expect(callback).not.toHaveBeenCalled()
  })

  it('el evento online enciende el ref y dispara todos los callbacks', async () => {
    const { getIsOnline, onOnline } = await importFresh()
    setOnLine(false)
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    onOnline(cb1)
    onOnline(cb2)
    expect(getIsOnline().value).toBe(false)

    window.dispatchEvent(new Event('online'))

    expect(getIsOnline().value).toBe(true)
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
  })

  it('sigue la secuencia offline → online', async () => {
    const { getIsOnline, onOnline } = await importFresh()
    setOnLine(true)
    const callback = vi.fn()
    onOnline(callback)
    expect(getIsOnline().value).toBe(true)

    window.dispatchEvent(new Event('offline'))
    expect(getIsOnline().value).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(getIsOnline().value).toBe(true)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
