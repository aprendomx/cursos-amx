<script setup>
import { ref } from 'vue'
import IconSet from '@/components/IconSet.vue'
import { sbSelect } from '@/lib/sbRest.js'
import { formatearDuracion } from '@/services/tiempo.js'

const props = defineProps({
  session: { type: Object, default: null },
})

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
  const { data } = await sbSelect(
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
  const { data } = await sbSelect(
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
  const { data } = await sbSelect(
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
    sbSelect('inscripciones?select=curso_id&limit=10000', t),
    sbSelect('constancias?select=curso_id&limit=10000', t),
    sbSelect('cursos?select=id,titulo,nivel&limit=1000', t),
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
  const { data } = await sbSelect(
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
    sbSelect('perfiles?select=id&limit=10000', t),
    sbSelect(`progreso?select=user_id&completado_en=gte.${since}&limit=10000`, t),
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
  const { data } = await sbSelect(
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
  const { data } = await sbSelect(
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
</script>

<template>
  <div class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">An&aacute;lisis</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
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
