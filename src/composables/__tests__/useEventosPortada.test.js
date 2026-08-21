import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase.js', () => ({ supabase: { rpc: (...a) => rpc(...a) } }))

let registrarEventoPortada
let almacen

beforeEach(async () => {
  almacen = new Map()
  vi.stubGlobal('sessionStorage', {
    getItem: (k) => almacen.get(k) ?? null,
    setItem: (k, v) => almacen.set(k, String(v)),
  })
  vi.stubGlobal('crypto', { randomUUID: () => '11111111-2222-4333-8444-555555555555' })
  rpc.mockReset()
  vi.resetModules()
  ;({ registrarEventoPortada } = await import('@/composables/useEventosPortada.js'))
})

describe('registrarEventoPortada', () => {
  it('llama a la RPC con el evento y el detalle', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await registrarEventoPortada('portada_curso_click', { seccion: 'cursos', posicion: 3 })
    expect(rpc).toHaveBeenCalledWith('registrar_evento_portada', {
      p_evento: 'portada_curso_click',
      p_seccion: 'cursos',
      p_posicion: 3,
      p_visita: '11111111-2222-4333-8444-555555555555',
    })
  })

  // La regla número uno del módulo: la analítica es prescindible, la
  // navegación no. Si esto lanzara, un fallo de red al medir tumbaría el clic
  // que se estaba midiendo.
  it('NUNCA lanza, aunque la RPC reviente', async () => {
    rpc.mockRejectedValueOnce(new Error('sin red'))
    await expect(registrarEventoPortada('portada_hero_cta')).resolves.toBeUndefined()
  })

  it('NUNCA lanza, aunque sessionStorage esté bloqueado', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    vi.resetModules()
    ;({ registrarEventoPortada } = await import('@/composables/useEventosPortada.js'))
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(registrarEventoPortada('portada_hero_cta')).resolves.toBeUndefined()
    // Sin almacenamiento, el evento sale sin hilo conductor — pero sale.
    expect(rpc.mock.calls[0][1].p_visita).toBeNull()
  })

  it('reutiliza el identificador de visita dentro de la misma sesión', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await registrarEventoPortada('portada_hero_cta')
    await registrarEventoPortada('curso_detalle_visto')
    expect(rpc.mock.calls[0][1].p_visita).toBe(rpc.mock.calls[1][1].p_visita)
  })

  it('no envía nada que identifique a la persona', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await registrarEventoPortada('registro_completado', { seccion: 'registro' })
    const args = rpc.mock.calls[0][1]
    // Ni correo, ni nombre, ni user id: las claves son exactamente estas.
    expect(Object.keys(args).sort()).toEqual(['p_evento', 'p_posicion', 'p_seccion', 'p_visita'])
  })
})
