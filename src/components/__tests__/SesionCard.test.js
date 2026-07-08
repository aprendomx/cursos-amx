import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SesionCard from '@/components/SesionCard.vue'

describe('SesionCard', () => {
  const baseSesion = {
    id: 's1',
    titulo: 'Sesión de prueba',
    descripcion: 'Descripción',
    programada_en: '2025-03-15T10:00:00Z',
    fin: '2025-03-15T11:00:00Z',
    plataforma: 'jitsi',
    estado: 'programada',
  }

  it('renders session info', () => {
    const wrapper = mount(SesionCard, {
      props: { sesion: baseSesion },
    })
    expect(wrapper.text()).toContain('Sesión de prueba')
    expect(wrapper.text()).toContain('Descripción')
    expect(wrapper.text()).toContain('Jitsi')
  })

  it('shows confirmar button when no RSVP and programada', () => {
    const wrapper = mount(SesionCard, {
      props: { sesion: baseSesion, rsvpEstado: null, esInstructor: false },
    })
    expect(wrapper.find('[data-test="confirmar-btn"]').exists()).toBe(true)
  })

  it('shows cancelar button when RSVP is confirmado', () => {
    const wrapper = mount(SesionCard, {
      props: { sesion: baseSesion, rsvpEstado: 'confirmado', esInstructor: false },
    })
    expect(wrapper.find('[data-test="cancelar-btn"]').exists()).toBe(true)
  })

  it('shows unirse button when puedeUnirse', () => {
    const wrapper = mount(SesionCard, {
      props: { sesion: baseSesion, puedeUnirse: true, esInstructor: false },
    })
    expect(wrapper.find('[data-test="unirse-btn"]').exists()).toBe(true)
  })

  it('shows iniciar button for instructor when programada', () => {
    const wrapper = mount(SesionCard, {
      props: { sesion: baseSesion, esInstructor: true },
    })
    expect(wrapper.find('[data-test="iniciar-btn"]').exists()).toBe(true)
  })

  it('emits confirmar on button click', async () => {
    const wrapper = mount(SesionCard, {
      props: { sesion: baseSesion, esInstructor: false },
    })
    await wrapper.find('[data-test="confirmar-btn"]').trigger('click')
    expect(wrapper.emitted('confirmar')).toBeTruthy()
  })

  it('emits iniciar on button click', async () => {
    const wrapper = mount(SesionCard, {
      props: { sesion: baseSesion, esInstructor: true },
    })
    await wrapper.find('[data-test="iniciar-btn"]').trigger('click')
    expect(wrapper.emitted('iniciar')).toBeTruthy()
  })
})
