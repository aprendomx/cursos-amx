import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminCourseEditor from '@/components/AdminCourseEditor.vue'
import { sbSelect, sbInsert, sbPatch, sbDelete } from '@/lib/sbRest'
import { cargarPreguntasAdmin } from '@/services/evaluaciones'

vi.mock('@/lib/sbRest', () => ({
  sbSelect: vi.fn(),
  sbInsert: vi.fn(),
  sbPatch: vi.fn(),
  sbDelete: vi.fn(),
}))
vi.mock('@/services/portadas.js', () => ({
  uploadPortada: vi.fn(),
  deletePortada: vi.fn(),
}))
vi.mock('@/services/evaluaciones', () => ({
  cargarPreguntasAdmin: vi.fn().mockResolvedValue([]),
  guardarEvaluacionAdmin: vi.fn().mockResolvedValue(),
}))
vi.mock('@/lib/featureFlags.js', () => ({
  featureEnabled: vi.fn(() => false),
}))
vi.mock('@/composables/useFeatureFlags.js', () => ({
  useFeatureFlags: () => ({ isEnabled: () => false, load: vi.fn() }),
}))
vi.mock('@/components/AdminConstanciaCurso.vue', () => ({
  default: {
    name: 'AdminConstanciaCurso',
    props: ['cursoId', 'cursoTitulo', 'cursoDuracion'],
    template: '<div data-test="constancia-curso" />',
  },
}))
vi.mock('@/components/CourseBuilder.vue', () => ({
  default: { name: 'CourseBuilder', props: ['cursoId', 'session'], template: '<div />' },
}))
vi.mock('@/components/VideoUploadField.vue', () => ({
  default: { name: 'VideoUploadField', template: '<div />' },
}))
vi.mock('@/components/DocumentoUploadField.vue', () => ({
  default: { name: 'DocumentoUploadField', template: '<div />' },
}))
vi.mock('@/components/EvaluacionEditor.vue', () => ({
  default: { name: 'EvaluacionEditor', props: ['preguntas'], template: '<div />' },
}))

const CURSO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MODULO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LECCION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const EXAMEN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const SESSION = { access_token: 'tok-admin', user: { id: 'u-admin' } }

const wrappers = []
function factory(props = {}) {
  const w = mount(AdminCourseEditor, {
    props: { session: SESSION, initialCurso: null, ...props },
    attachTo: document.body,
  })
  wrappers.push(w)
  return w
}

function stepButtons(w) {
  return w.findAll('.editor-step-btn')
}

function saveButton(w) {
  return w.find('[data-test="guardar"]')
}

describe('AdminCourseEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cargarPreguntasAdmin.mockResolvedValue([])
  })

  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers.length = 0
    document.body.innerHTML = ''
  })

  it('sin initialCurso crea un curso en blanco con 1 módulo y 1 lección', async () => {
    const w = factory()
    await flushPromises()
    expect(w.find('input[type="text"]').element.value).toBe('')
    expect(w.vm.editingCurso.modulos).toHaveLength(1)
    expect(w.vm.editingCurso.modulos[0].lecciones).toHaveLength(1)
    expect(sbSelect).not.toHaveBeenCalled()
  })

  it('genera el slug automáticamente desde el título', async () => {
    const w = factory()
    await flushPromises()
    await w.find('input[type="text"]').setValue('Curso de Prueba Ñoño')
    expect(w.vm.editingCurso.slug).toBe('curso-de-prueba-nono')
  })

  it('emite cancel al pulsar Cerrar', async () => {
    const w = factory()
    await flushPromises()
    await w
      .findAll('button')
      .find((b) => b.text().includes('Cerrar'))
      .trigger('click')
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('agrega y elimina módulos desde el paso Estructura', async () => {
    const w = factory()
    await flushPromises()
    await stepButtons(w)[1].trigger('click')

    const addBtn = w.findAll('button').find((b) => b.text().includes('Agregar módulo'))
    await addBtn.trigger('click')
    expect(w.vm.editingCurso.modulos).toHaveLength(2)

    // Con un solo módulo el botón eliminar está deshabilitado.
    const deleteBtns = w.findAll('.editor-module-header .editor-icon-btn-danger')
    expect(deleteBtns).toHaveLength(2)
    await deleteBtns[1].trigger('click')
    expect(w.vm.editingCurso.modulos).toHaveLength(1)
    expect(
      w.find('.editor-module-header .editor-icon-btn-danger').attributes('disabled')
    ).toBeDefined()
  })

  it('reordena módulos con mover arriba/abajo', async () => {
    const w = factory()
    await flushPromises()
    w.vm.editingCurso.modulos[0].titulo = 'Primero'
    await stepButtons(w)[1].trigger('click')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Agregar módulo'))
      .trigger('click')
    w.vm.editingCurso.modulos[1].titulo = 'Segundo'

    await w.findAll('button[title="Mover arriba"]')[1].trigger('click')
    expect(w.vm.editingCurso.modulos.map((m) => m.titulo)).toEqual(['Segundo', 'Primero'])
  })

  it('rechaza guardar un curso MARCADO COMO PUBLICADO si le faltan datos', async () => {
    const w = factory()
    await flushPromises()
    w.vm.editingCurso.publicado = true
    await saveButton(w).trigger('click')
    await flushPromises()
    expect(w.find('.publish-status-error').text()).toContain('Faltan datos')
    expect(sbInsert).not.toHaveBeenCalled()
  })

  // Lo contrario del caso anterior, y el motivo del cambio: arreglar una
  // errata en un curso a medias no debe exigir completarlo entero.
  it('guarda un borrador incompleto sin quejarse', async () => {
    sbInsert.mockImplementation(async (table) => {
      if (table === 'cursos') return { id: CURSO_ID }
      if (table === 'modulos') return { id: MODULO_ID }
      if (table === 'lecciones') return { id: LECCION_ID }
      return {}
    })
    const w = factory()
    await flushPromises()
    // Sin descripción y con la lección en blanco: no pasaría la validación.
    w.vm.editingCurso.titulo = 'Apenas un título'
    await saveButton(w).trigger('click')
    await flushPromises()
    expect(w.find('.publish-status-error').exists()).toBe(false)
    expect(sbInsert).toHaveBeenCalledWith(
      'cursos',
      expect.objectContaining({ publicado: false }),
      'tok-admin'
    )
  })

  it('el botón Guardar está en los cuatro pasos, y vive en la cabecera', async () => {
    const w = factory()
    await flushPromises()
    // En la cabecera y no dentro del panel del paso: es lo que garantiza que
    // siga ahí al cambiar de pestaña.
    expect(w.find('.admin-content-header [data-test="guardar"]').exists()).toBe(true)

    for (let paso = 0; paso < 4; paso++) {
      await stepButtons(w)[paso].trigger('click')
      await flushPromises()
      expect(saveButton(w).exists(), `falta en el paso ${paso}`).toBe(true)
    }
  })

  it('guarda desde el paso Básico sin visitar ningún otro', async () => {
    sbInsert.mockImplementation(async (table) => {
      if (table === 'cursos') return { id: CURSO_ID }
      if (table === 'modulos') return { id: MODULO_ID }
      if (table === 'lecciones') return { id: LECCION_ID }
      return {}
    })
    const w = factory()
    await flushPromises()
    const c = w.vm.editingCurso
    c.titulo = 'Curso guardado desde Básico'
    c.descripcion = 'Descripción suficientemente larga.'
    c.modulos[0].titulo = 'Módulo 1'
    c.modulos[0].lecciones[0].titulo = 'Lección 1'
    c.modulos[0].lecciones[0].youtube_url = 'https://youtu.be/abc12345678'

    // Sin tocar stepButtons: seguimos en el paso 0.
    await saveButton(w).trigger('click')
    await flushPromises()

    expect(sbInsert).toHaveBeenCalledWith(
      'cursos',
      expect.objectContaining({ titulo: 'Curso guardado desde Básico' }),
      'tok-admin'
    )
    expect(w.emitted('published')).toEqual([[CURSO_ID]])
  })

  it('exige sesión para publicar', async () => {
    const w = factory({ session: null })
    await flushPromises()
    const c = w.vm.editingCurso
    c.titulo = 'Curso válido'
    c.descripcion = 'Descripción suficientemente larga.'
    c.modulos[0].lecciones[0].youtube_url = 'https://youtu.be/abc12345678'
    await stepButtons(w)[3].trigger('click')
    await saveButton(w).trigger('click')
    await flushPromises()
    expect(w.find('.publish-status-error').text()).toContain('Necesitas iniciar sesión')
  })

  it('publica un curso nuevo: inserta curso, módulos y lecciones y emite published', async () => {
    sbInsert.mockImplementation(async (table) => {
      if (table === 'cursos') return { id: CURSO_ID }
      if (table === 'modulos') return { id: MODULO_ID }
      if (table === 'lecciones') return { id: LECCION_ID }
      return {}
    })
    const w = factory()
    await flushPromises()
    const c = w.vm.editingCurso
    c.titulo = 'Curso de Transparencia'
    c.descripcion = 'Descripción suficientemente larga.'
    c.modulos[0].titulo = 'Módulo 1'
    const lec = c.modulos[0].lecciones[0]
    lec.titulo = 'Lección 1'
    lec.youtube_url = 'https://youtu.be/abc12345678'
    lec.requiere_entrega = true
    lec.entrega_tipos_csv = 'PDF, .zip'

    await stepButtons(w)[3].trigger('click')
    await saveButton(w).trigger('click')
    await flushPromises()

    expect(sbInsert).toHaveBeenCalledWith(
      'cursos',
      expect.objectContaining({ slug: 'curso-de-transparencia', titulo: 'Curso de Transparencia' }),
      'tok-admin'
    )
    expect(sbInsert).toHaveBeenCalledWith(
      'modulos',
      expect.objectContaining({ curso_id: CURSO_ID, orden: 1, titulo: 'Módulo 1' }),
      'tok-admin'
    )
    expect(sbInsert).toHaveBeenCalledWith(
      'lecciones',
      expect.objectContaining({
        modulo_id: MODULO_ID,
        titulo: 'Lección 1',
        url_youtube: 'https://youtu.be/abc12345678',
        requiere_entrega: true,
        entrega_tipos: ['pdf', 'zip'],
      }),
      'tok-admin'
    )
    expect(w.emitted('published')).toEqual([[CURSO_ID]])
    expect(w.find('.publish-status-success').exists()).toBe(true)
  })

  it('carga un curso existente ordenando módulos/lecciones y derivando la fuente', async () => {
    sbSelect.mockResolvedValue({
      data: [
        {
          id: CURSO_ID,
          slug: 'existente',
          titulo: 'Curso existente',
          descripcion: 'Ya guardado en la base.',
          nivel: 'Intermedio',
          imagen_portada: '',
          publicado: true,
          modulos: [
            {
              id: MODULO_ID,
              orden: 2,
              titulo: 'Módulo B',
              lecciones: [
                {
                  id: LECCION_ID,
                  orden: 1,
                  titulo: 'Video HLS',
                  tipo_material: 'video',
                  video_id: 'vid-1',
                  duracion_seg: 90,
                },
              ],
            },
            {
              id: 'm-sin-uuid',
              orden: 1,
              titulo: 'Módulo A',
              lecciones: [
                {
                  id: EXAMEN_ID,
                  orden: 2,
                  titulo: 'Examen final',
                  tipo_material: 'examen',
                },
                {
                  id: 'l-doc',
                  orden: 1,
                  titulo: 'Lectura',
                  tipo_material: 'lectura',
                  documento_path: 'docs/lectura.pdf',
                  documento_tipo: 'pdf',
                },
              ],
            },
          ],
        },
      ],
    })
    const w = factory({ initialCurso: { id: CURSO_ID } })
    await flushPromises()

    const c = w.vm.editingCurso
    expect(c.titulo).toBe('Curso existente')
    // Módulos ordenados por `orden`, no por posición en la respuesta.
    expect(c.modulos.map((m) => m.titulo)).toEqual(['Módulo A', 'Módulo B'])
    // Lecciones ordenadas y con fuente derivada del contenido.
    expect(c.modulos[0].lecciones.map((l) => l.fuente)).toEqual(['documento', 'examen'])
    expect(c.modulos[1].lecciones[0].fuente).toBe('hls')
    expect(c.modulos[1].lecciones[0].duracion).toBe('1:30')
    // Solo la lección examen con id UUID carga sus preguntas.
    expect(cargarPreguntasAdmin).toHaveBeenCalledTimes(1)
    expect(cargarPreguntasAdmin).toHaveBeenCalledWith(EXAMEN_ID)
  })

  it('actualiza un curso existente vía sbPatch y elimina lo que ya no está', async () => {
    const LECCION_BORRADA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    sbSelect.mockImplementation(async (path) => {
      if (path.startsWith('cursos?')) {
        return {
          data: [
            {
              id: CURSO_ID,
              slug: 'existente',
              titulo: 'Curso existente',
              descripcion: 'Ya guardado en la base.',
              nivel: 'Intermedio',
              publicado: true,
              modulos: [
                {
                  id: MODULO_ID,
                  orden: 1,
                  titulo: 'Módulo A',
                  lecciones: [
                    {
                      id: LECCION_ID,
                      orden: 1,
                      titulo: 'Video',
                      tipo_material: 'video',
                      url_youtube: 'https://youtu.be/abc12345678',
                    },
                    {
                      id: LECCION_BORRADA,
                      orden: 2,
                      titulo: 'Se elimina',
                      tipo_material: 'video',
                      url_youtube: 'https://youtu.be/zzz12345678',
                    },
                  ],
                },
              ],
            },
          ],
        }
      }
      // Estado actual en base para el diff de publish.
      return {
        data: [{ id: MODULO_ID, lecciones: [{ id: LECCION_ID }, { id: LECCION_BORRADA }] }],
      }
    })
    sbPatch.mockResolvedValue({ id: CURSO_ID })
    sbDelete.mockResolvedValue({})

    const w = factory({ initialCurso: { id: CURSO_ID } })
    await flushPromises()
    // El admin borra la segunda lección en el editor.
    w.vm.editingCurso.modulos[0].lecciones.splice(1, 1)

    await stepButtons(w)[3].trigger('click')
    await saveButton(w).trigger('click')
    await flushPromises()

    expect(sbPatch).toHaveBeenCalledWith(
      'cursos',
      `id=eq.${CURSO_ID}`,
      expect.objectContaining({ titulo: 'Curso existente' }),
      'tok-admin'
    )
    expect(sbDelete).toHaveBeenCalledWith(`lecciones?id=eq.${LECCION_BORRADA}`, 'tok-admin')
    expect(w.emitted('published')).toEqual([[CURSO_ID]])
  })

  it('carga los resultados de aprendizaje en el editor, uno por línea', async () => {
    sbSelect.mockResolvedValue({
      data: [
        {
          id: CURSO_ID,
          slug: 'con-resultados',
          titulo: 'Curso con resultados',
          descripcion: 'Descripción suficientemente larga.',
          resultados_aprendizaje: ['Aplicar la norma en tu área', 'Emitir opiniones de valor'],
          nivel: 'Fundamental',
          publicado: true,
          modulos: [],
        },
      ],
    })
    const w = factory({ initialCurso: { id: CURSO_ID } })
    await flushPromises()
    expect(w.vm.editingCurso.resultados_texto).toBe(
      'Aplicar la norma en tu área\nEmitir opiniones de valor'
    )
  })

  it('publica los resultados como array limpio (sin líneas vacías)', async () => {
    sbInsert.mockImplementation(async (table) => {
      if (table === 'cursos') return { id: CURSO_ID }
      if (table === 'modulos') return { id: MODULO_ID }
      if (table === 'lecciones') return { id: LECCION_ID }
      return {}
    })
    const w = factory()
    await flushPromises()
    const c = w.vm.editingCurso
    c.titulo = 'Curso con resultados'
    c.descripcion = 'Descripción suficientemente larga.'
    c.resultados_texto = '  Saber A  \n\nSaber B\n'
    c.modulos[0].titulo = 'Módulo 1'
    c.modulos[0].lecciones[0].titulo = 'Lección 1'
    c.modulos[0].lecciones[0].youtube_url = 'https://youtu.be/abc12345678'

    await saveButton(w).trigger('click')
    await flushPromises()
    expect(sbInsert).toHaveBeenCalledWith(
      'cursos',
      expect.objectContaining({ resultados_aprendizaje: ['Saber A', 'Saber B'] }),
      'tok-admin'
    )
  })

  // Los resultados se piden pero NO bloquean: vacíos se guardan como null y
  // la tarjeta de la portada degrada a solo metadatos (tarea 2.2).
  it('guarda resultados_aprendizaje en null cuando el campo queda vacío', async () => {
    sbInsert.mockImplementation(async (table) => {
      if (table === 'cursos') return { id: CURSO_ID }
      if (table === 'modulos') return { id: MODULO_ID }
      if (table === 'lecciones') return { id: LECCION_ID }
      return {}
    })
    const w = factory()
    await flushPromises()
    const c = w.vm.editingCurso
    c.titulo = 'Curso sin resultados'
    c.descripcion = 'Descripción suficientemente larga.'
    await saveButton(w).trigger('click')
    await flushPromises()
    expect(sbInsert).toHaveBeenCalledWith(
      'cursos',
      expect.objectContaining({ resultados_aprendizaje: null }),
      'tok-admin'
    )
  })

  it('el aviso de resultados aparece en Revisar solo cuando el campo está vacío', async () => {
    const w = factory()
    await flushPromises()
    await stepButtons(w)[3].trigger('click')
    expect(w.find('[data-test="aviso-resultados"]').exists()).toBe(true)
    w.vm.editingCurso.resultados_texto = 'Saber A'
    await w.vm.$nextTick()
    expect(w.find('[data-test="aviso-resultados"]').exists()).toBe(false)
  })
})
