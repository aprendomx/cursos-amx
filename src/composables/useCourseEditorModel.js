// Modelo del editor de cursos (AdminCourseEditor): factorías, slug,
// operaciones de estructura y validación. Sin I/O — la persistencia
// vive en useCursoPersistence.js.
import { ref, computed } from 'vue'

export const nivelOptions = ['Fundamental', 'Intermedio', 'Avanzado']
export const idiomaOptions = ['Español', 'Inglés', 'Francés']
export const tipoOptions = ['video', 'lectura', 'evaluación', 'actividad']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v) => UUID_RE.test(v || '')

export function autoSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function createBlankLesson(id = 'l-1') {
  return {
    id,
    titulo: '',
    tipo: 'video',
    youtube_url: '',
    duracion: '',
    video_id: null,
    documento_path: null,
    documento_tipo: null,
    fuente: 'youtube',
    requiere_entrega: false,
    entrega_tipos_csv: 'pdf, docx, zip, png, jpg',
    entrega_max_mb: 10,
    eval_puntaje_minimo: 70,
    eval_max_intentos: 3,
    preguntas: [],
  }
}

export function createBlankModulo(id = 'm-1', { requierePrevio = false, leccionId = 'l-1' } = {}) {
  return {
    id,
    titulo: '',
    descripcion: '',
    imagen_portada: '',
    requiere_previo: requierePrevio,
    lecciones: [createBlankLesson(leccionId)],
  }
}

export function createBlankCurso() {
  return {
    id: 'c-new-' + Date.now(),
    slug: '',
    titulo: '',
    descripcion: '',
    nivel: 'Fundamental',
    idioma: 'Español',
    imagen: '',
    publicado: false,
    modulos: [createBlankModulo()],
  }
}

export function parseEntregaTipos(csv) {
  const tipos = String(csv || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/^\./, ''))
    .filter(Boolean)
  return tipos.length ? tipos : ['pdf', 'docx', 'zip', 'png', 'jpg']
}

export function entregaPayload(lec) {
  return {
    requiere_entrega: lec.requiere_entrega === true,
    entrega_tipos: parseEntregaTipos(lec.entrega_tipos_csv),
    entrega_max_mb: Math.min(50, Math.max(1, parseInt(lec.entrega_max_mb, 10) || 10)),
  }
}

/**
 * Estado del curso en edición + operaciones de estructura + validación.
 *
 * @param {object} opts
 * @param {import('vue').Ref<boolean>|import('vue').ComputedRef<boolean>} opts.visualBuilder
 * @param {import('vue').Ref<object|null>} opts.builderResumen
 */
export function useCourseEditorModel({ visualBuilder, builderResumen }) {
  const editingCurso = ref(null)

  /* ── Estructura ─────────────────────────────────── */
  function addModule() {
    const c = editingCurso.value
    const idx = c.modulos.length + 1
    c.modulos.push(createBlankModulo(`m-${idx}`, { requierePrevio: true, leccionId: `l-${idx}-1` }))
  }

  function removeModule(mi) {
    editingCurso.value.modulos.splice(mi, 1)
  }

  function moveModule(mi, dir) {
    const mods = editingCurso.value.modulos
    const target = mi + dir
    if (target < 0 || target >= mods.length) return
    const temp = mods[mi]
    mods[mi] = mods[target]
    mods[target] = temp
  }

  function addLesson(mi) {
    const mod = editingCurso.value.modulos[mi]
    const idx = mod.lecciones.length + 1
    mod.lecciones.push(createBlankLesson(`l-${mi}-${idx}`))
  }

  function removeLesson(mi, li) {
    editingCurso.value.modulos[mi].lecciones.splice(li, 1)
  }

  /* ── Validación y resumen ───────────────────────── */
  const validationChecks = computed(() => {
    if (!editingCurso.value) return []
    const c = editingCurso.value
    // v2: con el constructor visual usamos builderResumen para estructura
    // Solo usamos builderResumen cuando ya recibimos al menos un @structure-changed
    if (visualBuilder.value && isUuid(c.id) && builderResumen.value !== null) {
      const br = builderResumen.value
      return [
        { label: 'Tiene título', pass: (c.titulo || '').trim().length > 0 },
        {
          label: 'Descripción ≥ 10 caracteres',
          pass: (c.descripcion || '').trim().length >= 10,
        },
        { label: '≥ 1 módulo', pass: br.modulos > 0 },
        { label: '≥ 1 lección', pass: br.lecciones > 0 },
      ]
    }
    const allLessons = c.modulos.flatMap((m) => m.lecciones)
    return [
      { label: 'Tiene título', pass: (c.titulo || '').trim().length > 0 },
      {
        label: 'Descripción ≥ 10 caracteres',
        pass: (c.descripcion || '').trim().length >= 10,
      },
      { label: '≥ 1 módulo', pass: c.modulos.length >= 1 },
      { label: '≥ 1 lección', pass: allLessons.length >= 1 },
      {
        label: 'Todas las lecciones tienen contenido',
        pass:
          allLessons.length > 0 &&
          allLessons.every(
            (l) =>
              (l.fuente === 'youtube' && (l.youtube_url || '').trim().length > 0) ||
              (l.fuente === 'hls' && !!l.video_id) ||
              (l.fuente === 'documento' && !!l.documento_path) ||
              (l.fuente === 'examen' && (l.preguntas?.length || 0) > 0) ||
              (l.fuente === 'texto' && !!l.contenido)
          ),
      },
    ]
  })

  const allValid = computed(() => validationChecks.value.every((v) => v.pass))

  const editorSummary = computed(() => {
    if (!editingCurso.value) return []
    const c = editingCurso.value
    const totalLessons = c.modulos.reduce((sum, m) => sum + m.lecciones.length, 0)
    return [
      { label: 'Título', value: c.titulo || '—' },
      { label: 'Slug', value: c.slug || '—' },
      { label: 'Nivel', value: c.nivel },
      { label: 'Idioma', value: c.idioma },
      { label: 'Módulos', value: String(c.modulos.length) },
      { label: 'Lecciones', value: String(totalLessons) },
      { label: 'Publicado', value: c.publicado ? 'Sí' : 'No' },
    ]
  })

  return {
    editingCurso,
    addModule,
    removeModule,
    moveModule,
    addLesson,
    removeLesson,
    validationChecks,
    allValid,
    editorSummary,
  }
}
