import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import es from '@/locales/es.json'
import PlayerTextoSurface from '@/components/PlayerTextoSurface.vue'

const i18n = createI18n({ legacy: false, locale: 'es', messages: { es } })

const DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'enlace',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        },
      ],
    },
  ],
}

function factory(props = {}) {
  return mount(PlayerTextoSurface, {
    props: { contenido: DOC, completada: false, ...props },
    global: { plugins: [i18n] },
  })
}

describe('PlayerTextoSurface', () => {
  it('renderiza el JSON de Tiptap como HTML', () => {
    const w = factory()
    expect(w.find('h2').text()).toBe('Título')
    const a = w.find('a')
    expect(a.attributes('href')).toBe('https://example.com')
    expect(a.attributes('rel')).toContain('noopener')
  })

  it('contenido malformado no rompe (render vacío)', () => {
    const w = factory({ contenido: { type: 'garbage' } })
    expect(w.find('[data-test="texto-body"]').exists()).toBe(true)
  })

  it('nodos fuera de la whitelist no se renderizan', () => {
    const w = factory({
      contenido: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }],
      },
    })
    expect(w.html()).not.toContain('<script')
  })

  it('botón marcar completada emite y se oculta si ya está completada', async () => {
    const w = factory()
    await w.find('[data-test="marcar-completada"]').trigger('click')
    expect(w.emitted('completada')).toHaveLength(1)
    const w2 = factory({ completada: true })
    expect(w2.find('[data-test="marcar-completada"]').exists()).toBe(false)
  })
})
