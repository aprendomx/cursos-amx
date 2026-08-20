import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import EvaluacionPanel from '@/components/EvaluacionPanel.vue'
import { obtenerEvaluacion, calificarEvaluacion } from '@/services/evaluaciones'

vi.mock('@/services/evaluaciones', () => ({
  obtenerEvaluacion: vi.fn(),
  calificarEvaluacion: vi.fn(),
}))
vi.mock('@/services/analytics', () => ({ emitirEvento: vi.fn() }))

const LECCION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P1 = 'p1'
const P2 = 'p2'

function examen(over = {}) {
  return {
    puntaje_minimo: 70,
    max_intentos: 3,
    intentos_usados: 0,
    intentos_restantes: 3,
    preguntas: [
      {
        id: P1,
        orden: 1,
        tipo: 'opcion_unica',
        enunciado: '¿Cuál es la capital?',
        opciones: [
          { id: 'o1', orden: 1, texto: 'Ciudad de México' },
          { id: 'o2', orden: 2, texto: 'Guadalajara' },
        ],
      },
      {
        id: P2,
        orden: 2,
        tipo: 'verdadero_falso',
        enunciado: 'El agua hierve a 100 °C a nivel del mar',
        opciones: [
          { id: 'v', orden: 1, texto: 'Verdadero' },
          { id: 'f', orden: 2, texto: 'Falso' },
        ],
      },
    ],
    ...over,
  }
}

function montar() {
  return mount(EvaluacionPanel, {
    props: { leccionId: LECCION },
    global: { stubs: { IconSet: true } },
  })
}

describe('EvaluacionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    obtenerEvaluacion.mockResolvedValue(examen())
  })

  it('pinta las preguntas que devuelve el servidor', async () => {
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('¿Cuál es la capital?')
    expect(wrapper.text()).toContain('El agua hierve a 100 °C a nivel del mar')
  })

  // Lo que NO debe pasar nunca: que la clave de respuestas llegue al cliente.
  // obtener_evaluacion la omite en el servidor (migración 029); esto fija que
  // el componente tampoco la espera ni la usaría si apareciera.
  it('no recibe ni muestra cuál es la opción correcta', async () => {
    const wrapper = montar()
    await flushPromises()

    const datos = obtenerEvaluacion.mock.results[0].value
    const json = JSON.stringify(await datos)
    expect(json).not.toContain('es_correcta')
    expect(wrapper.html()).not.toContain('es_correcta')
  })

  it('no deja enviar hasta que todo está respondido', async () => {
    const wrapper = montar()
    await flushPromises()

    const boton = wrapper.find('button[type="submit"]')
    expect(boton.attributes('disabled')).toBeDefined()

    await wrapper.findAll('input[type="radio"]')[0].setValue(true)
    await flushPromises()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  async function responderTodo(wrapper) {
    const radios = wrapper.findAll('input[type="radio"]')
    await radios[0].setValue(true)
    await radios[2].setValue(true)
    await flushPromises()
  }

  it('envía las respuestas y muestra la calificación del servidor', async () => {
    calificarEvaluacion.mockResolvedValue({
      puntaje: 85,
      aprobado: true,
      numero: 1,
      intentos_restantes: 2,
      detalle: [],
    })
    const wrapper = montar()
    await flushPromises()
    await responderTodo(wrapper)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(calificarEvaluacion).toHaveBeenCalledWith(LECCION, expect.any(Object))
    expect(wrapper.text()).toContain('85%')
    expect(wrapper.text()).toContain('Aprobado')
    expect(wrapper.emitted('aprobada')).toBeTruthy()
  })

  it('no emite "aprobada" si el servidor dice que no aprobó', async () => {
    calificarEvaluacion.mockResolvedValue({
      puntaje: 40,
      aprobado: false,
      numero: 1,
      intentos_restantes: 2,
      detalle: [],
    })
    const wrapper = montar()
    await flushPromises()
    await responderTodo(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('aprobada')).toBeFalsy()
    expect(wrapper.text()).toContain('No aprobado')
    expect(wrapper.text()).toContain('Reintentar')
  })

  it('sin intentos restantes no ofrece reintentar', async () => {
    calificarEvaluacion.mockResolvedValue({
      puntaje: 40,
      aprobado: false,
      numero: 3,
      intentos_restantes: 0,
      detalle: [],
    })
    const wrapper = montar()
    await flushPromises()
    await responderTodo(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Sin intentos restantes')
    expect(wrapper.text()).not.toContain('Reintentar (')
  })

  it('bloquea el examen si ya se agotaron los intentos al cargar', async () => {
    obtenerEvaluacion.mockResolvedValue(examen({ intentos_usados: 3, intentos_restantes: 0 }))
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
  })

  // Sin conexión el envío queda en la cola: califica el servidor, así que no
  // hay puntaje que mostrar. Antes de esto se habría pintado un 0%.
  it('sin conexión avisa de que quedó pendiente, sin inventar puntaje', async () => {
    calificarEvaluacion.mockResolvedValue({ diferido: true })
    const wrapper = montar()
    await flushPromises()
    await responderTodo(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Respuestas guardadas')
    expect(wrapper.text()).toContain('se enviarán a calificar')
    expect(wrapper.text()).not.toContain('%')
    expect(wrapper.emitted('aprobada')).toBeFalsy()
  })

  it('muestra el error del servidor en vez de fallar en silencio', async () => {
    calificarEvaluacion.mockRejectedValue(new Error('sin intentos restantes'))
    const wrapper = montar()
    await flushPromises()
    await responderTodo(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('sin intentos restantes')
  })

  it('informa si la evaluación no se puede cargar', async () => {
    obtenerEvaluacion.mockRejectedValue(new Error('no estás inscrito en este curso'))
    const wrapper = montar()
    await flushPromises()

    expect(wrapper.text()).toContain('no estás inscrito')
  })
})
