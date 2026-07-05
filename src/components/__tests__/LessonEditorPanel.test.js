import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import es from '@/locales/es.json'
import LessonEditorPanel, { fuenteDe, leccionPatch } from '@/components/LessonEditorPanel.vue'

vi.mock('@/components/VideoUploadField.vue', () => ({
  default: { name: 'VideoUploadField', template: '<div class="mock-video" />' },
}))
vi.mock('@/components/DocumentoUploadField.vue', () => ({
  default: { name: 'DocumentoUploadField', template: '<div class="mock-doc" />' },
}))
vi.mock('@/components/EvaluacionEditor.vue', () => ({
  default: {
    name: 'EvaluacionEditor',
    props: ['preguntas'],
    template: '<div class="mock-eval" />',
  },
}))
vi.mock('@/components/LessonRichTextEditor.vue', () => ({
  default: {
    name: 'LessonRichTextEditor',
    props: ['modelValue'],
    emits: ['update:modelValue', 'dirty'],
    methods: { flush() {} },
    template: '<div class="mock-rich" />',
  },
  EXTENSIONES_TEXTO: [],
}))

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const leccion = {
  id: 'l1',
  titulo: 'Intro',
  tipo_material: 'video',
  url_youtube: 'https://youtu.be/abc12345678',
  video_id: null,
  documento_path: null,
  documento_tipo: null,
  contenido: null,
  duracion_seg: 90,
  requiere_entrega: false,
  fuente: 'youtube',
}

// Finding 1: attachTo document.body ensures teleport to="body" has a real DOM target.
// Teleported content is queried via document.querySelector rather than w.find().
function factory(props = {}) {
  return mount(LessonEditorPanel, {
    props: { lesson: leccion, session: null, ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

// Helper: trigger a native input event on a teleported element
async function setInput(selector, value) {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`setInput: selector not found: ${selector}`)
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}

async function clickEl(selector) {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`clickEl: selector not found: ${selector}`)
  el.click()
  await nextTick()
}

describe('helpers', () => {
  it('fuenteDe deriva la fuente desde columnas', () => {
    expect(fuenteDe({ tipo_material: 'examen' })).toBe('examen')
    expect(fuenteDe({ documento_path: 'x.pdf' })).toBe('documento')
    expect(fuenteDe({ video_id: 'v1' })).toBe('hls')
    expect(fuenteDe({ contenido: { type: 'doc' } })).toBe('texto')
    expect(fuenteDe({ url_youtube: 'https://…' })).toBe('youtube')
    expect(fuenteDe({})).toBe('ninguno')
  })

  it('leccionPatch limpia campos de otras fuentes', () => {
    const p = leccionPatch({
      fuente: 'texto',
      titulo: 'T',
      contenido: { type: 'doc' },
      url_youtube: 'x',
    })
    expect(p.tipo_material).toBe('lectura')
    expect(p.contenido).toEqual({ type: 'doc' })
    expect(p.url_youtube).toBeNull()
  })
})

describe('LessonEditorPanel', () => {
  let w

  // Finding 1: clean up teleported nodes between tests so they don't leak
  afterEach(() => {
    w?.unmount()
    document.body.innerHTML = ''
  })

  it('renderiza campos base', () => {
    w = factory()
    const input = document.querySelector('[data-test="lesson-titulo"]')
    expect(input).toBeTruthy()
    expect(input.value).toBe('Intro')
  })

  it('fuente texto monta el editor enriquecido', async () => {
    w = factory()
    // Change the radio by dispatching change on the input
    const radio = document.querySelector('[data-test="fuente-texto"]')
    radio.checked = true
    radio.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('.mock-rich')).toBeTruthy()
  })

  it('guardar emite save con el patch', async () => {
    w = factory()
    await setInput('[data-test="lesson-titulo"]', 'Renombrada')
    await clickEl('[data-test="panel-save"]')
    const [patch] = w.emitted('save')[0]
    expect(patch.titulo).toBe('Renombrada')
    expect(patch.fuente).toBe('youtube')
  })

  // Finding 5: duracion_seg assertion on save
  it('guardar con duración emite duracion_seg correcto', async () => {
    w = factory()
    await setInput('[placeholder="12:30"]', '12:30')
    await clickEl('[data-test="panel-save"]')
    const [patch] = w.emitted('save')[0]
    expect(patch.duracion_seg).toBe(750)
  })

  it('cancelar emite close sin save', async () => {
    w = factory()
    await clickEl('[data-test="panel-cancel"]')
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.emitted('save')).toBeFalsy()
  })

  it('Esc con cambios sin guardar pide confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    w = factory()
    await setInput('[data-test="lesson-titulo"]', 'Cambio')
    // Dispatch keydown Escape on the panel aside
    const panel = document.querySelector('.panel')
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(w.emitted('close')).toBeFalsy()
    window.confirm.mockRestore()
  })

  // Finding 6: deep-copy (no aliasing) + dirty detection for exam preguntas
  it('preguntas deep-copy: mutación no propaga al prop original y marca dirty', async () => {
    const leccionExamen = {
      id: 'l2',
      titulo: 'Quiz',
      tipo_material: 'examen',
      preguntas: [{ id: 'p1', texto: 'Pregunta', opciones: [{ id: 'o1', texto: 'Opción' }] }],
      duracion_seg: 0,
      fuente: 'examen',
    }
    w = factory({ lesson: leccionExamen })

    // EvaluacionEditor receives the deep-copied preguntas array (not the original)
    // w.findComponent works through the vnode tree even with teleport
    const evalComp = w.findComponent({ name: 'EvaluacionEditor' })
    const copiedPreguntas = evalComp.props('preguntas')

    // Simulate EvaluacionEditor mutating preguntas in-place (its real behavior)
    copiedPreguntas.push({ id: 'p2', texto: 'Nueva pregunta' })
    await nextTick()

    // dirty indicator should appear (Finding 3: snapshot-based detection)
    expect(document.querySelector('.unsaved')).toBeTruthy()

    // original prop must NOT be mutated (Finding 2: deep copy)
    expect(leccionExamen.preguntas).toHaveLength(1)
  })
})
