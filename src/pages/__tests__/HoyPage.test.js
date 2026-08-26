import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HoyPage from '@/pages/HoyPage.vue'
import { useAuthStore } from '@/stores/auth.js'
import { featureEnabled } from '@/lib/featureFlags.js'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/lib/featureFlags.js', () => ({
  featureEnabled: vi.fn(() => false),
}))

const rachaMock = { racha_actual: 3, mejor_racha: 8, activo_hoy: false }
vi.mock('@/composables/useGamificacion.js', () => ({
  useGamificacion: vi.fn(() => ({
    puntos: { value: 120 },
    nivel: { value: { puntos_totales: 120, nivel_nombre: 'Aprendiz', color: '#333' } },
    niveles: { value: [] },
    badgesUsuario: { value: [{ id: 'bu1', badges: { nombre: 'Constante', puntos_otorga: 100 } }] },
    racha: { value: rachaMock },
    cargar: vi.fn(),
  })),
}))

// Tres consultas: inscripciones, cursos, progreso.
const mockFrom = vi.fn()
vi.mock('@/lib/supabase.js', () => ({
  supabase: { from: (...args) => mockFrom(...args) },
}))

const CURSOS = [
  {
    id: 'c1',
    titulo: 'Redes para todos',
    descripcion: 'd',
    nivel: 'Fundamental',
    modulos: [{ id: 'm1', lecciones: [{ id: 'l1' }, { id: 'l2' }] }],
  },
  {
    id: 'c2',
    titulo: 'Datos abiertos',
    descripcion: 'd',
    nivel: 'Intermedio',
    modulos: [{ id: 'm2', lecciones: [{ id: 'l3' }] }],
  },
]

function prepararSupabase({ inscripciones = [], cursos = CURSOS, progreso = [] } = {}) {
  mockFrom.mockImplementation((tabla) => {
    if (tabla === 'inscripciones') {
      return { select: () => ({ eq: () => Promise.resolve({ data: inscripciones, error: null }) }) }
    }
    if (tabla === 'cursos') {
      return {
        select: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: cursos, error: null }) }),
        }),
      }
    }
    return { select: () => ({ eq: () => Promise.resolve({ data: progreso, error: null }) }) }
  })
}

function montar() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.session = { user: { id: 'u1' } }
  auth.user = { nombre: 'Julio' }
  return mount(HoyPage, { global: { plugins: [pinia] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  featureEnabled.mockImplementation(() => false)
})

describe('HoyPage — gamificación APAGADA (degradación sin huecos)', () => {
  it('muestra «sigue aquí» con el curso a medias y no pinta racha ni nivel', async () => {
    prepararSupabase({
      inscripciones: [{ curso_id: 'c1' }],
      progreso: [{ leccion_id: 'l1', completado: true }],
    })
    const w = montar()
    await flushPromises()

    expect(w.text()).toContain('Sigue aquí')
    expect(w.text()).toContain('Redes para todos')
    expect(w.text()).toContain('1 de 2 lecciones')
    // Degradación: nada de racha, nivel ni insignias — y sin huecos vacíos.
    expect(w.text()).not.toContain('racha')
    expect(w.find('[data-test="user-level-bar"]').exists()).toBe(false)
    expect(w.text()).not.toContain('Insignias')
  })

  it('sin cursos a medias invita al catálogo en vez de dejar un hueco', async () => {
    prepararSupabase({ inscripciones: [], progreso: [] })
    const w = montar()
    await flushPromises()

    expect(w.text()).toContain('No tienes ningún curso a medias')
    await w.find('.hoy-vacio .btn').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'home' })
  })

  it('continuar empuja al reproductor del curso', async () => {
    prepararSupabase({
      inscripciones: [{ curso_id: 'c1' }],
      progreso: [{ leccion_id: 'l1', completado: true }],
    })
    const w = montar()
    await flushPromises()

    await w.find('.hoy-continuar .btn').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({
      name: 'player',
      params: { cursoId: 'c1', leccionId: '' },
    })
  })
})

describe('HoyPage — gamificación ENCENDIDA', () => {
  beforeEach(() => {
    featureEnabled.mockImplementation((f) => f === 'gamificacion')
  })

  it('encabeza con la racha y muestra nivel e insignias', async () => {
    prepararSupabase({
      inscripciones: [{ curso_id: 'c1' }],
      progreso: [{ leccion_id: 'l1', completado: true }],
    })
    const w = montar()
    await flushPromises()

    expect(w.text()).toContain('Llevas 3 días')
    expect(w.text()).toContain('Mejor racha: 8 días')
    expect(w.find('[data-test="user-level-bar"]').exists()).toBe(true)
    expect(w.text()).toContain('Insignias recientes')
    expect(w.text()).toContain('Constante')
  })
})
