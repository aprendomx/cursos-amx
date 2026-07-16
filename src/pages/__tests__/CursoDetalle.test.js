import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CursoDetalle from '@/pages/CursoDetalle.vue'
import { useAuthStore } from '@/stores/auth.js'
import { sbSelect } from '@/lib/sbRest'
import { inscribirse } from '@/services/progreso.js'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('@/lib/sbRest', () => ({
  sbSelect: vi.fn(),
}))
vi.mock('@/services/progreso.js', () => ({
  inscribirse: vi.fn(),
}))
vi.mock('@/services/entregas', () => ({
  listarTareasPorCurso: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/featureFlags.js', () => ({
  featureEnabled: vi.fn(() => false),
}))
vi.mock('@/components/ForosPanel.vue', () => ({
  default: {
    name: 'ForosPanel',
    props: ['cursoId', 'session', 'perfil', 'inscrito'],
    template: '<div data-test="foros-panel" />',
  },
}))

const CURSO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const CURSO_ROW = {
  id: CURSO_ID,
  slug: 'curso-x',
  titulo: 'Curso X',
  descripcion: 'Descripción del curso X.',
  duracion_min: 90,
  nivel: 'Intermedio',
  imagen_portada: '',
}

// m1 completo, m2 a la mitad (requiere previo pero m1 está completo),
// m3 bloqueado porque m2 no está completo.
const MODULOS_ROWS = [
  {
    id: 'm1',
    orden: 1,
    titulo: 'Módulo uno',
    requiere_previo: false,
    lecciones: [
      { id: 'l1', duracion_seg: 60 },
      { id: 'l2', duracion_seg: 60 },
    ],
  },
  {
    id: 'm2',
    orden: 2,
    titulo: 'Módulo dos',
    requiere_previo: true,
    lecciones: [
      { id: 'l3', duracion_seg: 60 },
      { id: 'l4', duracion_seg: 60 },
    ],
  },
  {
    id: 'm3',
    orden: 3,
    titulo: 'Módulo tres',
    requiere_previo: true,
    lecciones: [{ id: 'l5', duracion_seg: 60 }],
  },
]

const PROGRESO_ROWS = [{ leccion_id: 'l1' }, { leccion_id: 'l2' }, { leccion_id: 'l3' }]

const LECCIONES_ROWS = [
  { id: 'l3', orden: 1, modulos: { curso_id: CURSO_ID, orden: 2 } },
  { id: 'l1', orden: 1, modulos: { curso_id: CURSO_ID, orden: 1 } },
  { id: 'l2', orden: 2, modulos: { curso_id: CURSO_ID, orden: 1 } },
]

function mockSbSelect({ inscrito = true, progreso = PROGRESO_ROWS } = {}) {
  sbSelect.mockImplementation(async (path) => {
    if (path.startsWith('cursos?')) return { data: [CURSO_ROW] }
    if (path.startsWith('modulos?')) return { data: MODULOS_ROWS }
    if (path.startsWith('progreso?')) return { data: progreso }
    if (path.startsWith('inscripciones?')) return { data: inscrito ? [{ id: 'ins-1' }] : [] }
    if (path.startsWith('lecciones?')) return { data: LECCIONES_ROWS }
    return { data: [] }
  })
}

// El setup global instala su propio Pinia en config.global.plugins; aquí
// necesitamos que el componente use el MISMO pinia que el test para poder
// preparar el store de auth antes de montar.
let pinia

const wrappers = []
function factory(props = {}) {
  const w = mount(CursoDetalle, {
    props: { cursoId: CURSO_ID, ...props },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  wrappers.push(w)
  return w
}

function loggedIn() {
  const auth = useAuthStore()
  auth.session = { access_token: 'tok', user: { id: 'u1' } }
  auth.perfil = { es_admin: false, es_instructor: false }
  return auth
}

function ctaButton(w) {
  return w.find('.btn.btn-primary')
}

describe('CursoDetalle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers.length = 0
    document.body.innerHTML = ''
  })

  it('muestra el error cuando el curso no se puede cargar', async () => {
    sbSelect.mockRejectedValue(new Error('boom'))
    const w = factory()
    await flushPromises()
    expect(w.text()).toContain('No se pudo cargar el curso')
    expect(w.text()).toContain('boom')
  })

  it('renderiza el curso con estados de módulo y progreso agregados', async () => {
    loggedIn()
    mockSbSelect()
    const w = factory()
    await flushPromises()

    expect(w.text()).toContain('Curso X')
    expect(w.text()).toContain('3 módulos. En orden.')
    // m1 completo, m2 en progreso (50%), m3 bloqueado por m2 incompleto.
    expect(w.text()).toContain('Completado')
    expect(w.text()).toContain('50%')
    expect(w.text()).toContain('Bloqueado')
    // 3 de 5 lecciones completadas → 60% de progreso global.
    expect(w.text()).toContain('3 / 5')
    expect(w.text()).toContain('60%')
    // Inscrito con progreso parcial → CTA Continuar.
    expect(ctaButton(w).text()).toContain('Continuar')
  })

  it('sin sesión el CTA lleva a login', async () => {
    mockSbSelect()
    const w = factory()
    await flushPromises()
    expect(ctaButton(w).text()).toContain('Inicia sesión para inscribirte')
    await ctaButton(w).trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'login' })
    expect(inscribirse).not.toHaveBeenCalled()
  })

  it('usuario no inscrito: el CTA inscribe y abre el player en la primera lección pendiente', async () => {
    const auth = loggedIn()
    mockSbSelect({ inscrito: false, progreso: [{ leccion_id: 'l1' }] })
    inscribirse.mockResolvedValue({})
    const w = factory()
    await flushPromises()

    expect(ctaButton(w).text()).toContain('Inscribirme al curso')
    await ctaButton(w).trigger('click')
    await flushPromises()

    expect(inscribirse).toHaveBeenCalledWith(CURSO_ID, auth.session)
    // l1 ya está completada → la siguiente pendiente por orden global es l2.
    expect(pushMock).toHaveBeenCalledWith({
      name: 'player',
      params: { cursoId: CURSO_ID, leccionId: 'l2' },
    })
  })

  it('inscripción duplicada (23505) se trata como éxito silencioso', async () => {
    loggedIn()
    mockSbSelect({ inscrito: false })
    inscribirse.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }))
    const w = factory()
    await flushPromises()

    await ctaButton(w).trigger('click')
    await flushPromises()

    expect(pushMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'player' }))
    expect(w.text()).not.toContain('No se pudo procesar la inscripción')
  })

  it('error real de inscripción muestra mensaje inline y no navega', async () => {
    loggedIn()
    mockSbSelect({ inscrito: false })
    inscribirse.mockRejectedValue(new Error('RLS denied'))
    const w = factory()
    await flushPromises()

    await ctaButton(w).trigger('click')
    await flushPromises()

    expect(w.text()).toContain('No se pudo procesar la inscripción')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('sin inscripción los botones de módulo quedan bloqueados', async () => {
    loggedIn()
    mockSbSelect({ inscrito: false })
    const w = factory()
    await flushPromises()
    expect(w.text()).toContain('Inscríbete al curso para acceder')
  })

  it('pasa la sesión del store a los paneles con feature flag activo', async () => {
    const { featureEnabled } = await import('@/lib/featureFlags.js')
    featureEnabled.mockImplementation((flag) => flag === 'foros')
    const auth = loggedIn()
    mockSbSelect()
    const w = factory()
    await flushPromises()

    const panel = w.findComponent({ name: 'ForosPanel' })
    expect(panel.exists()).toBe(true)
    // Regresión: el template referenciaba `session` sin definirla en el
    // script y los paneles recibían undefined aun con usuario logueado.
    expect(panel.props('session')).toEqual(auth.session)
    expect(panel.props('inscrito')).toBe(true)
  })
})
