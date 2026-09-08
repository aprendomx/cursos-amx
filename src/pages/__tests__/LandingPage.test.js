// Fija el reequilibrio de la portada (change portada-cursos-primero):
// los cursos venden antes de que la constancia cierre, la constancia es UNA
// sola sección aunque el tema declare las dos claves históricas, y la tarjeta
// de curso muestra sus resultados de aprendizaje degradando con dignidad.
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LandingPage from '@/pages/LandingPage.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/composables/useEventosPortada.js', () => ({
  registrarEventoPortada: vi.fn(),
}))

const datos = vi.hoisted(() => ({
  cursos: [],
}))

vi.mock('@/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: datos.cursos, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() =>
      Promise.resolve({
        data: [{ servidores_inscritos: 0, constancias_emitidas: 0, cursos_publicados: 0 }],
      })
    ),
  },
}))

// Tema con las DOS claves históricas de constancia activas: el caso de un
// theme.config.local.js anterior a la fusión. La página debe pintar una sola.
vi.mock('@/lib/theme.js', () => ({
  theme: {
    app: { name: 'Prueba', supportEmail: 'soporte@example.org' },
    hero: {
      eyebrow: '',
      title: '',
      description: '',
      cta: '',
      backgroundImage: null,
      partnerLogos: [],
    },
    logos: { hero: '/theme/logo-hero.svg' },
    constancia: { emisor: 'Emisor de Prueba' },
    landing: { sections: ['como-constancia', 'niveles', 'constancia', 'faq'] },
  },
}))

function curso(extra = {}) {
  return {
    id: 'c-' + Math.random().toString(36).slice(2),
    slug: 'curso',
    titulo: 'Curso de prueba',
    descripcion: 'Descripción del curso.',
    resultados_aprendizaje: null,
    imagen_portada: null,
    nivel: 'Fundamental',
    duracion_min: 60,
    modulos: [],
    ...extra,
  }
}

function montar() {
  return mount(LandingPage, {
    global: {
      stubs: {
        LandingHero: true,
        LandingNiveles: true,
        LandingFaq: true,
        LandingFooter: true,
      },
    },
  })
}

describe('LandingPage — portada reequilibrada', () => {
  it('los cursos aparecen antes que la constancia, y la constancia es UNA sección', async () => {
    datos.cursos = [curso()]
    const w = montar()
    await flushPromises()

    // Una sola sección de constancia, aunque el tema declare ambas claves.
    expect(w.findAll('[data-test="seccion-constancia"]')).toHaveLength(1)

    // El catálogo de cursos precede a la sección de constancia en el DOM.
    const html = w.html()
    const posCatalogo = html.indexOf('id="catalogo"')
    const posConstancia = html.indexOf('data-test="seccion-constancia"')
    expect(posCatalogo).toBeGreaterThanOrEqual(0)
    expect(posConstancia).toBeGreaterThan(posCatalogo)
  })

  it('la sección de constancia conserva los cuatro pasos como subsección compacta', async () => {
    datos.cursos = []
    const w = montar()
    await flushPromises()

    const pasos = w.find('[data-test="constancia-pasos"]')
    expect(pasos.exists()).toBe(true)
    expect(pasos.findAll('li')).toHaveLength(4)
    expect(pasos.text()).toContain('Completa el curso')
    expect(pasos.text()).toContain('Descarga la constancia')
  })

  it('la tarjeta muestra «Al terminar sabrás» solo cuando el curso trae resultados', async () => {
    datos.cursos = [
      curso({ titulo: 'Con resultados', resultados_aprendizaje: ['Aplicar la norma en tu área'] }),
      curso({ titulo: 'Sin resultados' }),
    ]
    const w = montar()
    await flushPromises()

    const bloques = w.findAll('[data-test="curso-resultados"]')
    expect(bloques).toHaveLength(1)
    expect(bloques[0].text()).toContain('Al terminar sabrás')
    expect(bloques[0].text()).toContain('Aplicar la norma en tu área')
  })
})
