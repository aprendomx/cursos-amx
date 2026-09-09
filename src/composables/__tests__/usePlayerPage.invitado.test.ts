// Modo invitado del reproductor (change portada-cursos-primero, fase 2):
// sin sesión se reproduce la lección de prueba, pero no se guarda nada, y
// avanzar, guardar o evaluar invita a registrarse SIN perder el punto en el
// que estaba. El evento leccion_probada alimenta el embudo.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { usePlayerPage } from '../usePlayerPage'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))
// Invitado: el store de sesión no tiene nada.
vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ user: null, session: null }),
}))
vi.mock('@/stores/ui.js', () => ({
  useUiStore: () => ({ tweaks: {}, updateTweaks: vi.fn() }),
}))
vi.mock('@/lib/featureFlags.js', () => ({ featureEnabled: () => false }))
vi.mock('@/lib/sbRest', () => ({
  sbSelect: vi.fn(() => Promise.resolve({ data: [], count: null })),
}))
vi.mock('@/services/progreso.js', () => ({
  marcarLeccionCompletada: vi.fn(() => Promise.resolve({})),
  actualizarSegundosVistos: vi.fn(() => Promise.resolve()),
}))
vi.mock('@/services/videos', () => ({ getPlayback: vi.fn(() => Promise.resolve({})) }))
vi.mock('@/services/instructores', () => ({
  fetchInstructoresDeCurso: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/services/tiempo', () => ({ registrarTiempo: vi.fn(() => Promise.resolve()) }))
vi.mock('@/composables/useHlsPlayer.js', () => ({ useHlsPlayer: vi.fn() }))
vi.mock('@/offline/sync-queue', () => ({
  ejecutarODiferir: vi.fn(() => Promise.resolve({ diferido: false, resultado: {} })),
}))
vi.mock('@/composables/useEventosPortada.js', () => ({
  registrarEventoPortada: vi.fn(),
}))

import { registrarEventoPortada } from '@/composables/useEventosPortada.js'
import { marcarLeccionCompletada } from '@/services/progreso.js'

const LEC = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    modulo_id: 'm1',
    orden: 1,
    titulo: `Lección ${id}`,
    tipo_material: 'video',
    duracion: '1:00',
    duracion_seg: 60,
    youtube_url: '',
    video_id: 'vid-1',
    documento_path: null,
    documento_tipo: null,
    contenido: null,
    tipo: 'video',
    completado: false,
    modulo_titulo: 'M1',
    modulo_orden: 1,
    requiere_entrega: false,
    entrega_tipos: null,
    entrega_max_mb: 10,
    ...extra,
  }) as any

function factory() {
  let page!: ReturnType<typeof usePlayerPage>
  const Comp = defineComponent({
    setup() {
      page = usePlayerPage({ cursoId: 'c1', leccionId: '' })
      return () => h('div')
    },
  })
  mount(Comp)
  return page
}

async function paginaConLecciones() {
  const page = factory()
  page.lecciones.value = [LEC('l1'), LEC('l2')]
  page.currentLeccion.value = 'l1'
  await nextTick()
  return page
}

describe('usePlayerPage — modo invitado', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('se reconoce como invitado sin sesión', async () => {
    const page = await paginaConLecciones()
    expect(page.invitado.value).toBe(true)
  })

  it('emite leccion_probada una sola vez al cargar la lección', async () => {
    const page = await paginaConLecciones()
    page.currentLeccion.value = 'l1'
    await nextTick()
    const llamadas = vi
      .mocked(registrarEventoPortada)
      .mock.calls.filter(([evento]) => evento === 'leccion_probada')
    expect(llamadas).toHaveLength(1)
  })

  it('al terminar el video no guarda nada: marca local e invita', async () => {
    const page = await paginaConLecciones()

    await page.onHlsEnded()

    expect(page.completada.value).toBe(true)
    expect(marcarLeccionCompletada).not.toHaveBeenCalled()
    expect(page.invitacionRegistro.value).not.toBeNull()
  })

  it('avanzar invita a registrarse con el destino intentado, sin navegar', async () => {
    const page = await paginaConLecciones()

    page.goToNextLesson()

    expect(pushMock).not.toHaveBeenCalled()
    expect(page.invitacionRegistro.value?.destino).toBe('/player/c1/l2')
    expect(page.currentLeccion.value).toBe('l1')
  })

  it('elegir otra lección invita en vez de cambiar', async () => {
    const page = await paginaConLecciones()

    page.selectLesson('l2')

    expect(page.currentLeccion.value).toBe('l1')
    expect(page.invitacionRegistro.value?.destino).toBe('/player/c1/l2')
  })

  it('marcar lectura completada invita sin tocar el servidor', async () => {
    const page = await paginaConLecciones()

    await page.marcarLecturaCompletada()

    expect(page.completada.value).toBe(true)
    expect(marcarLeccionCompletada).not.toHaveBeenCalled()
    expect(page.invitacionRegistro.value).not.toBeNull()
  })

  it('aprobar evaluación siendo invitado también invita', async () => {
    const page = await paginaConLecciones()

    page.handleEvaluacionAprobada()

    expect(page.invitacionRegistro.value).not.toBeNull()
  })

  it('ir a registro emite registro_desde_leccion y conserva el destino', async () => {
    const page = await paginaConLecciones()
    page.selectLesson('l2')

    page.irARegistroDesdeLeccion()

    expect(registrarEventoPortada).toHaveBeenCalledWith('registro_desde_leccion', {
      seccion: 'player',
    })
    expect(pushMock).toHaveBeenCalledWith({
      name: 'registro',
      query: { redirect: '/player/c1/l2' },
    })
  })

  it('cerrar la invitación deja seguir viendo donde estaba', async () => {
    const page = await paginaConLecciones()
    page.goToNextLesson()
    expect(page.invitacionRegistro.value).not.toBeNull()

    page.cerrarInvitacion()

    expect(page.invitacionRegistro.value).toBeNull()
    expect(page.currentLeccion.value).toBe('l1')
  })
})
