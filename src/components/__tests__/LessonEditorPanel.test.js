import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import LessonEditorPanel, { fuenteDe, leccionPatch } from '@/components/LessonEditorPanel.vue'

vi.mock('@/components/VideoUploadField.vue', () => ({
  default: { name: 'VideoUploadField', template: '<div class="mock-video" />' },
}))
vi.mock('@/components/DocumentoUploadField.vue', () => ({
  default: { name: 'DocumentoUploadField', template: '<div class="mock-doc" />' },
}))
vi.mock('@/components/EvaluacionEditor.vue', () => ({
  default: { name: 'EvaluacionEditor', template: '<div class="mock-eval" />' },
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

function factory(props = {}) {
  return mount(LessonEditorPanel, {
    props: { lesson: leccion, session: null, ...props },
    global: { plugins: [i18n] },
  })
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
  it('renderiza campos base', () => {
    const w = factory()
    expect(w.find('[data-test="lesson-titulo"]').element.value).toBe('Intro')
  })

  it('fuente texto monta el editor enriquecido', async () => {
    const w = factory()
    await w.find('[data-test="fuente-texto"]').setValue()
    expect(w.find('.mock-rich').exists()).toBe(true)
  })

  it('guardar emite save con el patch', async () => {
    const w = factory()
    await w.find('[data-test="lesson-titulo"]').setValue('Renombrada')
    await w.find('[data-test="panel-save"]').trigger('click')
    const [patch] = w.emitted('save')[0]
    expect(patch.titulo).toBe('Renombrada')
    expect(patch.fuente).toBe('youtube')
  })

  it('cancelar emite close sin save', async () => {
    const w = factory()
    await w.find('[data-test="panel-cancel"]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.emitted('save')).toBeFalsy()
  })

  it('Esc con cambios sin guardar pide confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const w = factory()
    await w.find('[data-test="lesson-titulo"]').setValue('Cambio')
    await w.find('.panel').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('close')).toBeFalsy()
    window.confirm.mockRestore()
  })
})
