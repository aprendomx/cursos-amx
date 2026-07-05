// jsdom stubs for ProseMirror/Tiptap range APIs
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    })
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    })
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import es from '@/locales/es.json'
import LessonRichTextEditor from '@/components/LessonRichTextEditor.vue'

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hola' }] }],
}

function factory(props = {}) {
  return mount(LessonRichTextEditor, {
    props: { modelValue: DOC, ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('LessonRichTextEditor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('monta el editor con el contenido inicial', async () => {
    const w = factory()
    await nextTick()
    expect(w.vm.editor).toBeTruthy()
    expect(w.vm.editor.getText()).toContain('Hola')
    w.unmount()
  })

  it('un cambio emite dirty de inmediato y update:modelValue tras el debounce, con JSON', async () => {
    const w = factory()
    await nextTick()
    w.vm.editor.commands.insertContent(' mundo')
    expect(w.emitted('dirty')).toBeTruthy()
    expect(w.emitted('update:modelValue')).toBeFalsy() // aún en debounce
    vi.advanceTimersByTime(1600)
    const emitido = w.emitted('update:modelValue')
    expect(emitido).toHaveLength(1)
    expect(emitido[0][0].type).toBe('doc') // JSON, no HTML
    expect(typeof emitido[0][0]).toBe('object')
    w.unmount()
  })

  it('flush() emite el pendiente sin esperar el debounce', async () => {
    const w = factory()
    await nextTick()
    w.vm.editor.commands.insertContent('!')
    w.vm.flush()
    expect(w.emitted('update:modelValue')).toHaveLength(1)
    w.unmount()
  })

  it('flush() tras debounce ya disparado no emite por segunda vez (anti double-emit)', async () => {
    const w = factory()
    await nextTick()
    w.vm.editor.commands.insertContent(' extra')
    vi.advanceTimersByTime(1600) // debounce fires → emitted once
    expect(w.emitted('update:modelValue')).toHaveLength(1)
    w.vm.flush() // hayPendiente is false → should be a no-op
    expect(w.emitted('update:modelValue')).toHaveLength(1) // still exactly 1
    w.unmount()
  })

  it('la toolbar aplica negritas', async () => {
    const w = factory()
    await nextTick()
    w.vm.editor.commands.selectAll()
    await w.find('[data-test="tb-bold"]').trigger('click')
    expect(w.vm.editor.isActive('bold')).toBe(true)
    w.unmount()
  })
})
