import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminDisenos from '@/components/AdminDisenos.vue'
import { listarDisenos, guardarDiseno, subirAssetDiseno } from '@/services/constanciaDisenos.js'

vi.mock('@/services/constanciaDisenos.js', () => ({
  listarDisenos: vi.fn(),
  guardarDiseno: vi.fn(),
  subirAssetDiseno: vi.fn(),
  urlAsset: (p) => (p ? `https://cdn.test/${p}` : null),
}))

const DISENOS = [
  { id: 'd1', clave: 'institucional', nombre: 'Institucional', fondo_path: 'f.webp', activo: true },
  { id: 'd2', clave: 'sobrio', nombre: 'Sobrio', fondo_path: null, activo: false },
]

async function montarYNuevo() {
  const w = mount(AdminDisenos)
  await flushPromises()
  await w
    .findAll('button')
    .find((b) => b.text().includes('Nuevo diseño'))
    .trigger('click')
  return w
}

describe('AdminDisenos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarDisenos.mockResolvedValue(DISENOS)
    guardarDiseno.mockResolvedValue({})
    subirAssetDiseno.mockResolvedValue('subido.png')
  })

  it('lista los diseños y marca los inactivos', async () => {
    const w = mount(AdminDisenos)
    await flushPromises()

    expect(w.text()).toContain('Institucional')
    expect(w.text()).toContain('Sobrio')
    expect(w.findAll('li.es-inactivo')).toHaveLength(1)
  })

  // La clave es el identificador que referencian los cursos: pedirla aparte
  // del nombre sería pedir dos cosas para lo mismo.
  it('deriva la clave del nombre, sin acentos ni espacios', async () => {
    const w = await montarYNuevo()
    await w.find('#d-nombre').setValue('Diseño Institucional 2026')
    expect(w.find('#d-clave').attributes('placeholder')).toBe('diseno-institucional-2026')
  })

  it('usa la clave derivada al guardar si no se escribió una', async () => {
    const w = await montarYNuevo()
    await w.find('#d-nombre').setValue('Sobrio Azul')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Guardar diseño'))
      .trigger('click')
    await flushPromises()

    expect(guardarDiseno).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Sobrio Azul', clave: 'sobrio-azul' })
    )
  })

  it('respeta una clave escrita a mano', async () => {
    const w = await montarYNuevo()
    await w.find('#d-nombre').setValue('Sobrio Azul')
    await w.find('#d-clave').setValue('mi-clave')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Guardar diseño'))
      .trigger('click')
    await flushPromises()

    expect(guardarDiseno).toHaveBeenCalledWith(expect.objectContaining({ clave: 'mi-clave' }))
  })

  it('exige nombre y no llama al servidor sin él', async () => {
    const w = await montarYNuevo()
    await w
      .findAll('button')
      .find((b) => b.text().includes('Guardar diseño'))
      .trigger('click')
    await flushPromises()

    expect(guardarDiseno).not.toHaveBeenCalled()
    expect(w.text()).toContain('nombre es obligatorio')
  })

  it('explica una clave duplicada en vez de mostrar el error crudo', async () => {
    guardarDiseno.mockRejectedValue(new Error('duplicate key value violates unique constraint'))
    const w = await montarYNuevo()
    await w.find('#d-nombre').setValue('Institucional')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Guardar diseño'))
      .trigger('click')
    await flushPromises()

    expect(w.text()).toContain('Ya existe un diseño con la clave')
  })

  it('desactivar no borra: conserva el diseño y solo cambia su estado', async () => {
    const w = mount(AdminDisenos)
    await flushPromises()
    await w
      .findAll('button')
      .find((b) => b.text().includes('Desactivar'))
      .trigger('click')
    await flushPromises()

    expect(guardarDiseno).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1', activo: false }))
  })

  it('avisa de que desactivar no altera las constancias emitidas', async () => {
    const w = mount(AdminDisenos)
    await flushPromises()
    expect(w.text()).toContain('no altera las constancias ya emitidas')
  })

  it('informa si los diseños no se pueden cargar', async () => {
    listarDisenos.mockRejectedValue(new Error('permiso denegado'))
    const w = mount(AdminDisenos)
    await flushPromises()
    expect(w.text()).toContain('permiso denegado')
  })
})
