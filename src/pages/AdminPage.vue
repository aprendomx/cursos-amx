<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { CURSOS, USER, DEPENDENCIAS } from '@/data.js'
import { supabase } from '@/lib/supabase.js'
import IconSet from '@/components/IconSet.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import PlaceholderImage from '@/components/PlaceholderImage.vue'
import AppLogo from '@/components/AppLogo.vue'
import VideoUploadField from '@/components/VideoUploadField.vue'
import DocumentoUploadField from '@/components/DocumentoUploadField.vue'
import EvaluacionEditor from '@/components/EvaluacionEditor.vue'
import { cargarPreguntasAdmin, guardarEvaluacionAdmin } from '@/services/evaluaciones.js'
import { uploadPortada, deletePortada } from '@/services/portadas.js'
import { getConstanciaConfig, updateConstanciaConfig } from '@/services/constanciaConfig.js'
import {
  fetchPerfilesInstructores,
  buscarPerfiles,
  setEsInstructor,
  fetchAsignacionesInstructor,
  asignarInstructorACurso,
  desasignarInstructorDeCurso,
} from '@/services/instructores.js'
import { listarUsuarios, setPassword } from '@/services/usuarios.js'
import { formatearDuracion } from '@/services/tiempo.js'
import { featureEnabled } from '@/lib/featureFlags.js'

const props = defineProps({
  session: { type: Object, default: null },
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (v) => UUID_RE.test(v || '')
const isUrl = (v) => typeof v === 'string' && /^(https?:|\/)/.test(v)

/* ──────────────────────────────
   Navigation
   ────────────────────────────── */
const activeSection = ref('resumen')
const editingCurso = ref(null) // null = list, object = editor

// Ocultar/mostrar el menú lateral para ganar ancho en la administración.
// El estado se recuerda entre recargas; localStorage puede no estar
// disponible (modo privado) → default visible.
const SIDEBAR_KEY = 'admin-sidebar-hidden'
const sidebarHidden = ref(
  (() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })()
)
watch(sidebarHidden, (v) => {
  try {
    localStorage.setItem(SIDEBAR_KEY, v ? '1' : '0')
  } catch {
    /* storage no disponible */
  }
})
function toggleSidebar() {
  sidebarHidden.value = !sidebarHidden.value
}

// Estado del upload de portada
const portadaInputRef = ref(null)
const portadaUploading = ref(false)
const portadaProgress = ref(0)
const portadaError = ref('')

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
  if (!confirm('¿Quitar la imagen de portada?')) return
  const previous = editingCurso.value.imagen
  editingCurso.value.imagen = ''
  // Best-effort delete del objeto en storage. No bloqueamos la UI si falla.
  deletePortada(previous).catch(() => {})
}

// Portada por módulo. El estado de subida vive en el propio objeto módulo
// (_portadaUploading/_portadaProgress/_portadaError) porque hay N módulos.
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
  if (!confirm('¿Quitar la portada del módulo?')) return
  const previous = mod.imagen_portada
  mod.imagen_portada = ''
  deletePortada(previous).catch(() => {})
}

// Configuración global de la constancia (titular_nombre, titular_cargo, lugar).
const constConfig = reactive({
  titular_nombre: '',
  titular_cargo: '',
  lugar: '',
})
const constConfigLoading = ref(false)
const constConfigSaving = ref(false)
const constConfigMsg = ref('')

async function loadConstConfig() {
  constConfigLoading.value = true
  try {
    const c = await getConstanciaConfig()
    constConfig.titular_nombre = c.titular_nombre || ''
    constConfig.titular_cargo = c.titular_cargo || ''
    constConfig.lugar = c.lugar || ''
  } finally {
    constConfigLoading.value = false
  }
}

async function saveConstConfig() {
  if (constConfigSaving.value) return
  constConfigSaving.value = true
  constConfigMsg.value = ''
  try {
    await updateConstanciaConfig({
      titular_nombre: constConfig.titular_nombre,
      titular_cargo: constConfig.titular_cargo,
      lugar: constConfig.lugar,
    })
    constConfigMsg.value = '✓ Guardado'
    setTimeout(() => {
      constConfigMsg.value = ''
    }, 3000)
  } catch (err) {
    constConfigMsg.value = '⚠ ' + (err?.message || String(err))
  } finally {
    constConfigSaving.value = false
  }
}

/* ──────────────────────────────
   Instructores (módulo LMS 1)
   ────────────────────────────── */
const instructores = ref([]) // perfiles con es_instructor = true
const instCursosCat = ref([]) // catálogo de cursos para asignar
const instBusqueda = ref('')
const instResultados = ref([])
const instSel = ref(null) // instructor seleccionado
const instAsignaciones = ref([]) // cursos del instructor seleccionado
const instCursoSel = ref('')
const instMsg = ref('')
const instLoading = ref(false)

async function loadInstructoresSection() {
  instLoading.value = true
  instMsg.value = ''
  try {
    instructores.value = await fetchPerfilesInstructores()
    const { data } = await supabase.from('cursos').select('id, titulo').order('titulo')
    instCursosCat.value = data || []
  } catch (e) {
    instMsg.value = '⚠ ' + (e?.message || String(e))
  } finally {
    instLoading.value = false
  }
}

let instBuscarTimer = null
watch(instBusqueda, (q) => {
  clearTimeout(instBuscarTimer)
  if (!q || q.length < 2) {
    instResultados.value = []
    return
  }
  instBuscarTimer = setTimeout(async () => {
    try {
      instResultados.value = await buscarPerfiles(q)
    } catch {
      instResultados.value = []
    }
  }, 250)
})

async function toggleEsInstructor(p, valor) {
  instMsg.value = ''
  try {
    await setEsInstructor(p.id, valor)
    instBusqueda.value = ''
    instResultados.value = []
    if (instSel.value?.id === p.id && !valor) {
      instSel.value = null
      instAsignaciones.value = []
    }
    await loadInstructoresSection()
  } catch (e) {
    instMsg.value = '⚠ ' + (e?.message || String(e))
  }
}

async function selInstructor(p) {
  instSel.value = p
  instCursoSel.value = ''
  try {
    instAsignaciones.value = await fetchAsignacionesInstructor(p.id)
  } catch (e) {
    instMsg.value = '⚠ ' + (e?.message || String(e))
  }
}

async function asignarCursoSel() {
  if (!instSel.value || !instCursoSel.value) return
  instMsg.value = ''
  try {
    await asignarInstructorACurso(instCursoSel.value, instSel.value.id)
    instAsignaciones.value = await fetchAsignacionesInstructor(instSel.value.id)
    instCursoSel.value = ''
  } catch (e) {
    instMsg.value = '⚠ ' + (e?.message || String(e))
  }
}

async function quitarCursoSel(cursoId) {
  if (!instSel.value) return
  instMsg.value = ''
  try {
    await desasignarInstructorDeCurso(cursoId, instSel.value.id)
    instAsignaciones.value = await fetchAsignacionesInstructor(instSel.value.id)
  } catch (e) {
    instMsg.value = '⚠ ' + (e?.message || String(e))
  }
}

watch(
  activeSection,
  (s) => {
    if (s === 'config') loadConstConfig()
    if (s === 'instructores') loadInstructoresSection()
    if (s === 'usuarios') cargarUsuarios()
  },
  { immediate: false }
)

const navItems = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'cursos', label: 'Cursos' },
  { key: 'nuevo', label: '+ Nuevo curso', primary: true },
  { key: 'usuarios', label: 'Usuarios' },
  ...(featureEnabled('instructor') ? [{ key: 'instructores', label: 'Instructores' }] : []),
  { key: 'constancias', label: 'Constancias' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'config', label: 'Configuración' },
]

function setSection(key) {
  if (key === 'nuevo') {
    activeSection.value = 'cursos'
    editingCurso.value = createBlankCurso()
    editorStep.value = 0
    return
  }
  editingCurso.value = null
  activeSection.value = key
}

async function editCurso(curso) {
  editorStep.value = 0
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

/* ──────────────────────────────
   Dashboard metrics (datos reales)
   ────────────────────────────── */
const metrics = ref([
  { label: 'Inscripciones', value: '\u2014', delta: '', up: true },
  { label: 'Lecciones vistas', value: '\u2014', delta: '', up: true },
  { label: 'Constancias', value: '\u2014', delta: '', up: true },
  { label: 'Tasa aprobaci\u00f3n', value: '\u2014', delta: '', up: true },
])

// Cursos list for admin
const adminCursos = ref([])

// Bar chart data (30 dias) y top courses / recent activity — se llenan al montar
const barData = ref(new Array(30).fill(0))
const topCourses = ref([])
const recentActivity = ref([])

/* ──────────────────────────────
   Usuarios (datos reales + reset de contraseña)
   ────────────────────────────── */
const usuarioSearch = ref('')
const usuarios = ref([])
const usuariosTotal = ref(0)
const usuariosPage = ref(0)
const usuariosPageSize = ref(25)
const usuariosLoading = ref(false)
const usuariosError = ref('')
let usuarioSearchTimer = null

async function cargarUsuarios() {
  usuariosLoading.value = true
  usuariosError.value = ''
  try {
    const { rows, total, pageSize } = await listarUsuarios({
      q: usuarioSearch.value,
      page: usuariosPage.value,
    })
    usuarios.value = rows
    usuariosTotal.value = total
    usuariosPageSize.value = pageSize
  } catch (e) {
    usuariosError.value = e?.message || 'Error al cargar usuarios.'
    usuarios.value = []
  } finally {
    usuariosLoading.value = false
  }
}

function onUsuarioSearch() {
  if (usuarioSearchTimer) clearTimeout(usuarioSearchTimer)
  usuarioSearchTimer = setTimeout(() => {
    usuariosPage.value = 0
    cargarUsuarios()
  }, 350)
}

const usuariosDesde = computed(() =>
  usuariosTotal.value === 0 ? 0 : usuariosPage.value * usuariosPageSize.value + 1
)
const usuariosHasta = computed(() =>
  Math.min((usuariosPage.value + 1) * usuariosPageSize.value, usuariosTotal.value)
)

function usuariosPrevPage() {
  if (usuariosPage.value > 0) {
    usuariosPage.value--
    cargarUsuarios()
  }
}
function usuariosNextPage() {
  if ((usuariosPage.value + 1) * usuariosPageSize.value < usuariosTotal.value) {
    usuariosPage.value++
    cargarUsuarios()
  }
}

function fechaAcceso(iso) {
  if (!iso) return 'Sin registro'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/* Modal de restablecer contraseña (el admin teclea la nueva). */
const pwModalOpen = ref(false)
const pwUser = ref(null)
const pwNew = ref('')
const pwConfirm = ref('')
const pwMsg = ref(null)
const pwLoading = ref(false)

function abrirReset(u) {
  pwUser.value = u
  pwNew.value = ''
  pwConfirm.value = ''
  pwMsg.value = null
  pwModalOpen.value = true
}
function cerrarReset() {
  if (pwLoading.value) return
  pwModalOpen.value = false
  pwUser.value = null
}
async function confirmarReset() {
  pwMsg.value = null
  if (pwNew.value.length < 8) {
    pwMsg.value = { type: 'error', text: 'La contraseña debe tener al menos 8 caracteres.' }
    return
  }
  if (pwNew.value !== pwConfirm.value) {
    pwMsg.value = { type: 'error', text: 'Las contraseñas no coinciden.' }
    return
  }
  pwLoading.value = true
  try {
    await setPassword(pwUser.value.id, pwNew.value)
    pwMsg.value = {
      type: 'ok',
      text: `Contraseña actualizada para ${pwUser.value.nombres_completos || pwUser.value.correo}.`,
    }
    pwNew.value = ''
    pwConfirm.value = ''
  } catch (e) {
    pwMsg.value = { type: 'error', text: e?.message || 'No se pudo restablecer la contraseña.' }
  } finally {
    pwLoading.value = false
  }
}

/* ──────────────────────────────
   Reportes
   ────────────────────────────── */
const reportTypes = [
  { key: 'inscripciones-dep', label: 'Inscripciones por dependencia' },
  { key: 'avance-periodo', label: 'Avance de cursos por periodo' },
  { key: 'constancias-mes', label: 'Constancias emitidas mensual' },
  { key: 'tasa-curso', label: 'Tasa de aprobaci\u00f3n por curso' },
  { key: 'horas-acumuladas', label: 'Horas de capacitaci\u00f3n acumuladas' },
  { key: 'usuarios-actividad', label: 'Usuarios activos vs inactivos' },
  { key: 'top-lecciones', label: 'Top lecciones m\u00e1s vistas' },
  { key: 'tiempo-curso', label: 'Tiempo activo por usuario/curso' },
]

const selectedReport = ref(null)
const reportLoading = ref(false)
const reportError = ref(null)
const reportRows = ref([])
const reportColumns = ref([])

async function runReport(report) {
  if (!props.session?.access_token) {
    reportError.value = 'Necesitas iniciar sesi\u00f3n.'
    return
  }
  selectedReport.value = report
  reportError.value = null
  reportLoading.value = true
  reportRows.value = []
  reportColumns.value = []
  const t = props.session.access_token
  try {
    let result = { columns: [], rows: [] }
    if (report.key === 'inscripciones-dep') result = await reportInscripcionesDep(t)
    else if (report.key === 'avance-periodo') result = await reportAvancePeriodo(t)
    else if (report.key === 'constancias-mes') result = await reportConstanciasMes(t)
    else if (report.key === 'tasa-curso') result = await reportTasaCurso(t)
    else if (report.key === 'horas-acumuladas') result = await reportHoras(t)
    else if (report.key === 'usuarios-actividad') result = await reportUsuariosActividad(t)
    else if (report.key === 'top-lecciones') result = await reportTopLecciones(t)
    else if (report.key === 'tiempo-curso') result = await reportTiempoCurso(t)
    reportColumns.value = result.columns
    reportRows.value = result.rows
  } catch (err) {
    console.error('Error en reporte', report.key, err)
    reportError.value = err?.message || 'Error al generar el reporte.'
  } finally {
    reportLoading.value = false
  }
}

async function reportInscripcionesDep(t) {
  const { data } = await rawSelect(
    'inscripciones?select=perfiles(dependencias(nombre,siglas))&limit=10000',
    t
  )
  const map = new Map()
  for (const r of data || []) {
    const dep = r.perfiles?.dependencias?.nombre || 'Sin dependencia'
    const sig = r.perfiles?.dependencias?.siglas || '\u2014'
    const cur = map.get(dep) || { dependencia: dep, siglas: sig, inscripciones: 0 }
    cur.inscripciones++
    map.set(dep, cur)
  }
  const rows = [...map.values()].sort((a, b) => b.inscripciones - a.inscripciones)
  return { columns: ['dependencia', 'siglas', 'inscripciones'], rows }
}

function buildLast12Months() {
  const out = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push(key)
  }
  return out
}

async function reportAvancePeriodo(t) {
  const months = buildLast12Months()
  const since = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1).toISOString()
  const { data } = await rawSelect(
    `inscripciones?select=inscrito_en&inscrito_en=gte.${since}&limit=10000`,
    t
  )
  const counts = Object.fromEntries(months.map((m) => [m, 0]))
  for (const r of data || []) {
    const k = (r.inscrito_en || '').slice(0, 7)
    if (k in counts) counts[k]++
  }
  const rows = months.map((m) => ({ mes: m, inscripciones: counts[m] }))
  return { columns: ['mes', 'inscripciones'], rows }
}

async function reportConstanciasMes(t) {
  const months = buildLast12Months()
  const since = new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1).toISOString()
  const { data } = await rawSelect(
    `constancias?select=emitida_en&emitida_en=gte.${since}&limit=10000`,
    t
  )
  const counts = Object.fromEntries(months.map((m) => [m, 0]))
  for (const r of data || []) {
    const k = (r.emitida_en || '').slice(0, 7)
    if (k in counts) counts[k]++
  }
  const rows = months.map((m) => ({ mes: m, constancias: counts[m] }))
  return { columns: ['mes', 'constancias'], rows }
}

async function reportTasaCurso(t) {
  const [{ data: insc }, { data: cons }, { data: cursos }] = await Promise.all([
    rawSelect('inscripciones?select=curso_id&limit=10000', t),
    rawSelect('constancias?select=curso_id&limit=10000', t),
    rawSelect('cursos?select=id,titulo,nivel&limit=1000', t),
  ])
  const inscBy = {},
    consBy = {}
  for (const r of insc || []) inscBy[r.curso_id] = (inscBy[r.curso_id] || 0) + 1
  for (const r of cons || []) consBy[r.curso_id] = (consBy[r.curso_id] || 0) + 1
  const rows = (cursos || [])
    .map((c) => {
      const i = inscBy[c.id] || 0
      const k = consBy[c.id] || 0
      return {
        curso: c.titulo,
        nivel: c.nivel || '\u2014',
        inscritos: i,
        constancias: k,
        tasa: i > 0 ? ((k / i) * 100).toFixed(1) + '%' : '\u2014',
      }
    })
    .sort((a, b) => b.inscritos - a.inscritos)
  return { columns: ['curso', 'nivel', 'inscritos', 'constancias', 'tasa'], rows }
}

async function reportHoras(t) {
  const { data } = await rawSelect(
    'progreso?select=segundos_vistos,perfiles(nombres_completos,dependencias(siglas))&limit=10000',
    t
  )
  const byUser = new Map()
  for (const r of data || []) {
    const nombre = r.perfiles?.nombres_completos || 'Usuario'
    const dep = r.perfiles?.dependencias?.siglas || '\u2014'
    const cur = byUser.get(nombre) || { usuario: nombre, dependencia: dep, segundos: 0 }
    cur.segundos += r.segundos_vistos || 0
    byUser.set(nombre, cur)
  }
  const rows = [...byUser.values()]
    .sort((a, b) => b.segundos - a.segundos)
    .map((r) => ({
      usuario: r.usuario,
      dependencia: r.dependencia,
      horas: (r.segundos / 3600).toFixed(2),
    }))
  return { columns: ['usuario', 'dependencia', 'horas'], rows }
}

async function reportUsuariosActividad(t) {
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString()
  const [{ data: users }, { data: prog }] = await Promise.all([
    rawSelect('perfiles?select=id&limit=10000', t),
    rawSelect(`progreso?select=user_id&completado_en=gte.${since}&limit=10000`, t),
  ])
  const active = new Set((prog || []).map((p) => p.user_id))
  const total = (users || []).length
  const activos = (users || []).filter((u) => active.has(u.id)).length
  return {
    columns: ['categoria', 'cantidad', 'porcentaje'],
    rows: [
      {
        categoria: 'Activos (\u00faltimos 30 d\u00edas)',
        cantidad: activos,
        porcentaje: total ? ((activos / total) * 100).toFixed(1) + '%' : '\u2014',
      },
      {
        categoria: 'Inactivos',
        cantidad: total - activos,
        porcentaje: total ? (((total - activos) / total) * 100).toFixed(1) + '%' : '\u2014',
      },
      { categoria: 'Total registrados', cantidad: total, porcentaje: '100%' },
    ],
  }
}

async function reportTopLecciones(t) {
  const { data } = await rawSelect(
    'progreso?select=leccion_id,lecciones(titulo,modulos(cursos(titulo)))&limit=10000',
    t
  )
  const map = new Map()
  for (const r of data || []) {
    const tit = r.lecciones?.titulo || 'Lecci\u00f3n'
    const cur = r.lecciones?.modulos?.cursos?.titulo || '\u2014'
    const key = `${cur}||${tit}`
    const e = map.get(key) || { leccion: tit, curso: cur, vistas: 0 }
    e.vistas++
    map.set(key, e)
  }
  const rows = [...map.values()].sort((a, b) => b.vistas - a.vistas).slice(0, 15)
  return { columns: ['leccion', 'curso', 'vistas'], rows }
}

async function reportTiempoCurso(t) {
  const { data } = await rawSelect(
    'tiempo_curso?select=segundos_activos,perfiles(nombres_completos,dependencias(siglas)),cursos(titulo)&order=segundos_activos.desc&limit=10000',
    t
  )
  const rows = (data || []).map((r) => ({
    usuario: r.perfiles?.nombres_completos || 'Usuario',
    dependencia: r.perfiles?.dependencias?.siglas || '—',
    curso: r.cursos?.titulo || '—',
    tiempo: formatearDuracion(r.segundos_activos),
    horas: ((r.segundos_activos || 0) / 3600).toFixed(2),
  }))
  return { columns: ['usuario', 'dependencia', 'curso', 'tiempo', 'horas'], rows }
}

async function deleteCurso(curso) {
  if (!props.session?.access_token) return
  if ((curso.inscritos || 0) > 0) {
    alert(`No se puede borrar: este curso tiene ${curso.inscritos} inscrito(s).`)
    return
  }
  if (
    !confirm(
      `\u00bfBorrar el curso "${curso.titulo}"?\n\nEsto elimina tambi\u00e9n sus m\u00f3dulos y lecciones. La acci\u00f3n no se puede deshacer.`
    )
  ) {
    return
  }
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/cursos?id=eq.${curso.id}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${props.session.access_token}`,
      },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(explainPgError('cursos', res.status, text))
    }
    adminCursos.value = adminCursos.value.filter((c) => c.id !== curso.id)
  } catch (err) {
    console.error('Error deleting curso:', err)
    alert('Error al borrar: ' + (err?.message || 'desconocido'))
  }
}

function exportReportCsv() {
  if (!reportRows.value.length) return
  const cols = reportColumns.value
  const escape = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [
    cols.join(','),
    ...reportRows.value.map((r) => cols.map((c) => escape(r[c])).join(',')),
  ]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${selectedReport.value?.key || 'reporte'}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ──────────────────────────────
   Course Editor (3-step wizard)
   ────────────────────────────── */
const editorStep = ref(0)

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

function autoSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Watchers for auto-slug
watch(
  () => editingCurso.value?.titulo,
  (val) => {
    if (editingCurso.value && val) {
      editingCurso.value.slug = autoSlug(val)
    }
  }
)

// Module/lesson management
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

// "pdf, DOCX zip" → ['pdf','docx','zip']; vacío → defaults de la migración
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

function removeLesson(mi, li) {
  editingCurso.value.modulos[mi].lecciones.splice(li, 1)
}

// Validation for step 3
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

// Publish status (inline feedback)
const publishing = ref(false)
const publishStatus = ref(null) // { type: 'error'|'info'|'success', text: string }

// Summary for step 3
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

const nivelOptions = ['Fundamental', 'Intermedio', 'Avanzado']
const idiomaOptions = ['Espa\u00f1ol', 'Ingl\u00e9s', 'Franc\u00e9s']
const tipoOptions = ['video', 'lectura', 'evaluaci\u00f3n', 'actividad']

/* ──────────────────────────────
   Supabase data loading (fetch directo)
   ────────────────────────────── */
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

function relativeTime(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Hace unos segundos'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  if (diff < 86400 * 30) return `Hace ${Math.floor(diff / 86400)} d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

async function loadDashboard() {
  if (!props.session?.access_token) return
  const accessToken = props.session.access_token
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const since30 = new Date(Date.now() - 30 * 86400 * 1000).toISOString()

  // Pre-fetch: inscripciones por curso (para inscritos reales)
  let inscByCurso = {}
  try {
    const { data: allInsc } = await rawSelect(
      'inscripciones?select=curso_id&limit=10000',
      accessToken
    )
    for (const r of allInsc || []) {
      inscByCurso[r.curso_id] = (inscByCurso[r.curso_id] || 0) + 1
    }
  } catch (err) {
    console.error('Error fetching inscripciones counts:', err)
  }

  // 1) Cursos del cat\u00e1logo (con conteos reales)
  try {
    const { data: cursos } = await rawSelect(
      'cursos?select=*,modulos(id,lecciones(id))&order=creado_en.desc',
      accessToken
    )
    adminCursos.value = (cursos || []).map((c) => ({
      ...c,
      inscritos: inscByCurso[c.id] || 0,
      modulos: c.modulos?.length || 0,
      lecciones: (c.modulos || []).reduce((s, m) => s + (m.lecciones?.length || 0), 0),
      slug: c.slug || '',
      imagen: c.imagen_portada || c.titulo,
    }))
  } catch (err) {
    console.error('Error fetching admin courses:', err)
  }

  // 2) M\u00e9tricas: counts totales y del mes
  try {
    const [insc, inscMes, prog, constTot, constMes] = await Promise.all([
      rawSelect('inscripciones?select=id', accessToken, { count: 'exact' }),
      rawSelect(`inscripciones?select=id&inscrito_en=gte.${startOfMonth}`, accessToken, {
        count: 'exact',
      }),
      rawSelect('progreso?select=id&completado=eq.true', accessToken, { count: 'exact' }),
      rawSelect('constancias?select=id', accessToken, { count: 'exact' }),
      rawSelect(`constancias?select=id&emitida_en=gte.${startOfMonth}`, accessToken, {
        count: 'exact',
      }),
    ])
    const totalInsc = insc.count ?? 0
    const totalConst = constTot.count ?? 0
    const tasa = totalInsc > 0 ? ((totalConst / totalInsc) * 100).toFixed(1) + '%' : '\u2014'
    metrics.value = [
      {
        label: 'Inscripciones',
        value: totalInsc.toLocaleString(),
        delta: `+${inscMes.count ?? 0} este mes`,
        up: true,
      },
      { label: 'Lecciones vistas', value: (prog.count ?? 0).toLocaleString(), delta: '', up: true },
      {
        label: 'Constancias',
        value: totalConst.toLocaleString(),
        delta: `+${constMes.count ?? 0} este mes`,
        up: true,
      },
      { label: 'Tasa aprobaci\u00f3n', value: tasa, delta: '', up: true },
    ]
  } catch (err) {
    console.error('Error fetching admin metrics:', err)
  }

  // 3) Bar chart: inscripciones de los \u00faltimos 30 d\u00edas
  try {
    const { data: insc30 } = await rawSelect(
      `inscripciones?select=inscrito_en&inscrito_en=gte.${since30}`,
      accessToken
    )
    const buckets = new Array(30).fill(0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (const r of insc30 || []) {
      const d = new Date(r.inscrito_en)
      d.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((today - d) / 86400000)
      const idx = 29 - diffDays
      if (idx >= 0 && idx < 30) buckets[idx]++
    }
    const max = Math.max(...buckets, 1)
    barData.value = buckets.map((v) => Math.max(4, Math.round((v / max) * 95)))
  } catch (err) {
    console.error('Error fetching bar data:', err)
  }

  // 4) Top cursos por inscripciones
  try {
    const { data: allInsc } = await rawSelect('inscripciones?select=curso_id', accessToken)
    const counts = {}
    for (const r of allInsc || []) counts[r.curso_id] = (counts[r.curso_id] || 0) + 1
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    if (sorted.length) {
      const ids = sorted.map(([id]) => id).join(',')
      const { data: cursos } = await rawSelect(
        `cursos?select=id,titulo,nivel&id=in.(${ids})`,
        accessToken
      )
      topCourses.value = sorted.map(([id, n]) => {
        const c = (cursos || []).find((x) => x.id === id) || {}
        return { id, titulo: c.titulo || 'Curso', nivel: c.nivel || '\u2014', inscritos: n }
      })
    } else {
      topCourses.value = []
    }
  } catch (err) {
    console.error('Error fetching top courses:', err)
  }

  // 5) Actividad reciente (inscripciones + constancias + comentarios)
  try {
    const [iRes, cRes, mRes] = await Promise.all([
      rawSelect(
        'inscripciones?select=id,inscrito_en,perfiles(nombres_completos),cursos(titulo)&order=inscrito_en.desc&limit=10',
        accessToken
      ),
      rawSelect(
        'constancias?select=id,emitida_en,folio,perfiles(nombres_completos),cursos(titulo)&order=emitida_en.desc&limit=10',
        accessToken
      ),
      rawSelect(
        'comentarios?select=id,creado_en,perfiles(nombres_completos),lecciones(titulo)&order=creado_en.desc&limit=10',
        accessToken
      ),
    ])
    const items = [
      ...(iRes.data || []).map((r) => ({
        ts: r.inscrito_en,
        text: `${r.perfiles?.nombres_completos || 'Usuario'} se inscribi\u00f3 en "${r.cursos?.titulo || '\u2014'}"`,
      })),
      ...(cRes.data || []).map((r) => ({
        ts: r.emitida_en,
        text: `Se emiti\u00f3 constancia ${r.folio || ''} a ${r.perfiles?.nombres_completos || 'usuario'}`,
      })),
      ...(mRes.data || []).map((r) => ({
        ts: r.creado_en,
        text: `${r.perfiles?.nombres_completos || 'Usuario'} comento en "${r.lecciones?.titulo || '\u2014'}"`,
      })),
    ]
    items.sort((a, b) => new Date(b.ts) - new Date(a.ts))
    recentActivity.value = items.slice(0, 6).map((x) => ({
      time: relativeTime(x.ts),
      text: x.text,
    }))
  } catch (err) {
    console.error('Error fetching recent activity:', err)
  }

  // La lista de usuarios se carga bajo demanda en la pestaña "Usuarios"
  // (cargarUsuarios), con búsqueda server-side y paginación.
}

onMounted(loadDashboard)

// On full reload (F5), App.vue mounts AdminPage with session=null while
// supabase.auth.getSession() is still hydrating from localStorage. The
// initial onMounted bails out. Re-run the load once the token arrives.
watch(
  () => props.session?.access_token,
  (newToken, oldToken) => {
    if (newToken && !oldToken) loadDashboard()
  }
)

/* ──────────────────────────────
   Publish course to Supabase
   ────────────────────────────── */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${ms}ms) en ${label}`)), ms)
    ),
  ])
}

// Convierte un error de PostgREST/Postgres en mensaje amigable.
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

// Bypass supabase-js (que cuelga en auto-refresh) y usa fetch directo.
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

    // Fetch existing structure (only when updating) so we can upsert by id
    // and delete what was removed from the form. This preserves UUIDs of
    // modulos/lecciones, which keeps videos.leccion_id valid.
    const existingByModule = new Map() // moduloId -> Set<leccionId>
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
    const keptLessonsByModule = new Map() // moduloId -> Set<leccionId>

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
        mod.id = moduloId // write back to form so re-saves don't duplicate
      }
      keptModuleIds.add(moduloId)

      // Partition lessons into kept (real UUID and previously in this module)
      // vs new (placeholder id or being moved in).
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

      // Avoid unique(modulo_id, orden) conflicts during reorder by parking
      // kept lessons at negative ordens first, then INSERTing new lessons
      // with their final positive ordens, then PATCHing kept lessons to
      // their final positive ordens.
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
        // Self-healing: ensure videos.leccion_id still points at this row
        // (it may be NULL if the video predates this fix).
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
          lec.id = newLec.id // write back so VideoUploadField unlocks
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

    // Persistir preguntas de las evaluaciones (reemplazo total por lección).
    for (const mod of c.modulos) {
      for (const lec of mod.lecciones) {
        if (lec.fuente === 'examen' && isUuid(lec.id)) {
          await guardarEvaluacionAdmin(lec.id, lec.preguntas || [])
        }
      }
    }

    // Delete modules/lessons that were removed from the form. Order matters
    // only for clarity; FK cascade handles the rest.
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
    editingCurso.value = null

    // Refresh admin courses list (raw fetch)
    const refreshRes = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/cursos?select=*&order=creado_en.desc`,
      {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
    const refreshed = refreshRes.ok ? await refreshRes.json() : []

    if (refreshed && refreshed.length > 0) {
      adminCursos.value = refreshed.map((cr) => ({
        ...cr,
        inscritos: cr.inscritos ?? 0,
        modulos: cr.modulos ?? 0,
        lecciones: cr.lecciones ?? 0,
        slug: cr.slug ?? '',
        imagen: cr.imagen_portada ?? cr.titulo,
      }))
    }
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
  <div class="admin-layout" :class="{ 'sidebar-hidden': sidebarHidden }">
    <!-- Sidebar -->
    <aside v-show="!sidebarHidden" id="admin-sidebar" class="admin-sidebar">
      <div class="admin-sidebar-header">
        <p class="eyebrow" :style="{ color: 'var(--brand-accent)' }">Panel admin</p>
        <h2 class="display" :style="{ fontSize: '28px', color: 'var(--ink)', marginTop: '4px' }">
          Operaci&oacute;n
        </h2>
      </div>

      <nav class="admin-nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="admin-nav-btn"
          :class="{
            active: activeSection === item.key && !item.primary,
            primary: item.primary,
          }"
          @click="setSection(item.key)"
        >
          {{ item.label }}
        </button>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="admin-main">
      <button
        type="button"
        class="admin-sidebar-toggle"
        :aria-expanded="!sidebarHidden"
        aria-controls="admin-sidebar"
        :aria-label="sidebarHidden ? 'Mostrar menú' : 'Ocultar menú'"
        :title="sidebarHidden ? 'Mostrar menú' : 'Ocultar menú'"
        @click="toggleSidebar"
      >
        ☰
      </button>
      <!-- ═══════════════════════════
           RESUMEN (Dashboard)
           ═══════════════════════════ -->
      <template v-if="activeSection === 'resumen'">
        <div class="admin-content fade-in">
          <!-- Header -->
          <div class="admin-content-header">
            <div>
              <p class="eyebrow">Dashboard</p>
              <h1
                class="display"
                :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
              >
                Resumen de operaci&oacute;n
              </h1>
            </div>
            <div :style="{ display: 'flex', gap: 'calc(var(--unit) * 1.5)' }">
              <button class="btn btn-ghost btn-sm">Exportar</button>
              <button class="btn btn-primary btn-sm" @click="setSection('nuevo')">
                Crear curso
                <IconSet name="arrow" />
              </button>
            </div>
          </div>

          <!-- Metric cards -->
          <div class="admin-metrics">
            <div v-for="m in metrics" :key="m.label" class="admin-metric-card card">
              <p class="eyebrow">
                {{ m.label }}
              </p>
              <div
                class="display"
                :style="{ fontSize: '36px', color: 'var(--ink)', marginTop: '8px' }"
              >
                {{ m.value }}
              </div>
              <p
                class="mono"
                :style="{ color: m.up ? 'var(--success)' : 'var(--danger)', marginTop: '8px' }"
              >
                {{ m.delta }}
              </p>
            </div>
          </div>

          <!-- Bar chart placeholder -->
          <div class="admin-chart card">
            <div class="admin-chart-header">
              <p class="eyebrow">Inscripciones &middot; &Uacute;ltimos 30 d&iacute;as</p>
            </div>
            <div class="admin-chart-bars">
              <div
                v-for="(h, i) in barData"
                :key="i"
                class="admin-bar"
                :class="{ highlighted: i >= barData.length - 3 }"
                :style="{ height: h + '%' }"
              />
            </div>
          </div>

          <!-- Two-column: Top courses + Recent activity -->
          <div class="admin-two-col">
            <!-- Top courses -->
            <div class="card" :style="{ overflow: 'auto' }">
              <div
                :style="{
                  padding: 'calc(var(--unit) * 2.5)',
                  borderBottom: '1px solid var(--line)',
                }"
              >
                <p class="eyebrow">Top cursos por inscripciones</p>
              </div>
              <table v-if="topCourses.length" class="admin-table">
                <thead>
                  <tr>
                    <th class="mono">Curso</th>
                    <th class="mono">Inscritos</th>
                    <th class="mono">Nivel</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in topCourses" :key="c.id">
                    <td>{{ c.titulo }}</td>
                    <td>{{ c.inscritos.toLocaleString() }}</td>
                    <td>
                      <span class="chip">{{ c.nivel }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p
                v-else
                :style="{
                  padding: 'calc(var(--unit) * 2.5)',
                  color: 'var(--ink-3)',
                  fontSize: '13px',
                }"
              >
                A&uacute;n no hay inscripciones registradas.
              </p>
            </div>

            <!-- Recent activity -->
            <div class="card">
              <div
                :style="{
                  padding: 'calc(var(--unit) * 2.5)',
                  borderBottom: '1px solid var(--line)',
                }"
              >
                <p class="eyebrow">Actividad reciente</p>
              </div>
              <div v-if="recentActivity.length" class="admin-activity-list">
                <div v-for="(act, i) in recentActivity" :key="i" class="admin-activity-item">
                  <span class="admin-activity-dot" />
                  <div>
                    <p :style="{ fontSize: '14px', color: 'var(--ink-2)', lineHeight: '1.4' }">
                      {{ act.text }}
                    </p>
                    <p class="mono" :style="{ color: 'var(--ink-4)', marginTop: '2px' }">
                      {{ act.time }}
                    </p>
                  </div>
                </div>
              </div>
              <p
                v-else
                :style="{
                  padding: 'calc(var(--unit) * 2.5)',
                  color: 'var(--ink-3)',
                  fontSize: '13px',
                }"
              >
                Sin actividad reciente.
              </p>
            </div>
          </div>
        </div>
      </template>

      <!-- ═══════════════════════════
           CURSOS (List + Editor)
           ═══════════════════════════ -->
      <template v-else-if="activeSection === 'cursos'">
        <!-- Course Editor -->
        <template v-if="editingCurso">
          <div class="admin-content fade-in">
            <div class="admin-content-header">
              <div>
                <p class="eyebrow">Editor de curso</p>
                <h1
                  class="display"
                  :style="{ fontSize: '28px', color: 'var(--ink)', marginTop: '4px' }"
                >
                  {{ editingCurso.titulo || 'Nuevo curso' }}
                </h1>
              </div>
              <button class="btn btn-ghost btn-sm" @click="editingCurso = null">
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
                        editingCurso.imagen
                          ? { backgroundImage: `url(${editingCurso.imagen})` }
                          : null
                      "
                    >
                      <span
                        v-if="!editingCurso.imagen && !portadaUploading"
                        class="portada-preview-empty"
                      >
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
                  <div
                    v-for="(mod, mi) in editingCurso.modulos"
                    :key="mod.id"
                    class="editor-module card"
                  >
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
                              mod.imagen_portada
                                ? { backgroundImage: `url(${mod.imagen_portada})` }
                                : null
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
                          <p class="portada-hint">
                            PNG, JPEG o WebP · máx 10 MB · recomendado 1600×900.
                          </p>
                        </div>
                      </div>

                      <!-- Lecciones -->
                      <div class="editor-lessons">
                        <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 1)' }">
                          Lecciones ({{ mod.lecciones.length }})
                        </p>
                        <div
                          v-for="(lec, li) in mod.lecciones"
                          :key="lec.id"
                          class="editor-lesson-row"
                        >
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
                              <input v-model="lec.fuente" type="radio" :value="'ninguno'" /> Sin
                              contenido
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

                          <!-- Entrega de archivo (módulo LMS 3) -->
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
                              <span
                                class="mono"
                                :style="{ fontSize: '10px', color: 'var(--ink-4)' }"
                                >MB m&aacute;x</span
                              >
                            </template>
                          </div>

                          <!-- Evaluación (lección tipo examen) -->
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

                  <button
                    class="btn btn-ghost"
                    :style="{ alignSelf: 'flex-start' }"
                    @click="addModule"
                  >
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
                        <span class="chip chip-dorado">
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
                  <template v-else-if="/^[0-9a-f]{8}-/.test(editingCurso?.id || '')">
                    Actualizar curso
                  </template>
                  <template v-else> Publicar curso </template>
                  <IconSet v-if="!publishing" name="arrow" />
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Course list -->
        <template v-else>
          <div class="admin-content fade-in">
            <div class="admin-content-header">
              <div>
                <p class="eyebrow">Cat&aacute;logo</p>
                <h1
                  class="display"
                  :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
                >
                  Cursos
                </h1>
              </div>
              <button class="btn btn-primary btn-sm" @click="setSection('nuevo')">
                + Nuevo curso
                <IconSet name="arrow" />
              </button>
            </div>

            <div class="card" :style="{ overflow: 'auto' }">
              <table class="admin-table admin-table-full">
                <thead>
                  <tr>
                    <th class="mono" />
                    <th class="mono">Curso</th>
                    <th class="mono">Nivel</th>
                    <th class="mono">Inscritos</th>
                    <th class="mono">Estructura</th>
                    <th class="mono" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in adminCursos" :key="c.id">
                    <td :style="{ width: '56px' }">
                      <img
                        v-if="isUrl(c.imagen)"
                        :src="c.imagen"
                        :alt="c.titulo || 'Portada'"
                        :style="{
                          width: '48px',
                          height: '36px',
                          borderRadius: '2px',
                          objectFit: 'cover',
                          display: 'block',
                        }"
                      />
                      <PlaceholderImage
                        v-else
                        :label="c.imagen"
                        :style="{ width: '48px', height: '36px', borderRadius: '2px' }"
                      />
                    </td>
                    <td>
                      <div :style="{ display: 'flex', flexDirection: 'column', gap: '2px' }">
                        <span :style="{ fontWeight: '500' }">{{ c.titulo }}</span>
                        <span class="mono" :style="{ color: 'var(--ink-4)' }"> /{{ c.slug }} </span>
                      </div>
                    </td>
                    <td>
                      <span class="chip">{{ c.nivel }}</span>
                    </td>
                    <td>{{ c.inscritos.toLocaleString() }}</td>
                    <td class="mono" :style="{ color: 'var(--ink-3)' }">
                      {{ c.modulos }} m&oacute;d &middot; {{ c.lecciones }} lec
                    </td>
                    <td :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
                      <button class="btn btn-ghost btn-sm" @click="editCurso(c)">Editar</button>
                      <button
                        class="btn btn-ghost btn-sm btn-danger"
                        :disabled="(c.inscritos || 0) > 0"
                        :title="
                          (c.inscritos || 0) > 0 ? `Tiene ${c.inscritos} inscritos` : 'Borrar curso'
                        "
                        @click="deleteCurso(c)"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </template>

      <!-- ═══════════════════════════
           USUARIOS
           ═══════════════════════════ -->
      <template v-else-if="activeSection === 'usuarios'">
        <div class="admin-content fade-in">
          <div class="admin-content-header">
            <div>
              <p class="eyebrow">Gesti&oacute;n</p>
              <h1
                class="display"
                :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
              >
                Usuarios
              </h1>
            </div>
          </div>

          <!-- Search -->
          <div class="field" :style="{ maxWidth: '400px', marginBottom: 'calc(var(--unit) * 3)' }">
            <label>Buscar usuario</label>
            <input
              v-model="usuarioSearch"
              type="text"
              placeholder="Nombre o correo..."
              @input="onUsuarioSearch"
            />
          </div>

          <p
            v-if="usuariosError"
            class="mono"
            :style="{ color: 'var(--primary)', marginBottom: 'calc(var(--unit) * 2)' }"
          >
            &#9888; {{ usuariosError }}
          </p>

          <div class="card" :style="{ overflow: 'auto' }">
            <table class="admin-table admin-table-full">
              <thead>
                <tr>
                  <th class="mono">Nombre</th>
                  <th class="mono">Dependencia</th>
                  <th class="mono">Correo</th>
                  <th class="mono">Rol</th>
                  <th class="mono">&Uacute;ltimo acceso</th>
                  <th class="mono" />
                </tr>
              </thead>
              <tbody>
                <tr v-if="usuariosLoading">
                  <td
                    colspan="6"
                    class="mono"
                    :style="{ textAlign: 'center', color: 'var(--ink-4)', padding: '24px' }"
                  >
                    Cargando&hellip;
                  </td>
                </tr>
                <tr v-else-if="!usuarios.length">
                  <td
                    colspan="6"
                    class="mono"
                    :style="{ textAlign: 'center', color: 'var(--ink-4)', padding: '24px' }"
                  >
                    Sin resultados.
                  </td>
                </tr>
                <tr v-for="u in usuarios" :key="u.id">
                  <td :style="{ fontWeight: '500' }">
                    {{ u.nombres_completos || '—' }}
                  </td>
                  <td>
                    <span class="chip">{{ u.dependencias?.siglas || 'N/A' }}</span>
                  </td>
                  <td class="mono" :style="{ color: 'var(--ink-3)' }">
                    {{ u.correo }}
                  </td>
                  <td>
                    <span v-if="u.es_admin" class="chip">Admin</span>
                    <span v-else-if="u.es_instructor" class="chip">Instructor</span>
                    <span v-else :style="{ color: 'var(--ink-4)' }">&mdash;</span>
                  </td>
                  <td class="mono" :style="{ color: 'var(--ink-4)' }">
                    {{ fechaAcceso(u.actualizado_en) }}
                  </td>
                  <td>
                    <button class="btn btn-ghost btn-sm" @click="abrirReset(u)">
                      Restablecer contrase&ntilde;a
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Paginaci&oacute;n -->
          <div
            :style="{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 'calc(var(--unit) * 2)',
            }"
          >
            <span class="mono" :style="{ color: 'var(--ink-4)', fontSize: '13px' }">
              {{ usuariosDesde }}&ndash;{{ usuariosHasta }} de {{ usuariosTotal }}
            </span>
            <div :style="{ display: 'flex', gap: '8px' }">
              <button
                class="btn btn-ghost btn-sm"
                :disabled="usuariosPage === 0 || usuariosLoading"
                @click="usuariosPrevPage"
              >
                Anterior
              </button>
              <button
                class="btn btn-ghost btn-sm"
                :disabled="usuariosHasta >= usuariosTotal || usuariosLoading"
                @click="usuariosNextPage"
              >
                Siguiente
              </button>
            </div>
          </div>

          <!-- Modal restablecer contrase&ntilde;a -->
          <div
            v-if="pwModalOpen"
            class="pw-overlay"
            role="dialog"
            aria-modal="true"
            @click.self="cerrarReset"
          >
            <div class="pw-modal card">
              <h3 :style="{ marginBottom: '4px', color: 'var(--ink)' }">
                Restablecer contrase&ntilde;a
              </h3>
              <p
                class="mono"
                :style="{
                  color: 'var(--ink-3)',
                  fontSize: '13px',
                  marginBottom: 'calc(var(--unit) * 2)',
                }"
              >
                {{ pwUser?.nombres_completos || pwUser?.correo }}
              </p>
              <div class="field" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
                <label>Nueva contrase&ntilde;a</label>
                <input
                  v-model="pwNew"
                  type="password"
                  autocomplete="new-password"
                  placeholder="M&iacute;nimo 8 caracteres"
                />
              </div>
              <div class="field" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
                <label>Confirmar contrase&ntilde;a</label>
                <input
                  v-model="pwConfirm"
                  type="password"
                  autocomplete="new-password"
                  @keyup.enter="confirmarReset"
                />
              </div>
              <p
                v-if="pwMsg"
                class="mono"
                :style="{
                  fontSize: '13px',
                  marginBottom: 'calc(var(--unit) * 2)',
                  color: pwMsg.type === 'ok' ? '#2e9e6b' : 'var(--primary)',
                }"
              >
                {{ pwMsg.text }}
              </p>
              <div :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
                <button class="btn btn-ghost btn-sm" :disabled="pwLoading" @click="cerrarReset">
                  Cerrar
                </button>
                <button class="btn btn-sm" :disabled="pwLoading" @click="confirmarReset">
                  {{ pwLoading ? 'Guardando…' : 'Restablecer' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ═══════════════════════════
           INSTRUCTORES (módulo LMS 1)
           ═══════════════════════════ -->
      <template v-else-if="activeSection === 'instructores'">
        <div class="admin-content fade-in">
          <div class="admin-content-header">
            <div>
              <p class="eyebrow">Gesti&oacute;n</p>
              <h1
                class="display"
                :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
              >
                Instructores
              </h1>
            </div>
          </div>

          <p
            v-if="instMsg"
            class="mono"
            :style="{ color: 'var(--primary)', marginBottom: 'calc(var(--unit) * 2)' }"
          >
            {{ instMsg }}
          </p>

          <!-- Alta: buscar perfil y marcarlo como instructor -->
          <div class="field" :style="{ maxWidth: '420px', marginBottom: 'calc(var(--unit) * 2)' }">
            <label>Agregar instructor (buscar por nombre o correo)</label>
            <input v-model="instBusqueda" type="text" placeholder="Mínimo 2 caracteres..." />
          </div>
          <div
            v-if="instResultados.length"
            class="card"
            :style="{
              maxWidth: '560px',
              marginBottom: 'calc(var(--unit) * 3)',
              padding: 'calc(var(--unit) * 1.5)',
            }"
          >
            <table class="admin-table admin-table-full">
              <tbody>
                <tr v-for="p in instResultados" :key="p.id">
                  <td :style="{ fontWeight: '500' }">{{ p.nombres }} {{ p.apellido_paterno }}</td>
                  <td class="mono" :style="{ color: 'var(--ink-3)' }">
                    {{ p.correo }}
                  </td>
                  <td>
                    <button
                      v-if="!p.es_instructor"
                      class="btn btn-primary btn-sm"
                      @click="toggleEsInstructor(p, true)"
                    >
                      Hacer instructor
                    </button>
                    <span v-else class="chip">Ya es instructor</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            :style="{
              display: 'grid',
              gridTemplateColumns: instSel ? '1fr 1fr' : '1fr',
              gap: 'calc(var(--unit) * 2)',
              alignItems: 'start',
            }"
          >
            <!-- Lista de instructores -->
            <div class="card" :style="{ overflow: 'auto' }">
              <table class="admin-table admin-table-full">
                <thead>
                  <tr>
                    <th class="mono">Nombre</th>
                    <th class="mono">Correo</th>
                    <th class="mono" />
                    <th class="mono" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!instructores.length && !instLoading">
                    <td colspan="4" :style="{ color: 'var(--ink-4)' }">
                      Sin instructores. Busca un perfil arriba para dar de alta.
                    </td>
                  </tr>
                  <tr
                    v-for="p in instructores"
                    :key="p.id"
                    :class="{ 'is-selected': instSel?.id === p.id }"
                  >
                    <td :style="{ fontWeight: '500' }">{{ p.nombres }} {{ p.apellido_paterno }}</td>
                    <td class="mono" :style="{ color: 'var(--ink-3)' }">
                      {{ p.correo }}
                    </td>
                    <td>
                      <button class="btn btn-ghost btn-sm" @click="selInstructor(p)">Cursos</button>
                    </td>
                    <td>
                      <button
                        class="btn btn-ghost btn-sm"
                        :style="{ color: 'var(--primary)' }"
                        @click="
                          () =>
                            confirm('¿Quitar rol de instructor a ' + p.nombres + '?') &&
                            toggleEsInstructor(p, false)
                        "
                      >
                        Quitar rol
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Asignación de cursos del instructor seleccionado -->
            <div v-if="instSel" class="card" :style="{ padding: 'calc(var(--unit) * 2)' }">
              <p class="eyebrow">Cursos de {{ instSel.nombres }} {{ instSel.apellido_paterno }}</p>
              <ul
                :style="{
                  listStyle: 'none',
                  padding: '0',
                  margin: 'calc(var(--unit) * 1.5) 0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }"
              >
                <li
                  v-if="!instAsignaciones.length"
                  :style="{ color: 'var(--ink-4)', fontSize: '14px' }"
                >
                  Sin cursos asignados.
                </li>
                <li
                  v-for="a in instAsignaciones"
                  :key="a.curso_id"
                  :style="{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }"
                >
                  <span>{{ a.cursos?.titulo || a.curso_id }}</span>
                  <button class="btn btn-ghost btn-sm" @click="quitarCursoSel(a.curso_id)">
                    Quitar
                  </button>
                </li>
              </ul>
              <div class="field">
                <label>Asignar curso</label>
                <div :style="{ display: 'flex', gap: '8px' }">
                  <select v-model="instCursoSel" :style="{ flex: '1' }">
                    <option value="" disabled>Selecciona un curso…</option>
                    <option
                      v-for="c in instCursosCat.filter(
                        (c) => !instAsignaciones.some((a) => a.curso_id === c.id)
                      )"
                      :key="c.id"
                      :value="c.id"
                    >
                      {{ c.titulo }}
                    </option>
                  </select>
                  <button
                    class="btn btn-primary btn-sm"
                    :disabled="!instCursoSel"
                    @click="asignarCursoSel"
                  >
                    Asignar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ═══════════════════════════
           CONSTANCIAS
           ═══════════════════════════ -->
      <template v-else-if="activeSection === 'constancias'">
        <div class="admin-content fade-in admin-centered">
          <p class="eyebrow">Constancias emitidas</p>
          <div
            class="display"
            :style="{
              fontSize: '96px',
              color: 'var(--ink)',
              lineHeight: '1',
              marginTop: 'calc(var(--unit) * 2)',
            }"
          >
            {{ metrics[2]?.value || '\u2014' }}
          </div>
          <p
            :style="{ fontSize: '16px', color: 'var(--ink-3)', marginTop: 'calc(var(--unit) * 2)' }"
          >
            Constancias emitidas en el ciclo 2026
          </p>
        </div>
      </template>

      <!-- ═══════════════════════════
           REPORTES
           ═══════════════════════════ -->
      <template v-else-if="activeSection === 'reportes'">
        <div class="admin-content fade-in">
          <div class="admin-content-header">
            <div>
              <p class="eyebrow">An&aacute;lisis</p>
              <h1
                class="display"
                :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
              >
                Reportes
              </h1>
            </div>
            <button v-if="reportRows.length" class="btn btn-ghost btn-sm" @click="exportReportCsv">
              Descargar CSV
              <IconSet name="arrow" />
            </button>
          </div>

          <div class="admin-reports-list">
            <button
              v-for="(r, i) in reportTypes"
              :key="r.key"
              type="button"
              class="admin-report-item"
              :class="{ active: selectedReport?.key === r.key }"
              @click="runReport(r)"
            >
              <span class="mono" :style="{ color: 'var(--ink-4)', minWidth: '28px' }">
                {{ String(i + 1).padStart(2, '0') }}
              </span>
              <span
                class="mono"
                :style="{ color: 'var(--ink-2)', fontSize: '13px', letterSpacing: '0.04em' }"
              >
                {{ r.label }}
              </span>
              <IconSet
                v-if="selectedReport?.key === r.key && reportLoading"
                name="clock"
                :style="{ marginLeft: 'auto', color: 'var(--ink-4)' }"
              />
            </button>
          </div>

          <div v-if="selectedReport" :style="{ marginTop: 'calc(var(--unit) * 4)' }">
            <div :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
              <p class="eyebrow">
                {{ selectedReport.label }}
              </p>
              <p class="mono" :style="{ color: 'var(--ink-4)', marginTop: '4px' }">
                {{ reportLoading ? 'Generando\u2026' : `${reportRows.length} resultado(s)` }}
              </p>
            </div>

            <div v-if="reportError" class="publish-status publish-status-error">
              {{ reportError }}
            </div>

            <div
              v-else-if="reportLoading"
              class="card"
              :style="{
                padding: 'calc(var(--unit) * 4)',
                textAlign: 'center',
                color: 'var(--ink-3)',
              }"
            >
              Cargando datos&hellip;
            </div>

            <div
              v-else-if="!reportRows.length"
              class="card"
              :style="{
                padding: 'calc(var(--unit) * 4)',
                textAlign: 'center',
                color: 'var(--ink-3)',
              }"
            >
              Sin resultados.
            </div>

            <div v-else class="card" :style="{ overflow: 'auto' }">
              <table class="admin-table admin-table-full">
                <thead>
                  <tr>
                    <th v-for="col in reportColumns" :key="col" class="mono">
                      {{ col }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in reportRows" :key="i">
                    <td v-for="col in reportColumns" :key="col">
                      {{ row[col] }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>

      <!-- ===================== Configuración ===================== -->
      <template v-else-if="activeSection === 'config'">
        <div class="admin-content fade-in">
          <div class="admin-content-header">
            <div>
              <p class="eyebrow">Plataforma</p>
              <h1
                class="display"
                :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
              >
                Configuración de la constancia
              </h1>
              <p
                :style="{
                  marginTop: '8px',
                  color: 'var(--ink-3)',
                  fontSize: '14px',
                  lineHeight: '1.55',
                }"
              >
                Datos del firmante que aparecen al pie de cada constancia emitida. Estos valores son
                globales y se aplican a partir de las próximas constancias generadas.
              </p>
            </div>
          </div>

          <div v-if="constConfigLoading" class="config-card">
            <span class="mono" :style="{ color: 'var(--ink-3)' }">Cargando…</span>
          </div>

          <form v-else class="config-card" @submit.prevent="saveConstConfig">
            <div class="field">
              <label for="cs-titular">Nombre del titular</label>
              <input
                id="cs-titular"
                v-model="constConfig.titular_nombre"
                type="text"
                placeholder="Ej. Dr. Juan Pérez García"
                maxlength="120"
              />
            </div>

            <div class="field">
              <label for="cs-cargo">Cargo del titular</label>
              <input
                id="cs-cargo"
                v-model="constConfig.titular_cargo"
                type="text"
                placeholder="Ej. Comisionado Nacional contra las Adicciones"
                maxlength="160"
              />
            </div>

            <div class="field">
              <label for="cs-lugar">Lugar de emisión</label>
              <input
                id="cs-lugar"
                v-model="constConfig.lugar"
                type="text"
                placeholder="Ej. Ciudad de México"
                maxlength="80"
              />
            </div>

            <div class="config-actions">
              <button type="submit" class="btn btn-primary" :disabled="constConfigSaving">
                <template v-if="constConfigSaving"> Guardando… </template>
                <template v-else> Guardar cambios <IconSet name="arrow" /> </template>
              </button>
              <span v-if="constConfigMsg" class="mono config-msg">{{ constConfigMsg }}</span>
            </div>
          </form>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
/* ── Layout ── */
.admin-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
  transition: grid-template-columns 200ms var(--ease);
}

/* Menú oculto: el contenido ocupa todo el ancho */
.admin-layout.sidebar-hidden {
  grid-template-columns: 1fr;
}

/* Botón ☰ para ocultar/mostrar el menú */
.admin-sidebar-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-bottom: calc(var(--unit) * 2);
  font-size: 18px;
  line-height: 1;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  cursor: pointer;
  transition: all 180ms var(--ease);
}

.admin-sidebar-toggle:hover {
  background: var(--paper-2);
  color: var(--ink);
}

/* ── Sidebar ── */
.admin-sidebar {
  background: var(--paper);
  border-right: 1px solid var(--line);
  padding: calc(var(--unit) * 4) 0;
  position: sticky;
  top: 68px;
  height: calc(100vh - 68px);
  overflow-y: auto;
}

.admin-sidebar-header {
  padding: 0 calc(var(--unit) * 3);
  margin-bottom: calc(var(--unit) * 4);
}

.admin-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.admin-nav-btn {
  display: block;
  width: 100%;
  text-align: left;
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 3);
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-2);
  border-left: 3px solid transparent;
  transition: all 180ms var(--ease);
}

.admin-nav-btn:hover {
  background: var(--paper-2);
  color: var(--ink);
}

.admin-nav-btn.active {
  border-left-color: var(--primary);
  background: var(--paper);
  color: var(--ink);
  font-weight: 600;
}

.admin-nav-btn.primary {
  color: var(--primary);
  font-weight: 600;
}

.admin-nav-btn.primary:hover {
  background: var(--primary-100);
}

/* ── Main content ── */
.admin-main {
  background: var(--paper-2);
  padding: calc(var(--unit) * 4) calc(var(--unit) * 5);
  overflow-y: auto;
}

.admin-content {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 4);
}

.admin-content-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.admin-centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  text-align: center;
}

/* ── Metrics ── */
.admin-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: calc(var(--unit) * 2);
}

.admin-metric-card {
  padding: calc(var(--unit) * 2.5);
}

/* ── Bar chart ── */
.admin-chart {
  padding: calc(var(--unit) * 2.5);
}

.admin-chart-header {
  margin-bottom: calc(var(--unit) * 2);
}

.admin-chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 160px;
}

.admin-bar {
  flex: 1;
  background: var(--paper-3);
  border-radius: 2px 2px 0 0;
  transition: background 180ms var(--ease);
  min-width: 0;
}

.admin-bar.highlighted {
  background: var(--primary);
}

/* ── Two column ── */
.admin-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--unit) * 2);
}

/* ── Tables ── */
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.admin-table th {
  text-align: left;
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 2);
  border-bottom: 1px solid var(--line);
  color: var(--ink-3);
  font-weight: 400;
}

.admin-table td {
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 2);
  border-bottom: 1px solid var(--line-soft);
  color: var(--ink-2);
  vertical-align: middle;
}

.admin-table tbody tr:last-child td {
  border-bottom: none;
}

.admin-table-full th:first-child,
.admin-table-full td:first-child {
  padding-left: calc(var(--unit) * 2.5);
}

/* ── Activity feed ── */
.admin-activity-list {
  display: flex;
  flex-direction: column;
}

.admin-activity-item {
  display: flex;
  gap: calc(var(--unit) * 1.5);
  padding: calc(var(--unit) * 2) calc(var(--unit) * 2.5);
  border-bottom: 1px solid var(--line-soft);
  align-items: flex-start;
}

.admin-activity-item:last-child {
  border-bottom: none;
}

.admin-activity-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  margin-top: 7px;
  flex-shrink: 0;
}

/* ── Reports ── */
.admin-reports-list {
  display: flex;
  flex-direction: column;
}

.admin-report-item {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 2) calc(var(--unit) * 1);
  border: none;
  border-bottom: 1px solid var(--line-soft);
  background: transparent;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background 160ms var(--ease);
}

.admin-report-item:hover {
  background: var(--paper-2);
}
.admin-report-item.active {
  background: var(--paper-2);
}
.admin-report-item.active span:nth-child(2) {
  color: var(--primary) !important;
}

.admin-report-item:last-child {
  border-bottom: none;
}

/* ── Course Editor ── */
.editor-steps {
  display: flex;
  gap: calc(var(--unit) * 1);
  padding-bottom: calc(var(--unit) * 3);
  border-bottom: 1px solid var(--line);
}

.editor-step-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: calc(var(--unit) * 1) calc(var(--unit) * 2);
  font-size: 14px;
  color: var(--ink-3);
  border-radius: 999px;
  transition: all 180ms var(--ease);
}

.editor-step-btn.active {
  background: var(--primary-100);
  color: var(--primary);
  font-weight: 600;
}

.editor-step-btn.completed {
  color: var(--success);
}

.editor-step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 600;
  background: var(--paper-3);
  color: var(--ink-3);
}

.editor-step-btn.active .editor-step-num {
  background: var(--primary);
  color: var(--paper);
}

.editor-step-btn.completed .editor-step-num {
  background: var(--success);
  color: var(--paper);
}

.editor-panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 4);
}

.editor-fields {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
  max-width: 640px;
}

.editor-image-placeholder {
  height: 120px;
  border-radius: 2px;
  border: 1px dashed var(--line);
  cursor: pointer;
}

/* === Portada upload === */
.portada-upload {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.portada-preview {
  height: 180px;
  background: var(--paper-2);
  background-size: cover;
  background-position: center;
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  position: relative;
}
.portada-preview.is-empty {
  background-image: repeating-linear-gradient(
    135deg,
    var(--paper-3) 0,
    var(--paper-3) 1px,
    var(--paper-2) 1px,
    var(--paper-2) 14px
  );
}
.portada-preview-empty {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-3);
  background: var(--paper);
  padding: 4px 10px;
  border: 1px solid var(--line);
}
.portada-progress {
  position: absolute;
  inset: auto 12px 12px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.55);
  padding: 8px 10px;
  color: var(--paper);
  font-family: var(--mono);
  font-size: 11px;
}
.portada-progress-bar {
  flex: 1;
  height: 4px;
  background: var(--brand-accent);
  transition: width 120ms linear;
}
.portada-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.portada-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--ink);
  color: var(--paper);
  border: none;
  padding: 8px 16px;
  font-family: var(--ui);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms var(--ease);
}
.portada-btn:hover {
  background: var(--brand-primary);
}
.portada-btn input {
  display: none;
}
.portada-btn[disabled],
.portada-btn:has(input:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
.portada-btn-danger {
  background: transparent;
  color: var(--brand-primary);
  border: 1px solid var(--brand-primary);
}
.portada-btn-danger:hover {
  background: var(--brand-primary);
  color: var(--paper);
}
.portada-err {
  color: var(--danger);
  font-size: 12.5px;
  margin: 2px 0 0;
}
.portada-hint {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin: 2px 0 0;
}

/* === Config card === */
.config-card {
  max-width: 640px;
  background: var(--paper);
  border: 1px solid var(--line);
  padding: calc(var(--unit) * 4);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
  margin-top: calc(var(--unit) * 4);
}
.config-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: calc(var(--unit) * 2);
  border-top: 1px solid var(--line);
}
.config-msg {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--brand-secondary);
}

.editor-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--ink-2);
  cursor: pointer;
}

.editor-checkbox input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
  flex-shrink: 0;
}

.editor-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: calc(var(--unit) * 3);
  border-top: 1px solid var(--line);
}

/* Structure layout */
.editor-structure-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: calc(var(--unit) * 3);
  align-items: start;
}

.editor-modules {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}

.editor-module {
  overflow: visible;
}

.editor-module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 2.5);
  border-bottom: 1px solid var(--line);
  background: var(--paper-2);
}

.editor-module-body {
  padding: calc(var(--unit) * 2.5);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}

.editor-icon-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 2px;
  font-size: 16px;
  color: var(--ink-3);
  transition: all 150ms var(--ease);
}

.editor-icon-btn:hover {
  background: var(--paper-3);
  color: var(--ink);
}

.editor-icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.editor-icon-btn-danger:hover {
  background: var(--danger);
  color: var(--paper);
}

/* Lessons */
.editor-lessons {
  padding-top: calc(var(--unit) * 2);
  border-top: 1px solid var(--line-soft);
}

.editor-lesson-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.editor-lesson-input {
  flex: 1;
  padding: 8px 0;
  border: none;
  border-bottom: 1px solid var(--line);
  background: transparent;
  font-size: 14px;
  font-family: var(--ui);
  color: var(--ink);
  outline: none;
  transition: border-color 180ms var(--ease);
}

.editor-lesson-input:focus {
  border-bottom-color: var(--primary);
}

.editor-lesson-input::placeholder {
  color: var(--ink-4);
}

.editor-lesson-select {
  padding: 8px 4px;
  border: none;
  border-bottom: 1px solid var(--line);
  background: transparent;
  font-size: 13px;
  font-family: var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-2);
  outline: none;
  min-width: 100px;
}

/* Guide sidebar */
.editor-guide {
  position: sticky;
  top: calc(68px + var(--unit) * 4);
}

.editor-guide-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-3);
}

.editor-guide-list li::before {
  content: '\2192 ';
  color: var(--ink-4);
}

/* Review layout */
.editor-review-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--unit) * 4);
  align-items: start;
}

.editor-validation {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}

.editor-validation-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.publish-status {
  margin-top: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 2);
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.4;
  border: 1px solid var(--line);
  background: var(--paper-2);
  color: var(--ink-2);
}
.publish-status-error {
  border-color: var(--danger);
  background: rgba(138, 43, 31, 0.08);
  color: var(--danger);
}
.publish-status-success {
  border-color: var(--success);
  background: rgba(45, 92, 62, 0.08);
  color: var(--success);
}

.btn-danger {
  color: var(--danger);
  border-color: var(--line);
}
.btn-danger:hover:not(:disabled) {
  background: rgba(138, 43, 31, 0.08);
  border-color: var(--danger);
}
.btn-danger:disabled,
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: auto;
}

/* Modal de restablecer contraseña */
.pw-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  padding: 16px;
}
.pw-modal {
  width: 100%;
  max-width: 420px;
  padding: calc(var(--unit) * 3);
}
</style>
