<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import IconSet from '@/components/IconSet.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import PlaceholderImage from '@/components/PlaceholderImage.vue'
import VideoUploadField from '@/components/VideoUploadField.vue'
import DocumentoUploadField from '@/components/DocumentoUploadField.vue'
import EvaluacionEditor from '@/components/EvaluacionEditor.vue'
import { uploadPortada, deletePortada } from '@/services/portadas.js'
import { cargarPreguntasAdmin, guardarEvaluacionAdmin } from '@/services/evaluaciones.js'
import { featureEnabled } from '@/lib/featureFlags.js'

const props = defineProps({
  session: { type: Object, default: null },
  initialCurso: { type: Object, default: null },
})

const emit = defineEmits(['published', 'cancel'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v) => UUID_RE.test(v || '')
const isUrl = (v) => typeof v === 'string' && /^(https?:|\/)/.test(v)

/* ──────────────────────────────
   Reactive state
   ────────────────────────────── */
const editingCurso = ref(null)
const editorStep = ref(0)

const portadaInputRef = ref(null)
const portadaUploading = ref(false)
const portadaProgress = ref(0)
const portadaError = ref('')

const publishing = ref(false)
const publishStatus = ref(null)

/* ──────────────────────────────
   Helpers (copied from AdminPage)
   ────────────────────────────── */
function autoSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function createBlankCurso() {
  return {
    id: 'c-new-' + Date.now(),
    slug: '',
    titulo: '',
    descripcion: '',
    nivel: 'Fundamental',
    idioma: 'Espa\u00f1ol',
    imagen: '',
    publicado: false,
    modulos: [
      {
        id: 'm-1',
        titulo: '',
        descripcion: '',
        imagen_portada: '',
        requiere_previo: false,
        lecciones: [
          {
            id: 'l-1',
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
          },
        ],
      },
    ],
  }
}

function parseDuracionToSeg(input) {
  if (!input) return 0
  const s = String(input).trim()
  if (!s) return 0
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  const parts = s.split(':').map((p) => parseInt(p, 10))
  if (parts.some(Number.isNaN)) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

function parseEntregaTipos(csv) {
  const tipos = String(csv || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/^\./, ''))
    .filter(Boolean)
  return tipos.length ? tipos : ['pdf', 'docx', 'zip', 'png', 'jpg']
}

function entregaPayload(lec) {
  return {
    requiere_entrega: lec.requiere_entrega === true,
    entrega_tipos: parseEntregaTipos(lec.entrega_tipos_csv),
    entrega_max_mb: Math.min(50, Math.max(1, parseInt(lec.entrega_max_mb, 10) || 10)),
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms}ms) en ${label}`)), ms)
    ),
  ])
}

function explainPgError(table, status, body) {
  let pg = null
  try {
    pg = typeof body === 'string' ? JSON.parse(body) : body
  } catch {
    /* texto plano */
  }
  const code = pg?.code
  const msg = pg?.message || ''
  const tableLabel =
    { cursos: 'curso', modulos: 'm\u00f3dulo', lecciones: 'lecci\u00f3n' }[table] || table

  if (code === '23505') {
    if (/slug/i.test(msg))
      return `Ya existe un ${tableLabel} con ese slug. Cambia el slug o el t\u00edtulo.`
    if (/orden/i.test(msg)) return `Ya existe un ${tableLabel} con ese orden en este nivel.`
    return `Registro duplicado en ${tableLabel}: ${msg}`
  }
  if (code === '23502') {
    const col = msg.match(/column "(.+?)"/)?.[1]
    return `Falta el campo obligatorio${col ? ' "' + col + '"' : ''} en ${tableLabel}.`
  }
  if (code === '23503') return `Referencia inv\u00e1lida en ${tableLabel} (FK): ${msg}`
  if (code === '23514') return `Valor no permitido en ${tableLabel} (check): ${msg}`
  if (code === '42501' || status === 403) {
    return `Permisos insuficientes para escribir en ${tableLabel} (RLS). Verifica que tu usuario sea administrador.`
  }
  if (status === 401) return 'Tu sesi\u00f3n expir\u00f3. Cierra sesi\u00f3n y vuelve a entrar.'
  if (status >= 500)
    return `Error del servidor (${status}) al guardar ${tableLabel}. Intenta de nuevo.`
  return msg ? `${tableLabel}: ${msg}` : `${tableLabel}: error ${status}`
}

async function rawSelect(path, accessToken, opts = {}) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${path}`
  const headers = {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  }
  if (opts.count) {
    headers.Prefer = `count=${opts.count}`
    headers.Range = '0-0'
  }
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`select ${path} ${res.status}: ${await res.text()}`)
  let count = null
  const range = res.headers.get('content-range')
  if (range) {
    const m = range.match(/\/(\d+|\*)$/)
    if (m && m[1] !== '*') count = parseInt(m[1], 10)
  }
  return { data: opts.count ? [] : await res.json(), count }
}

async function rawInsert(table, payload, accessToken, returnRow = true) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: returnRow ? 'return=representation' : 'return=minimal',
    },
    body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
  })
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(explainPgError(table, res.status, text))
    err.raw = text
    err.status = res.status
    throw err
  }
  if (!returnRow) return null
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

async function rawPatch(table, query, payload, accessToken) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?${query}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(explainPgError(table, res.status, text))
    err.raw = text
    err.status = res.status
    throw err
  }
  const rows = await res.json()
  return Array.isArray(rows) ? rows[0] : rows
}

async function rawDelete(path, accessToken) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(explainPgError(path.split('?')[0], res.status, text))
    err.raw = text
    err.status = res.status
    throw err
  }
}

/* ──────────────────────────────
   Course loading
   ────────────────────────────── */
async function loadCurso(curso) {
  publishStatus.value = null
  if (!props.session?.access_token) {
    publishStatus.value = { type: 'error', text: 'Necesitas iniciar sesi\u00f3n.' }
    return
  }
  try {
    const token = props.session.access_token
    const { data: rows } = await rawSelect(
      `cursos?select=id,slug,titulo,descripcion,nivel,imagen_portada,publicado,modulos(id,orden,titulo,descripcion,imagen_portada,requiere_previo,lecciones(id,orden,titulo,tipo_material,url_youtube,duracion_seg,video_id,documento_path,documento_tipo,requiere_entrega,entrega_tipos,entrega_max_mb,eval_puntaje_minimo,eval_max_intentos))&id=eq.${curso.id}`,
      token
    )
    const c = rows?.[0]
    if (!c) {
      publishStatus.value = { type: 'error', text: 'No se encontr\u00f3 el curso en la base.' }
      return
    }
    const modulos = (c.modulos || [])
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((m, mi) => ({
        id: m.id || `m-${mi + 1}`,
        titulo: m.titulo || '',
        descripcion: m.descripcion || '',
        imagen_portada: m.imagen_portada || '',
        requiere_previo: !!m.requiere_previo,
        lecciones: (m.lecciones || [])
          .slice()
          .sort((a, b) => a.orden - b.orden)
          .map((l, li) => ({
            id: l.id || `l-${mi + 1}-${li + 1}`,
            titulo: l.titulo || '',
            tipo: l.tipo_material || 'video',
            youtube_url: l.url_youtube || '',
            duracion: l.duracion_seg
              ? `${Math.floor(l.duracion_seg / 60)}:${String(l.duracion_seg % 60).padStart(2, '0')}`
              : '',
            video_id: l.video_id || null,
            documento_path: l.documento_path || null,
            documento_tipo: l.documento_tipo || null,
            fuente:
              l.tipo_material === 'examen'
                ? 'examen'
                : l.documento_path
                  ? 'documento'
                  : l.video_id
                    ? 'hls'
                    : l.url_youtube
                      ? 'youtube'
                      : 'ninguno',
            requiere_entrega: l.requiere_entrega === true,
            entrega_tipos_csv: (l.entrega_tipos || ['pdf', 'docx', 'zip', 'png', 'jpg']).join(', '),
            entrega_max_mb: l.entrega_max_mb || 10,
            eval_puntaje_minimo: l.eval_puntaje_minimo ?? 70,
            eval_max_intentos: l.eval_max_intentos ?? 3,
            preguntas: [],
          })),
      }))

    editingCurso.value = {
      id: c.id,
      slug: c.slug || '',
      titulo: c.titulo || '',
      descripcion: c.descripcion || '',
      nivel: c.nivel || 'Fundamental',
      idioma: 'Espa\u00f1ol',
      imagen: c.imagen_portada || '',
      publicado: !!c.publicado,
      modulos: modulos.length
        ? modulos
        : [
            {
              id: 'm-1',
              titulo: '',
              descripcion: '',
              imagen_portada: '',
              requiere_previo: false,
              lecciones: [
                {
                  id: 'l-1',
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
                },
              ],
            },
          ],
    }
    // Cargar preguntas de las lecciones tipo examen ya guardadas.
    for (const m of editingCurso.value.modulos) {
      for (const lec of m.lecciones) {
        if (lec.fuente === 'examen' && isUuid(lec.id)) {
          try {
            lec.preguntas = await cargarPreguntasAdmin(lec.id)
          } catch (e) {
            console.warn('cargar preguntas:', e)
          }
        }
      }
    }
  } catch (err) {
    console.error('Error cargando curso para editar:', err)
    publishStatus.value = {
      type: 'error',
      text: 'Error al cargar el curso: ' + (err?.message || 'desconocido'),
    }
  }
}

watch(
  () => props.initialCurso,
  (curso) => {
    editorStep.value = 0
    publishStatus.value = null
    if (curso) {
      loadCurso(curso)
    } else {
      editingCurso.value = createBlankCurso()
    }
  },
  { immediate: true }
)

// Watchers for auto-slug
watch(
  () => editingCurso.value?.titulo,
  (val) => {
    if (editingCurso.value && val) {
      editingCurso.value.slug = autoSlug(val)
    }
  }
)

/* ──────────────────────────────
   Portada handlers
   ────────────────────────────── */
async function onPortadaFile(e) {
  const file = e.target?.files?.[0]
  if (!file) return
  portadaError.value = ''
  portadaUploading.value = true
  portadaProgress.value = 0
  try {
    const { publicUrl } = await uploadPortada(file, (p) => {
      portadaProgress.value = p
    })
    if (editingCurso.value) editingCurso.value.imagen = publicUrl
  } catch (err) {
    portadaError.value = String(err?.message || err)
  } finally {
    portadaUploading.value = false
    if (portadaInputRef.value) portadaInputRef.value.value = ''
  }
}

async function onPortadaRemove() {
  if (!editingCurso.value?.imagen) return
  if (!confirm('\u00bfQuitar la imagen de portada?')) return
  const previous = editingCurso.value.imagen
  editingCurso.value.imagen = ''
  deletePortada(previous).catch(() => {})
}

async function onModuloPortadaFile(mod, e) {
  const file = e.target?.files?.[0]
  if (!file) return
  mod._portadaError = ''
  mod._portadaUploading = true
  mod._portadaProgress = 0
  try {
    const { publicUrl } = await uploadPortada(file, (p) => {
      mod._portadaProgress = p
    })
    mod.imagen_portada = publicUrl
  } catch (err) {
    mod._portadaError = String(err?.message || err)
  } finally {
    mod._portadaUploading = false
    if (e.target) e.target.value = ''
  }
}

async function onModuloPortadaRemove(mod) {
  if (!mod?.imagen_portada) return
  if (!confirm('\u00bfQuitar la portada del m\u00f3dulo?')) return
  const previous = mod.imagen_portada
  mod.imagen_portada = ''
  deletePortada(previous).catch(() => {})
}

/* ──────────────────────────────
   Module / lesson management
   ────────────────────────────── */
function addModule() {
  const c = editingCurso.value
  const idx = c.modulos.length + 1
  c.modulos.push({
    id: `m-${idx}`,
    titulo: '',
    descripcion: '',
    imagen_portada: '',
    requiere_previo: true,
    lecciones: [
      {
        id: `l-${idx}-1`,
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
      },
    ],
  })
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
  mod.lecciones.push({
    id: `l-${mi}-${idx}`,
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
  })
}

function removeLesson(mi, li) {
  editingCurso.value.modulos[mi].lecciones.splice(li, 1)
}

/* ──────────────────────────────
   Validation & summary
   ────────────────────────────── */
const nivelOptions = ['Fundamental', 'Intermedio', 'Avanzado']
const idiomaOptions = ['Espa\u00f1ol', 'Ingl\u00e9s', 'Franc\u00e9s']
const tipoOptions = ['video', 'lectura', 'evaluaci\u00f3n', 'actividad']

const validationChecks = computed(() => {
  if (!editingCurso.value) return []
  const c = editingCurso.value
  const allLessons = c.modulos.flatMap((m) => m.lecciones)
  return [
    { label: 'Tiene t\u00edtulo', pass: (c.titulo || '').trim().length > 0 },
    {
      label: 'Descripci\u00f3n \u2265 10 caracteres',
      pass: (c.descripcion || '').trim().length >= 10,
    },
    { label: '\u2265 1 m\u00f3dulo', pass: c.modulos.length >= 1 },
    { label: '\u2265 1 lecci\u00f3n', pass: allLessons.length >= 1 },
    {
      label: 'Todas las lecciones tienen contenido',
      pass:
        allLessons.length > 0 &&
        allLessons.every(
          (l) =>
            (l.fuente === 'youtube' && (l.youtube_url || '').trim().length > 0) ||
            (l.fuente === 'hls' && !!l.video_id) ||
            (l.fuente === 'documento' && !!l.documento_path) ||
            (l.fuente === 'examen' && (l.preguntas?.length || 0) > 0)
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
    { label: 'T\u00edtulo', value: c.titulo || '\u2014' },
    { label: 'Slug', value: c.slug || '\u2014' },
    { label: 'Nivel', value: c.nivel },
    { label: 'Idioma', value: c.idioma },
    { label: 'M\u00f3dulos', value: String(c.modulos.length) },
    { label: 'Lecciones', value: String(totalLessons) },
    { label: 'Publicado', value: c.publicado ? 'S\u00ed' : 'No' },
  ]
})

/* ──────────────────────────────
   Publish
   ────────────────────────────── */
async function publishCurso() {
  publishStatus.value = null

  if (!allValid.value) {
    const missing = validationChecks.value.filter((v) => !v.pass).map((v) => v.label)
    publishStatus.value = {
      type: 'error',
      text: 'Faltan datos: ' + missing.join(', '),
    }
    return
  }

  if (!props.session) {
    publishStatus.value = {
      type: 'error',
      text: 'Necesitas iniciar sesi\u00f3n como administrador para publicar.',
    }
    return
  }

  const c = editingCurso.value
  publishing.value = true
  try {
    const accessToken = props.session.access_token
    if (!accessToken) throw new Error('No hay access_token en la sesi\u00f3n.')
    const isExisting = isUuid(c.id)

    const cursoPayload = {
      slug: c.slug,
      titulo: c.titulo,
      descripcion: c.descripcion,
      nivel: c.nivel,
      imagen_portada: c.imagen || null,
      publicado: c.publicado,
    }

    let cursoData
    if (isExisting) {
      cursoData = await rawPatch('cursos', `id=eq.${c.id}`, cursoPayload, accessToken)
      if (!cursoData?.id) throw new Error('Update curso devolvi\u00f3 vac\u00edo (posible RLS).')
    } else {
      cursoData = await rawInsert('cursos', cursoPayload, accessToken)
      if (!cursoData?.id) throw new Error('Insert curso devolvi\u00f3 vac\u00edo (posible RLS).')
    }
    const cursoId = cursoData.id

    const existingByModule = new Map()
    const existingModuleIds = new Set()
    if (isExisting) {
      const { data: existing } = await rawSelect(
        `modulos?curso_id=eq.${cursoId}&select=id,lecciones(id)`,
        accessToken
      )
      for (const m of existing || []) {
        existingModuleIds.add(m.id)
        const lset = new Set()
        for (const l of m.lecciones || []) lset.add(l.id)
        existingByModule.set(m.id, lset)
      }
    }

    const keptModuleIds = new Set()
    const keptLessonsByModule = new Map()

    for (let mi = 0; mi < c.modulos.length; mi++) {
      const mod = c.modulos[mi]
      const modPayload = {
        curso_id: cursoId,
        orden: mi + 1,
        titulo: mod.titulo,
        descripcion: mod.descripcion,
        imagen_portada: mod.imagen_portada || null,
        requiere_previo: mod.requiere_previo,
      }

      let moduloId
      if (isUuid(mod.id) && existingModuleIds.has(mod.id)) {
        await rawPatch('modulos', `id=eq.${mod.id}`, modPayload, accessToken)
        moduloId = mod.id
      } else {
        const modData = await rawInsert('modulos', modPayload, accessToken)
        if (!modData?.id) throw new Error(`Insert modulo ${mi + 1} devolvi\u00f3 vac\u00edo.`)
        moduloId = modData.id
        mod.id = moduloId
      }
      keptModuleIds.add(moduloId)

      const existingLessonsHere = existingByModule.get(mod.id) || new Set()
      const keptLessons = []
      const newLessons = []
      const keptLessonIds = new Set()
      for (let li = 0; li < mod.lecciones.length; li++) {
        const lec = mod.lecciones[li]
        if (isUuid(lec.id) && existingLessonsHere.has(lec.id)) {
          keptLessons.push({ lec, li })
          keptLessonIds.add(lec.id)
        } else {
          newLessons.push({ lec, li })
        }
      }
      keptLessonsByModule.set(moduloId, keptLessonIds)

      for (const { lec, li } of keptLessons) {
        const payload = {
          modulo_id: moduloId,
          orden: -(li + 1),
          titulo: lec.titulo,
          tipo_material:
            lec.fuente === 'examen'
              ? 'examen'
              : lec.fuente === 'documento'
                ? 'lectura'
                : lec.tipo || 'video',
          url_youtube: lec.fuente === 'youtube' ? lec.youtube_url || null : null,
          video_id: lec.fuente === 'hls' ? lec.video_id || null : null,
          documento_path: lec.fuente === 'documento' ? lec.documento_path || null : null,
          documento_tipo: lec.fuente === 'documento' ? lec.documento_tipo || null : null,
          duracion_seg: parseDuracionToSeg(lec.duracion),
          eval_puntaje_minimo: lec.fuente === 'examen' ? Number(lec.eval_puntaje_minimo) || 70 : 70,
          eval_max_intentos: lec.fuente === 'examen' ? Number(lec.eval_max_intentos) || 3 : 3,
          ...entregaPayload(lec),
        }
        await rawPatch('lecciones', `id=eq.${lec.id}`, payload, accessToken)
        if (lec.fuente === 'hls' && lec.video_id) {
          await rawPatch('videos', `id=eq.${lec.video_id}`, { leccion_id: lec.id }, accessToken)
        }
      }

      for (const { lec, li } of newLessons) {
        const payload = {
          modulo_id: moduloId,
          orden: li + 1,
          titulo: lec.titulo,
          tipo_material:
            lec.fuente === 'examen'
              ? 'examen'
              : lec.fuente === 'documento'
                ? 'lectura'
                : lec.tipo || 'video',
          url_youtube: lec.fuente === 'youtube' ? lec.youtube_url || null : null,
          video_id: lec.fuente === 'hls' ? lec.video_id || null : null,
          documento_path: lec.fuente === 'documento' ? lec.documento_path || null : null,
          documento_tipo: lec.fuente === 'documento' ? lec.documento_tipo || null : null,
          duracion_seg: parseDuracionToSeg(lec.duracion),
          eval_puntaje_minimo: lec.fuente === 'examen' ? Number(lec.eval_puntaje_minimo) || 70 : 70,
          eval_max_intentos: lec.fuente === 'examen' ? Number(lec.eval_max_intentos) || 3 : 3,
          ...entregaPayload(lec),
        }
        const newLec = await rawInsert('lecciones', payload, accessToken)
        if (newLec?.id) {
          lec.id = newLec.id
          if (lec.fuente === 'hls' && lec.video_id) {
            await rawPatch(
              'videos',
              `id=eq.${lec.video_id}`,
              { leccion_id: newLec.id },
              accessToken
            )
          }
        }
      }

      for (const { lec, li } of keptLessons) {
        await rawPatch('lecciones', `id=eq.${lec.id}`, { orden: li + 1 }, accessToken)
      }
    }

    for (const mod of c.modulos) {
      for (const lec of mod.lecciones) {
        if (lec.fuente === 'examen' && isUuid(lec.id)) {
          await guardarEvaluacionAdmin(lec.id, lec.preguntas || [])
        }
      }
    }

    for (const moduloId of existingModuleIds) {
      if (!keptModuleIds.has(moduloId)) {
        await rawDelete(`modulos?id=eq.${moduloId}`, accessToken)
      }
    }
    for (const [moduloId, keptLessonIds] of keptLessonsByModule) {
      const existingLessons = existingByModule.get(moduloId) || new Set()
      for (const leccionId of existingLessons) {
        if (!keptLessonIds.has(leccionId)) {
          await rawDelete(`lecciones?id=eq.${leccionId}`, accessToken)
        }
      }
    }

    publishStatus.value = {
      type: 'success',
      text: isExisting ? 'Curso actualizado exitosamente.' : 'Curso publicado exitosamente.',
    }
    emit('published', cursoId)
  } catch (err) {
    console.error('Error publishing curso:', err, err?.raw)
    publishStatus.value = {
      type: 'error',
      text: err?.message || 'Error desconocido al publicar.',
    }
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div v-if="editingCurso" class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Editor de curso</p>
        <h1 class="display" :style="{ fontSize: '28px', color: 'var(--ink)', marginTop: '4px' }">
          {{ editingCurso.titulo || 'Nuevo curso' }}
        </h1>
      </div>
      <button class="btn btn-ghost btn-sm" @click="$emit('cancel')">
        <IconSet name="close" />
        Cerrar
      </button>
    </div>

    <!-- Step indicator -->
    <div class="editor-steps">
      <button
        v-for="(label, i) in ['B\u00e1sico', 'Estructura', 'Revisar']"
        :key="i"
        class="editor-step-btn"
        :class="{ active: editorStep === i, completed: editorStep > i }"
        @click="editorStep = i"
      >
        <span class="editor-step-num">{{ i + 1 }}</span>
        {{ label }}
      </button>
    </div>

    <!-- Step 1: Basico -->
    <div v-if="editorStep === 0" class="editor-panel fade-in">
      <div class="editor-fields">
        <div class="field">
          <label>T&iacute;tulo del curso</label>
          <input
            v-model="editingCurso.titulo"
            type="text"
            placeholder="Ej. Transparencia y Rendici\u00f3n de Cuentas"
          />
        </div>
        <div class="field">
          <label>Slug (auto)</label>
          <input
            v-model="editingCurso.slug"
            type="text"
            :style="{ color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: '14px' }"
            readonly
          />
        </div>
        <div class="field">
          <label>Descripci&oacute;n</label>
          <textarea
            v-model="editingCurso.descripcion"
            rows="4"
            placeholder="Describe el contenido y objetivos del curso..."
            :style="{ resize: 'vertical' }"
          />
        </div>
        <div
          :style="{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'calc(var(--unit) * 3)',
          }"
        >
          <div class="field">
            <label>Nivel</label>
            <select v-model="editingCurso.nivel">
              <option v-for="n in nivelOptions" :key="n" :value="n">
                {{ n }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Idioma</label>
            <select v-model="editingCurso.idioma">
              <option v-for="i in idiomaOptions" :key="i" :value="i">
                {{ i }}
              </option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Imagen de portada</label>
          <div class="portada-upload">
            <div
              class="portada-preview"
              :class="{
                'is-empty': !editingCurso.imagen,
                'is-uploading': portadaUploading,
              }"
              :style="
                editingCurso.imagen ? { backgroundImage: `url(${editingCurso.imagen})` } : null
              "
            >
              <span v-if="!editingCurso.imagen && !portadaUploading" class="portada-preview-empty">
                Sin portada
              </span>
              <div v-if="portadaUploading" class="portada-progress">
                <div
                  class="portada-progress-bar"
                  :style="{ width: Math.round(portadaProgress * 100) + '%' }"
                />
                <span>{{ Math.round(portadaProgress * 100) }}%</span>
              </div>
            </div>
            <div class="portada-actions">
              <label class="portada-btn">
                <input
                  ref="portadaInputRef"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  :disabled="portadaUploading"
                  @change="onPortadaFile"
                />
                <span>{{ editingCurso.imagen ? 'Reemplazar' : 'Subir imagen' }}</span>
              </label>
              <button
                v-if="editingCurso.imagen"
                type="button"
                class="portada-btn portada-btn-danger"
                :disabled="portadaUploading"
                @click="onPortadaRemove"
              >
                Quitar
              </button>
            </div>
            <p v-if="portadaError" class="portada-err">
              {{ portadaError }}
            </p>
            <p class="portada-hint">PNG, JPEG o WebP · máx 10 MB · recomendado 1600×900.</p>
          </div>
        </div>
        <label class="editor-checkbox">
          <input v-model="editingCurso.publicado" type="checkbox" />
          <span>Publicar curso inmediatamente</span>
        </label>
      </div>

      <div class="editor-nav">
        <div />
        <button class="btn btn-primary btn-sm" @click="editorStep = 1">
          Siguiente: Estructura
          <IconSet name="arrow" />
        </button>
      </div>
    </div>

    <!-- Step 2: Estructura -->
    <div v-else-if="editorStep === 1" class="editor-panel fade-in">
      <div class="editor-structure-layout">
        <div class="editor-modules">
          <div v-for="(mod, mi) in editingCurso.modulos" :key="mod.id" class="editor-module card">
            <div class="editor-module-header">
              <span class="mono" :style="{ color: 'var(--ink-4)' }">
                M&oacute;dulo {{ mi + 1 }}
              </span>
              <div :style="{ display: 'flex', gap: '4px' }">
                <button
                  class="editor-icon-btn"
                  :disabled="mi === 0"
                  title="Mover arriba"
                  @click="moveModule(mi, -1)"
                >
                  &uarr;
                </button>
                <button
                  class="editor-icon-btn"
                  :disabled="mi === editingCurso.modulos.length - 1"
                  title="Mover abajo"
                  @click="moveModule(mi, 1)"
                >
                  &darr;
                </button>
                <button
                  class="editor-icon-btn editor-icon-btn-danger"
                  :disabled="editingCurso.modulos.length <= 1"
                  title="Eliminar m\u00f3dulo"
                  @click="removeModule(mi)"
                >
                  &times;
                </button>
              </div>
            </div>

            <div class="editor-module-body">
              <div class="field">
                <label>T&iacute;tulo del m&oacute;dulo</label>
                <input
                  v-model="mod.titulo"
                  type="text"
                  placeholder="Ej. Fundamentos de la transparencia"
                />
              </div>
              <div class="field">
                <label>Descripci&oacute;n</label>
                <textarea
                  v-model="mod.descripcion"
                  rows="2"
                  placeholder="Breve descripci\u00f3n del m\u00f3dulo..."
                  :style="{ resize: 'vertical' }"
                />
              </div>
              <label class="editor-checkbox">
                <input v-model="mod.requiere_previo" type="checkbox" />
                <span>Requiere completar m&oacute;dulo previo</span>
              </label>

              <div class="field">
                <label>Portada del m&oacute;dulo</label>
                <div class="portada-upload">
                  <div
                    class="portada-preview"
                    :class="{
                      'is-empty': !mod.imagen_portada,
                      'is-uploading': mod._portadaUploading,
                    }"
                    :style="
                      mod.imagen_portada ? { backgroundImage: `url(${mod.imagen_portada})` } : null
                    "
                  >
                    <span
                      v-if="!mod.imagen_portada && !mod._portadaUploading"
                      class="portada-preview-empty"
                    >
                      Sin portada
                    </span>
                    <div v-if="mod._portadaUploading" class="portada-progress">
                      <div
                        class="portada-progress-bar"
                        :style="{
                          width: Math.round((mod._portadaProgress || 0) * 100) + '%',
                        }"
                      />
                      <span>{{ Math.round((mod._portadaProgress || 0) * 100) }}%</span>
                    </div>
                  </div>
                  <div class="portada-actions">
                    <label class="portada-btn">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        :disabled="mod._portadaUploading"
                        @change="onModuloPortadaFile(mod, $event)"
                      />
                      <span>{{ mod.imagen_portada ? 'Reemplazar' : 'Subir imagen' }}</span>
                    </label>
                    <button
                      v-if="mod.imagen_portada"
                      type="button"
                      class="portada-btn portada-btn-danger"
                      :disabled="mod._portadaUploading"
                      @click="onModuloPortadaRemove(mod)"
                    >
                      Quitar
                    </button>
                  </div>
                  <p v-if="mod._portadaError" class="portada-err">
                    {{ mod._portadaError }}
                  </p>
                  <p class="portada-hint">PNG, JPEG o WebP · máx 10 MB · recomendado 1600×900.</p>
                </div>
              </div>

              <!-- Lecciones -->
              <div class="editor-lessons">
                <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 1)' }">
                  Lecciones ({{ mod.lecciones.length }})
                </p>
                <div v-for="(lec, li) in mod.lecciones" :key="lec.id" class="editor-lesson-row">
                  <span class="mono" :style="{ color: 'var(--ink-4)', minWidth: '28px' }">
                    {{ String(li + 1).padStart(2, '0') }}
                  </span>
                  <input
                    v-model="lec.titulo"
                    type="text"
                    placeholder="T\u00edtulo de la lecci\u00f3n"
                    class="editor-lesson-input"
                  />
                  <select v-model="lec.tipo" class="editor-lesson-select">
                    <option v-for="t in tipoOptions" :key="t" :value="t">
                      {{ t }}
                    </option>
                  </select>
                  <div class="leccion-fuente">
                    <label class="leccion-fuente-opt">
                      <input v-model="lec.fuente" type="radio" :value="'youtube'" /> YouTube
                    </label>
                    <label class="leccion-fuente-opt">
                      <input v-model="lec.fuente" type="radio" :value="'hls'" /> HLS
                    </label>
                    <label class="leccion-fuente-opt">
                      <input v-model="lec.fuente" type="radio" :value="'documento'" />
                      Documento
                    </label>
                    <label class="leccion-fuente-opt">
                      <input v-model="lec.fuente" type="radio" :value="'ninguno'" /> Sin contenido
                    </label>
                    <label v-if="featureEnabled('evaluaciones')" class="leccion-fuente-opt">
                      <input v-model="lec.fuente" type="radio" :value="'examen'" /> Examen
                    </label>
                  </div>

                  <input
                    v-if="lec.fuente === 'youtube'"
                    v-model="lec.youtube_url"
                    type="url"
                    placeholder="URL de YouTube"
                    class="editor-lesson-input"
                    :style="{ flex: '1.5' }"
                  />

                  <VideoUploadField
                    v-else-if="lec.fuente === 'hls'"
                    :leccion-id="lec.id"
                    :video-id="lec.video_id || null"
                    @video-id-updated="(id) => (lec.video_id = id)"
                  />
                  <DocumentoUploadField
                    v-else-if="lec.fuente === 'documento'"
                    :leccion-id="lec.id"
                    :documento-path="lec.documento_path || null"
                    :documento-tipo="lec.documento_tipo || null"
                    @documento-updated="
                      (data) => {
                        lec.documento_path = data?.path || null
                        lec.documento_tipo = data?.tipo || null
                      }
                    "
                  />
                  <input
                    v-model="lec.duracion"
                    type="text"
                    placeholder="mm:ss"
                    class="editor-lesson-input"
                    :style="{ maxWidth: '80px' }"
                  />
                  <button
                    class="editor-icon-btn editor-icon-btn-danger"
                    :disabled="mod.lecciones.length <= 1"
                    @click="removeLesson(mi, li)"
                  >
                    &times;
                  </button>

                  <!-- Entrega de archivo -->
                  <div
                    v-if="featureEnabled('entregas')"
                    :style="{
                      flexBasis: '100%',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }"
                  >
                    <label class="leccion-fuente-opt">
                      <input v-model="lec.requiere_entrega" type="checkbox" />
                      Requiere entrega de archivo
                    </label>
                    <template v-if="lec.requiere_entrega">
                      <input
                        v-model="lec.entrega_tipos_csv"
                        type="text"
                        placeholder="pdf, docx, zip, png, jpg"
                        title="Extensiones permitidas, separadas por coma"
                        class="editor-lesson-input"
                        :style="{ maxWidth: '220px' }"
                      />
                      <input
                        v-model.number="lec.entrega_max_mb"
                        type="number"
                        min="1"
                        max="50"
                        title="Tamaño máximo en MB"
                        class="editor-lesson-input"
                        :style="{ maxWidth: '70px' }"
                      />
                      <span class="mono" :style="{ fontSize: '10px', color: 'var(--ink-4)' }"
                        >MB m&aacute;x</span
                      >
                    </template>
                  </div>

                  <!-- Evaluaci&oacute;n -->
                  <div
                    v-if="featureEnabled('evaluaciones') && lec.fuente === 'examen'"
                    :style="{
                      flexBasis: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }"
                  >
                    <div
                      :style="{
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }"
                    >
                      <label class="leccion-fuente-opt">
                        Puntaje mínimo (%)
                        <input
                          v-model.number="lec.eval_puntaje_minimo"
                          type="number"
                          min="0"
                          max="100"
                          class="editor-lesson-input"
                          :style="{ maxWidth: '80px' }"
                        />
                      </label>
                      <label class="leccion-fuente-opt">
                        Máx. intentos
                        <input
                          v-model.number="lec.eval_max_intentos"
                          type="number"
                          min="1"
                          class="editor-lesson-input"
                          :style="{ maxWidth: '70px' }"
                        />
                      </label>
                    </div>
                    <EvaluacionEditor :preguntas="lec.preguntas" />
                  </div>
                </div>
                <button
                  class="btn btn-ghost btn-sm"
                  :style="{ marginTop: 'calc(var(--unit) * 1)' }"
                  @click="addLesson(mi)"
                >
                  + Agregar lecci&oacute;n
                </button>
              </div>
            </div>
          </div>

          <button class="btn btn-ghost" :style="{ alignSelf: 'flex-start' }" @click="addModule">
            + Agregar m&oacute;dulo
          </button>
        </div>

        <!-- Sidebar guide -->
        <div class="editor-guide card">
          <div :style="{ padding: 'calc(var(--unit) * 2.5)' }">
            <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
              Gu&iacute;a de estructura
            </p>
            <ul class="editor-guide-list">
              <li>Cada m&oacute;dulo agrupa lecciones por tema.</li>
              <li>Ordena los m&oacute;dulos de lo general a lo espec&iacute;fico.</li>
              <li>Incluye al menos una lecci&oacute;n por m&oacute;dulo.</li>
              <li>Usa URLs de YouTube para contenido de video.</li>
              <li>La duraci&oacute;n se ingresa en formato mm:ss.</li>
              <li>Marca "requiere previo" para secuenciar m&oacute;dulos.</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="editor-nav">
        <button class="btn btn-ghost btn-sm" @click="editorStep = 0">
          <IconSet name="arrowLeft" />
          B&aacute;sico
        </button>
        <button class="btn btn-primary btn-sm" @click="editorStep = 2">
          Siguiente: Revisar
          <IconSet name="arrow" />
        </button>
      </div>
    </div>

    <!-- Step 3: Revisar -->
    <div v-else-if="editorStep === 2" class="editor-panel fade-in">
      <div class="editor-review-layout">
        <!-- Preview card -->
        <div>
          <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
            Vista previa de tarjeta
          </p>
          <div class="card" :style="{ maxWidth: '380px' }">
            <img
              v-if="isUrl(editingCurso.imagen)"
              :src="editingCurso.imagen"
              :alt="editingCurso.titulo || 'Portada del curso'"
              :style="{
                aspectRatio: '4/3',
                width: '100%',
                objectFit: 'cover',
                display: 'block',
              }"
            />
            <PlaceholderImage
              v-else
              :label="editingCurso.imagen || editingCurso.titulo || 'Sin imagen'"
              :style="{ aspectRatio: '4/3', width: '100%' }"
            />
            <div
              :style="{
                padding: 'calc(var(--unit) * 2.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'calc(var(--unit) * 1.5)',
              }"
            >
              <div
                :style="{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }"
              >
                <span class="mono" :style="{ color: 'var(--ink-4)' }">
                  {{ editingCurso.nivel }}
                </span>
                <span class="chip chip-accent">
                  <span class="chip-dot" />
                  Nuevo
                </span>
              </div>
              <h3
                class="display"
                :style="{ fontSize: '22px', lineHeight: '1.1', color: 'var(--ink)' }"
              >
                {{ editingCurso.titulo || 'Sin t\u00edtulo' }}
              </h3>
              <p :style="{ fontSize: '13px', lineHeight: '1.5', color: 'var(--ink-3)' }">
                {{ editingCurso.descripcion || 'Sin descripci\u00f3n' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Summary + validation -->
        <div>
          <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">Resumen</p>
          <div class="card" :style="{ marginBottom: 'calc(var(--unit) * 3)' }">
            <table class="admin-table">
              <tbody>
                <tr v-for="row in editorSummary" :key="row.label">
                  <td class="mono" :style="{ color: 'var(--ink-3)', width: '120px' }">
                    {{ row.label }}
                  </td>
                  <td>{{ row.value }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
            Validaci&oacute;n
          </p>
          <div class="editor-validation">
            <div
              v-for="check in validationChecks"
              :key="check.label"
              class="editor-validation-item"
            >
              <span
                :style="{
                  color: check.pass ? 'var(--success)' : 'var(--danger)',
                  display: 'inline-flex',
                }"
              >
                <IconSet :name="check.pass ? 'check' : 'close'" />
              </span>
              <span
                :style="{
                  fontSize: '14px',
                  color: check.pass ? 'var(--ink-2)' : 'var(--danger)',
                }"
              >
                {{ check.label }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="publishStatus"
        class="publish-status"
        :class="`publish-status-${publishStatus.type}`"
      >
        {{ publishStatus.text }}
      </div>

      <div class="editor-nav">
        <button class="btn btn-ghost btn-sm" :disabled="publishing" @click="editorStep = 1">
          <IconSet name="arrowLeft" />
          Estructura
        </button>
        <button
          class="btn btn-primary btn-sm"
          :style="{ opacity: allValid && !publishing ? 1 : 0.6 }"
          :disabled="publishing"
          @click="publishCurso"
        >
          <template v-if="publishing"> Guardando&hellip; </template>
          <template v-else-if="isUuid(editingCurso?.id || '')"> Actualizar curso </template>
          <template v-else> Publicar curso </template>
          <IconSet v-if="!publishing" name="arrow" />
        </button>
      </div>
    </div>
  </div>
</template>
