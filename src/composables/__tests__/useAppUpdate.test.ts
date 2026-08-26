import { describe, it, expect, vi, beforeEach } from 'vitest'

const registerSWMock = vi.hoisted(() => vi.fn())
vi.mock('virtual:pwa-register', () => ({ registerSW: registerSWMock }))

import { useAppUpdate } from '../useAppUpdate'

describe('useAppUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('avisa cuando hay versión nueva y aplica la actualización al confirmar', () => {
    const updateSW = vi.fn()
    registerSWMock.mockImplementation((opts: any) => {
      opts.onNeedRefresh()
      return updateSW
    })
    const { nuevaVersionDisponible, actualizarAhora } = useAppUpdate({ enabled: true })
    expect(nuevaVersionDisponible.value).toBe(true)
    actualizarAhora()
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('no registra el service worker cuando está deshabilitado', () => {
    const { nuevaVersionDisponible } = useAppUpdate({ enabled: false })
    expect(registerSWMock).not.toHaveBeenCalled()
    expect(nuevaVersionDisponible.value).toBe(false)
  })

  it('comprueba periódicamente si hay una versión nueva', () => {
    vi.useFakeTimers()
    const update = vi.fn(() => Promise.resolve())
    registerSWMock.mockImplementation((opts: any) => {
      opts.onRegisteredSW?.('/sw.js', { update })
      return vi.fn()
    })
    useAppUpdate({ enabled: true, intervaloMs: 1000 })
    vi.advanceTimersByTime(3000)
    expect(update).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
})
