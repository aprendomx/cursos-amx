import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import EntregaUploader from '@/components/EntregaUploader.vue'

const mockSubirArchivo = vi.fn()

vi.mock('@/services/entregas', () => ({
  subirArchivo: (...args) => mockSubirArchivo(...args),
}))

describe('EntregaUploader', () => {
  beforeEach(() => {
    mockSubirArchivo.mockReset()
  })

  it('renders drag & drop zone', () => {
    const wrapper = mount(EntregaUploader, {
      props: { tareaId: 't1', userId: 'u1', version: 1 },
    })
    expect(wrapper.find('[data-test="drop-zone"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="file-input"]').exists()).toBe(true)
  })

  it('emits uploaded files after successful upload', async () => {
    mockSubirArchivo.mockResolvedValue('entregas/t1/u1/v1/file.pdf')

    const wrapper = mount(EntregaUploader, {
      props: { tareaId: 't1', userId: 'u1', version: 1 },
    })

    const file = new File(['x'], 'file.pdf', { type: 'application/pdf' })
    const input = wrapper.find('[data-test="file-input"]')
    Object.defineProperty(input.element, 'files', {
      value: [file],
      writable: false,
    })
    await input.trigger('change')

    // wait for async upload
    await vi.waitFor(() => {
      expect(wrapper.emitted('uploaded')).toBeTruthy()
    })

    expect(mockSubirArchivo).toHaveBeenCalledWith('t1', 'u1', 1, file)
    expect(wrapper.emitted('uploaded')[0]).toEqual([['entregas/t1/u1/v1/file.pdf']])
    expect(wrapper.findAll('[data-test="file-item"]')).toHaveLength(1)
  })
})
