import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CampoContrasena from '@/components/CampoContrasena.vue'
import { MINIMO_LONGITUD } from '@/lib/contrasena.js'

// Este componente existe para que las reglas de contraseña vivan en un solo
// sitio. El alta, el restablecimiento y el cambio desde el perfil lo comparten;
// si cada uno escribiera las suyas, acabarían siendo tres reglas distintas.

function montar(props = {}) {
  return mount(CampoContrasena, { props })
}

describe('CampoContrasena', () => {
  it('anuncia las reglas antes de que se escriba nada', () => {
    const w = montar()
    const reglas = w.find('.campo-contrasena-reglas')
    expect(reglas.exists()).toBe(true)
    expect(reglas.text()).toContain(String(MINIMO_LONGITUD))
  })

  it('el input queda descrito por las reglas, no solo acompañado', () => {
    const w = montar({ id: 'x' })
    expect(w.find('input').attributes('aria-describedby')).toContain('x-reglas')
  })

  it('respeta el id que se le pasa, para que apunten a él etiquetas y pruebas', () => {
    const w = montar({ id: 'r-password' })
    expect(w.find('input').attributes('id')).toBe('r-password')
    expect(w.find('label').attributes('for')).toBe('r-password')
  })

  // Señalar «demasiado corta» sobre un campo vacío que nadie tocó es regañar
  // antes de tiempo.
  it('no muestra error antes de que la persona escriba', () => {
    expect(montar().find('.campo-contrasena-error').exists()).toBe(false)
  })

  it('muestra el error junto al campo tras escribir algo insuficiente', async () => {
    const w = montar({ modelValue: 'corta' })
    await w.find('input').trigger('blur')
    const err = w.find('.campo-contrasena-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain(String(MINIMO_LONGITUD))
    expect(err.attributes('role')).toBe('alert')
    expect(w.find('input').attributes('aria-invalid')).toBe('true')
  })

  it('un error de fuera se muestra igual, sin esperar a que se escriba', () => {
    const w = montar({ error: 'Esa contraseña fue rechazada por el servidor.' })
    expect(w.find('.campo-contrasena-error').text()).toContain('rechazada')
  })

  it('alterna la visibilidad y lo dice en la etiqueta', async () => {
    const w = montar()
    const ojo = w.find('.campo-contrasena-ojo')
    expect(w.find('input').attributes('type')).toBe('password')
    expect(ojo.attributes('aria-label')).toMatch(/mostrar/i)
    await ojo.trigger('click')
    expect(w.find('input').attributes('type')).toBe('text')
    expect(ojo.attributes('aria-label')).toMatch(/ocultar/i)
    expect(ojo.attributes('aria-pressed')).toBe('true')
  })

  it('el botón declara su tipo, para no enviar el formulario al pulsarlo', () => {
    expect(montar().find('.campo-contrasena-ojo').attributes('type')).toBe('button')
  })

  // La contraseña ACTUAL ya existe: anunciar requisitos junto a ella sugiere
  // que hay que cambiarla.
  it('puede callar las reglas para el campo de contraseña actual', () => {
    const w = montar({ anunciarReglas: false, autocomplete: 'current-password' })
    expect(w.find('.campo-contrasena-reglas').exists()).toBe(false)
    expect(w.find('input').attributes('autocomplete')).toBe('current-password')
  })

  it('el estado de cada regla no viaja solo en el color', () => {
    const w = montar({ modelValue: 'x'.repeat(MINIMO_LONGITUD) })
    expect(w.find('.campo-contrasena-reglas').text()).toMatch(/cumplido/i)
  })

  it('emite lo que se escribe', async () => {
    const w = montar()
    await w.find('input').setValue('unaContrasenaLarga')
    expect(w.emitted('update:modelValue')[0]).toEqual(['unaContrasenaLarga'])
  })
})
