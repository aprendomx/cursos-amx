<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { supabase } from '@/lib/supabase.js'
import IconSet from '@/components/IconSet.vue'
import PlaceholderImage from '@/components/PlaceholderImage.vue'
import { getConstanciaConfig, updateConstanciaConfig } from '@/services/constanciaConfig.js'
import {
  fetchPerfilesInstructores,
  buscarPerfiles,
  setEsInstructor,
  fetchAsignacionesInstructor,
  asignarInstructorACurso,
  desasignarInstructorDeCurso,
} from '@/services/instructores.js'
import { formatearDuracion } from '@/services/tiempo.js'
import { featureEnabled } from '@/lib/featureFlags.js'
import AdminDashboard from '@/components/AdminDashboard.vue'
import AdminCourseEditor from '@/components/AdminCourseEditor.vue'
import AdminUserManager from '@/components/AdminUserManager.vue'

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
const editingCurso = ref(null)

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

/* ──────────────────────────────
   Constancia config
   ────────────────────────────── */
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
    constConfigMsg.value = '\u2713 Guardado'
    setTimeout(() => {
      constConfigMsg.value = ''
    }, 3000)
  } catch (err) {
    constConfigMsg.value = '\u26a0 ' + (err?.message || String(err))
  } finally {
    constConfigSaving.value = false
  }
}

/* ──────────────────────────────
   Instructores
   ────────────────────────────── */
const instructores = ref([])
const instCursosCat = ref([])
const instBusqueda = ref('')
const instResultados = ref([])
const instSel = ref(null)
const instAsignaciones = ref([])
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
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
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
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
  }
}

async function selInstructor(p) {
  instSel.value = p
  instCursoSel.value = ''
  try {
    instAsignaciones.value = await fetchAsignacionesInstructor(p.id)
  } catch (e) {
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
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
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
  }
}

async function quitarCursoSel(cursoId) {
  if (!instSel.value) return
  instMsg.value = ''
  try {
    await desasignarInstructorDeCurso(cursoId, instSel.value.id)
    instAsignaciones.value = await fetchAsignacionesInstructor(instSel.value.id)
  } catch (e) {
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
  }
}

watch(
  activeSection,
  (s) => {
    if (s === 'config') loadConstConfig()
    if (s === 'instructores') loadInstructoresSection()
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
  { key: 'config', label: 'Configuraci\u00f3n' },
]

function setSection(key) {
  if (key === 'nuevo') {
    activeSection.value = 'cursos'
    editingCurso.value = createBlankCurso()
    return
  }
  editingCurso.value = null
  activeSection.value = key
}

function editCurso(curso) {
  editingCurso.value = curso
  activeSection.value = 'cursos'
}

function onCoursePublished() {
  editingCurso.value = null
  loadDashboard()
}

/* ──────────────────────────────
   Dashboard
   ────────────────────────────── */
const metrics = ref([
  { label: 'Inscripciones', value: '\u2014', delta: '', up: true },
  { label: 'Lecciones vistas', value: '\u2014', delta: '', up: true },
  { label: 'Constancias', value: '\u2014', delta: '', up: true },
  { label: 'Tasa aprobaci\u00f3n', value: '\u2014', delta: '', up: true },
])

const adminCursos = ref([])
const barData = ref(new Array(30).fill(0))
const topCourses = ref([])
const recentActivity = ref([])

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
}

onMounted(loadDashboard)

watch(
  () => props.session?.access_token,
  (newToken, oldToken) => {
    if (newToken && !oldToken) loadDashboard()
  }
)

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
    dependencia: r.perfiles?.dependencias?.siglas || '\u2014',
    curso: r.cursos?.titulo || '\u2014',
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

/* ──────────────────────────────
   Raw REST helpers
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
</script>

<template>
  <div
    class="admin-layout"
    :class="{ 'sidebar-hidden': sidebarHidden }"
  >
    <aside
      v-show="!sidebarHidden"
      id="admin-sidebar"
      class="admin-sidebar"
    >
      <div class="admin-sidebar-header">
        <p
          class="eyebrow"
          :style="{ color: 'var(--brand-accent)' }"
        >
          Panel admin
        </p>
        <h2
          class="display"
          :style="{ fontSize: '28px', color: 'var(--ink)', marginTop: '4px' }"
        >
          Operaci&oacute;n
        </h2>
      </div>
      <nav class="admin-nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="admin-nav-btn"
          :class="{ active: activeSection === item.key && !item.primary, primary: item.primary }"
          @click="setSection(item.key)"
        >
          {{ item.label }}
        </button>
      </nav>
    </aside>

    <main class="admin-main">
      <button
        type="button"
        class="admin-sidebar-toggle"
        :aria-expanded="!sidebarHidden"
        aria-controls="admin-sidebar"
        :aria-label="sidebarHidden ? 'Mostrar men\u00fa' : 'Ocultar men\u00fa'"
        :title="sidebarHidden ? 'Mostrar men\u00fa' : 'Ocultar men\u00fa'"
        @click="toggleSidebar"
      >
        ☰
      </button>

      <AdminDashboard
        v-if="activeSection === 'resumen'"
        :metrics="metrics"
        :bar-data="barData"
        :top-courses="topCourses"
        :recent-activity="recentActivity"
        @create-course="setSection('nuevo')"
      />

      <template v-else-if="activeSection === 'cursos'">
        <AdminCourseEditor
          v-if="editingCurso"
          :session="session"
          :initial-curso="editingCurso"
          @published="onCoursePublished"
          @cancel="editingCurso = null"
        />
        <template v-else>
          <div class="admin-content fade-in">
            <div class="admin-content-header">
              <div>
                <p class="eyebrow">
                  Cat&aacute;logo
                </p>
                <h1
                  class="display"
                  :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
                >
                  Cursos
                </h1>
              </div>
              <button
                class="btn btn-primary btn-sm"
                @click="setSection('nuevo')"
              >
                + Nuevo curso
                <IconSet name="arrow" />
              </button>
            </div>
            <div
              class="card"
              :style="{ overflow: 'auto' }"
            >
              <table class="admin-table admin-table-full">
                <thead>
                  <tr>
                    <th class="mono" />
                    <th class="mono">
                      Curso
                    </th>
                    <th class="mono">
                      Nivel
                    </th>
                    <th class="mono">
                      Inscritos
                    </th>
                    <th class="mono">
                      Estructura
                    </th>
                    <th class="mono" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="c in adminCursos"
                    :key="c.id"
                  >
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
                      >
                      <PlaceholderImage
                        v-else
                        :label="c.imagen"
                        :style="{ width: '48px', height: '36px', borderRadius: '2px' }"
                      />
                    </td>
                    <td>
                      <div :style="{ display: 'flex', flexDirection: 'column', gap: '2px' }">
                        <span :style="{ fontWeight: '500' }">{{ c.titulo }}</span>
                        <span
                          class="mono"
                          :style="{ color: 'var(--ink-4)' }"
                        > /{{ c.slug }} </span>
                      </div>
                    </td>
                    <td>
                      <span class="chip">{{ c.nivel }}</span>
                    </td>
                    <td>{{ c.inscritos.toLocaleString() }}</td>
                    <td
                      class="mono"
                      :style="{ color: 'var(--ink-3)' }"
                    >
                      {{ c.modulos }} m&oacute;d &middot; {{ c.lecciones }} lec
                    </td>
                    <td :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
                      <button
                        class="btn btn-ghost btn-sm"
                        @click="editCurso(c)"
                      >
                        Editar
                      </button>
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

      <AdminUserManager
        v-else-if="activeSection === 'usuarios'"
        :session="session"
      />

      <template v-else-if="activeSection === 'instructores'">
        <div class="admin-content fade-in">
          <div class="admin-content-header">
            <div>
              <p class="eyebrow">
                Gesti&oacute;n
              </p>
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
          <div
            class="field"
            :style="{ maxWidth: '420px', marginBottom: 'calc(var(--unit) * 2)' }"
          >
            <label>Agregar instructor (buscar por nombre o correo)</label>
            <input
              v-model="instBusqueda"
              type="text"
              placeholder="M\u00ednimo 2 caracteres..."
            >
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
                <tr
                  v-for="p in instResultados"
                  :key="p.id"
                >
                  <td :style="{ fontWeight: '500' }">
                    {{ p.nombres }} {{ p.apellido_paterno }}
                  </td>
                  <td
                    class="mono"
                    :style="{ color: 'var(--ink-3)' }"
                  >
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
                    <span
                      v-else
                      class="chip"
                    >Ya es instructor</span>
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
            <div
              class="card"
              :style="{ overflow: 'auto' }"
            >
              <table class="admin-table admin-table-full">
                <thead>
                  <tr>
                    <th class="mono">
                      Nombre
                    </th>
                    <th class="mono">
                      Correo
                    </th>
                    <th class="mono" />
                    <th class="mono" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!instructores.length && !instLoading">
                    <td
                      colspan="4"
                      :style="{ color: 'var(--ink-4)' }"
                    >
                      Sin instructores. Busca un perfil arriba para dar de alta.
                    </td>
                  </tr>
                  <tr
                    v-for="p in instructores"
                    :key="p.id"
                    :class="{ 'is-selected': instSel?.id === p.id }"
                  >
                    <td :style="{ fontWeight: '500' }">
                      {{ p.nombres }} {{ p.apellido_paterno }}
                    </td>
                    <td
                      class="mono"
                      :style="{ color: 'var(--ink-3)' }"
                    >
                      {{ p.correo }}
                    </td>
                    <td>
                      <button
                        class="btn btn-ghost btn-sm"
                        @click="selInstructor(p)"
                      >
                        Cursos
                      </button>
                    </td>
                    <td>
                      <button
                        class="btn btn-ghost btn-sm"
                        :style="{ color: 'var(--primary)' }"
                        @click="
                          () =>
                            confirm('\u00bfQuitar rol de instructor a ' + p.nombres + '?') &&
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
            <div
              v-if="instSel"
              class="card"
              :style="{ padding: 'calc(var(--unit) * 2)' }"
            >
              <p class="eyebrow">
                Cursos de {{ instSel.nombres }} {{ instSel.apellido_paterno }}
              </p>
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
                  <button
                    class="btn btn-ghost btn-sm"
                    @click="quitarCursoSel(a.curso_id)"
                  >
                    Quitar
                  </button>
                </li>
              </ul>
              <div class="field">
                <label>Asignar curso</label>
                <div :style="{ display: 'flex', gap: '8px' }">
                  <select
                    v-model="instCursoSel"
                    :style="{ flex: '1' }"
                  >
                    <option
                      value=""
                      disabled
                    >
                      Selecciona un curso…
                    </option>
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

      <template v-else-if="activeSection === 'constancias'">
        <div class="admin-content fade-in admin-centered">
          <p class="eyebrow">
            Constancias emitidas
          </p>
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

      <template v-else-if="activeSection === 'reportes'">
        <div class="admin-content fade-in">
          <div class="admin-content-header">
            <div>
              <p class="eyebrow">
                An&aacute;lisis
              </p>
              <h1
                class="display"
                :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
              >
                Reportes
              </h1>
            </div>
            <button
              v-if="reportRows.length"
              class="btn btn-ghost btn-sm"
              @click="exportReportCsv"
            >
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
              <span
                class="mono"
                :style="{ color: 'var(--ink-4)', minWidth: '28px' }"
              >
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
          <div
            v-if="selectedReport"
            :style="{ marginTop: 'calc(var(--unit) * 4)' }"
          >
            <div :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
              <p class="eyebrow">
                {{ selectedReport.label }}
              </p>
              <p
                class="mono"
                :style="{ color: 'var(--ink-4)', marginTop: '4px' }"
              >
                {{ reportLoading ? 'Generando\u2026' : `${reportRows.length} resultado(s)` }}
              </p>
            </div>
            <div
              v-if="reportError"
              class="publish-status publish-status-error"
            >
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
            <div
              v-else
              class="card"
              :style="{ overflow: 'auto' }"
            >
              <table class="admin-table admin-table-full">
                <thead>
                  <tr>
                    <th
                      v-for="col in reportColumns"
                      :key="col"
                      class="mono"
                    >
                      {{ col }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, i) in reportRows"
                    :key="i"
                  >
                    <td
                      v-for="col in reportColumns"
                      :key="col"
                    >
                      {{ row[col] }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="activeSection === 'config'">
        <div class="admin-content fade-in">
          <div class="admin-content-header">
            <div>
              <p class="eyebrow">
                Plataforma
              </p>
              <h1
                class="display"
                :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
              >
                Configuraci&oacute;n de la constancia
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
                globales y se aplican a partir de las pr\u00f3ximas constancias generadas.
              </p>
            </div>
          </div>
          <div
            v-if="constConfigLoading"
            class="config-card"
          >
            <span
              class="mono"
              :style="{ color: 'var(--ink-3)' }"
            >Cargando…</span>
          </div>
          <form
            v-else
            class="config-card"
            @submit.prevent="saveConstConfig"
          >
            <div class="field">
              <label for="cs-titular">Nombre del titular</label>
              <input
                id="cs-titular"
                v-model="constConfig.titular_nombre"
                type="text"
                placeholder="Ej. Dr. Juan P\u00e9rez Garc\u00eda"
                maxlength="120"
              >
            </div>
            <div class="field">
              <label for="cs-cargo">Cargo del titular</label>
              <input
                id="cs-cargo"
                v-model="constConfig.titular_cargo"
                type="text"
                placeholder="Ej. Titular de la instituci\u00f3n"
                maxlength="160"
              >
            </div>
            <div class="field">
              <label for="cs-lugar">Lugar de emisi\u00f3n</label>
              <input
                id="cs-lugar"
                v-model="constConfig.lugar"
                type="text"
                placeholder="Ej. Ciudad de M\u00e9xico"
                maxlength="80"
              >
            </div>
            <div class="config-actions">
              <button
                type="submit"
                class="btn btn-primary"
                :disabled="constConfigSaving"
              >
                <template v-if="constConfigSaving">
                  Guardando…
                </template>
                <template v-else>
                  Guardar cambios <IconSet name="arrow" />
                </template>
              </button>
              <span
                v-if="constConfigMsg"
                class="mono config-msg"
              >{{ constConfigMsg }}</span>
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

.admin-layout.sidebar-hidden {
  grid-template-columns: 1fr;
}

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

/* ── Config card ── */
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

.btn-danger {
  color: var(--danger);
  border-color: var(--line);
}

.btn-danger:hover:not(:disabled) {
  background: rgba(138, 43, 31, 0.08);
  border-color: var(--danger);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: auto;
}
</style>
