import { describe, it, expect, beforeEach, vi } from 'vitest'

// Estas pruebas cubren la capa que permite montar la aplicación sin esperar a
// la red. El defecto que la motivó: main.js colgaba app.mount() de una llamada
// a Supabase sin límite de tiempo, y con la API inalcanzable la página quedaba
// en blanco 7.3 s (medido). Ahora la primera visita espera —acotada— y las
// siguientes arrancan con lo que dejó la anterior.

vi.mock('@/lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) },
}))
vi.mock('@/lib/theme.js', () => ({ theme: { app: { storagePrefix: 'prueba' } } }))

const CLAVE = 'prueba-feature-toggles'

// El `localStorage` que expone vitest en este proyecto es un objeto pelado sin
// métodos, así que se instala uno propio respaldado por un Map. Además de
// hacer la prueba independiente del entorno, permite simular el almacenamiento
// bloqueado, que es un caso real: modo privado y políticas de sitio.
function almacenFalso() {
  const datos = new Map()
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
    clear: () => datos.clear(),
    get length() {
      return datos.size
    },
    key: (i) => [...datos.keys()][i] ?? null,
    claves: () => [...datos.keys()],
  }
}

let almacen
let leerFlagsGuardados, hidratarFlagsGuardados
let getRuntimeFlags, setRuntimeFlags

beforeEach(async () => {
  almacen = almacenFalso()
  vi.stubGlobal('localStorage', almacen)
  vi.resetModules()
  ;({ leerFlagsGuardados, hidratarFlagsGuardados } =
    await import('@/composables/useFeatureFlags.js'))
  ;({ getRuntimeFlags, setRuntimeFlags } = await import('@/lib/featureFlags.js'))
  setRuntimeFlags(null)
})

function guardar(flags, ts = Date.now()) {
  almacen.setItem(CLAVE, JSON.stringify({ flags, ts }))
}

describe('leerFlagsGuardados', () => {
  it('devuelve null cuando no hay nada guardado', () => {
    expect(leerFlagsGuardados()).toBeNull()
  })

  it('devuelve los flags de la visita anterior', () => {
    guardar({ foros: true, zoom: false })
    expect(leerFlagsGuardados()).toEqual({ foros: true, zoom: false })
  })

  it('descarta lo que lleva más de un día', () => {
    guardar({ foros: true }, Date.now() - 25 * 60 * 60 * 1000)
    expect(leerFlagsGuardados()).toBeNull()
  })

  // Si un JSON corrupto tumbara esta función, tumbaría el arranque entero:
  // se llama antes de montar.
  it('no revienta con contenido corrupto', () => {
    almacen.setItem(CLAVE, 'esto no es json')
    expect(leerFlagsGuardados()).toBeNull()
  })

  it('rechaza formas que no son un objeto de flags', () => {
    almacen.setItem(CLAVE, JSON.stringify({ flags: ['a'], ts: Date.now() }))
    expect(leerFlagsGuardados()).toBeNull()
    almacen.setItem(CLAVE, JSON.stringify({ flags: { a: true } }))
    expect(leerFlagsGuardados()).toBeNull()
  })

  it('sobrevive a un localStorage bloqueado', () => {
    almacen.getItem = () => {
      throw new Error('acceso denegado al almacenamiento')
    }
    // Si esto lanzara, se llevaría por delante el arranque entero: se llama
    // antes de montar la aplicación.
    expect(() => leerFlagsGuardados()).not.toThrow()
    expect(leerFlagsGuardados()).toBeNull()
  })
})

describe('hidratarFlagsGuardados', () => {
  it('publica los flags en la capa síncrona y avisa de que había caché', () => {
    guardar({ foros: false })
    expect(hidratarFlagsGuardados()).toBe(true)
    // Esto es lo que decide qué pinta el PRIMER render.
    expect(getRuntimeFlags()).toEqual({ foros: false })
  })

  it('sin caché no publica nada, para que se usen los defaults de build', () => {
    expect(hidratarFlagsGuardados()).toBe(false)
    expect(getRuntimeFlags()).toBeNull()
  })

  it('la clave lleva el prefijo de la instalación', () => {
    guardar({ foros: true })
    expect(hidratarFlagsGuardados()).toBe(true)
    expect(almacen.claves()).toContain(CLAVE)
  })
})
