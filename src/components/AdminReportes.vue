<script setup>
import { ref } from 'vue'
import IconSet from '@/components/IconSet.vue'
import FunnelChart from '@/components/FunnelChart.vue'
import RetentionMatrix from '@/components/RetentionMatrix.vue'
import CourseComparisonTable from '@/components/CourseComparisonTable.vue'
import CostosDashboard from './CostosDashboard.vue'
import InscripcionesTimeline from './InscripcionesTimeline.vue'
import ReporteFavoritosManager from './ReporteFavoritosManager.vue'
import ReporteProgramadoForm from './ReporteProgramadoForm.vue'
import ReporteProgramadoList from './ReporteProgramadoList.vue'
import { useReportes } from '@/composables/useReportes.js'
import { sbSelect } from '@/lib/sbRest'
import { formatearDuracion } from '@/services/tiempo'

const props = defineProps({
  session: { type: Object, default: null },
})

const {
  funnel,
  retencion,
  comparativa,
  costos,
  inscripcionesTiempo,
  cursosPopulares,
  favoritos,
  programados,
  loading,
  error,
  cargarTodo,
  cargarProgramados,
} = useReportes()

const tabs = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'retencion', label: 'Retención' },
  { key: 'comparativa', label: 'Comparativa' },
  { key: 'financieros', label: 'Financieros' },
  { key: 'personalizados', label: 'Personalizados' },
]
const activeTab = ref('resumen')

const filterCursoId = ref('')
const filterDesde = ref('')
const filterHasta = ref('')

async function aplicarFiltros() {
  if (!props.session?.access_token) return
  await cargarTodo(
    filterCursoId.value || null,
    filterDesde.value || null,
    filterHasta.value || null
  )
}

async function recargarProgramados() {
  await cargarProgramados()
}

const reportTypes = [
  { key: 'inscripciones-dep', label: 'Inscripciones por dependencia' },
  { key: 'avance-periodo', label: 'Avance de cursos por periodo' },
  { key: 'constancias-mes', label: 'Constancias emitidas mensual' },
  { key: 'tasa-curso', label: 'Tasa de aprobación por curso' },
  { key: 'horas-acumuladas', label: 'Horas de capacitación acumuladas' },
  { key: 'usuarios-actividad', label: 'Usuarios activos vs inactivos' },
  { key: 'top-lecciones', label: 'Top lecciones más vistas' },
  { key: 'tiempo-curso', label: 'Tiempo activo por usuario/curso' },
]

const selectedReport = ref(null)
const reportLoading = ref(false)
const reportError = ref(null)
const reportRows = ref([])
const reportColumns = ref([])

async function runReport(report) {
  if (!props.session?.access_token) {
    reportError.value = 'Necesitas iniciar sesión.'
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

// Los ocho informes se resuelven con un GROUP BY en la base.
//
// Antes cada uno descargaba `limit=10000` filas crudas y agregaba en el
// navegador: ~80 000 filas para producir unas cien. Peor que el coste era la
// corrección — al superar ese límite, los informes empezaban a mentir en
// silencio, sin que nada lo indicara. Las vistas viven en la migración 004 y
// heredan la RLS de sus tablas (security_invoker), así que no abren ninguna
// puerta nueva.

const pct = (v) => (v == null ? '—' : `${v}%`)

async function reportInscripcionesDep(t) {
  const { data } = await sbSelect('v_reporte_inscripciones_dependencia?select=*', t)
  return { columns: ['dependencia', 'siglas', 'inscripciones'], rows: data || [] }
}

async function reportAvancePeriodo(t) {
  const { data } = await sbSelect('v_reporte_inscripciones_mes?select=*&order=mes.asc', t)
  return { columns: ['mes', 'inscripciones'], rows: data || [] }
}

async function reportConstanciasMes(t) {
  const { data } = await sbSelect('v_reporte_constancias_mes?select=*&order=mes.asc', t)
  return { columns: ['mes', 'constancias'], rows: data || [] }
}

async function reportTasaCurso(t) {
  const { data } = await sbSelect('v_reporte_tasa_curso?select=*&order=inscritos.desc', t)
  const rows = (data || []).map((r) => ({
    curso: r.curso,
    nivel: r.nivel,
    inscritos: r.inscritos,
    constancias: r.constancias,
    tasa: pct(r.tasa_pct),
  }))
  return { columns: ['curso', 'nivel', 'inscritos', 'constancias', 'tasa'], rows }
}

async function reportHoras(t) {
  const { data } = await sbSelect('v_reporte_horas_usuario?select=*&order=horas.desc', t)
  return { columns: ['usuario', 'dependencia', 'horas'], rows: data || [] }
}

async function reportUsuariosActividad(t) {
  const { data } = await sbSelect('v_reporte_usuarios_actividad?select=*&order=orden.asc', t)
  const rows = (data || []).map((r) => ({
    categoria: r.categoria,
    cantidad: r.cantidad,
    porcentaje: pct(r.porcentaje),
  }))
  return { columns: ['categoria', 'cantidad', 'porcentaje'], rows }
}

async function reportTopLecciones(t) {
  // El corte a 15 lo hace la base: antes se traían 10 000 filas para quedarse
  // con quince.
  const { data } = await sbSelect('v_reporte_top_lecciones?select=*&order=vistas.desc&limit=15', t)
  return { columns: ['leccion', 'curso', 'vistas'], rows: data || [] }
}

async function reportTiempoCurso(t) {
  const { data } = await sbSelect(
    'v_reporte_tiempo_curso?select=*&order=segundos_activos.desc&limit=500',
    t
  )
  const rows = (data || []).map((r) => ({
    usuario: r.usuario,
    dependencia: r.dependencia,
    curso: r.curso,
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
        <p class="eyebrow">Análisis</p>
        <h1
          class="display"
          :style="{ fontSize: 'var(--text-3xl)', color: 'var(--ink)', marginTop: '4px' }"
        >
          Reportes
        </h1>
      </div>
      <button
        v-if="reportRows.length && activeTab === 'resumen'"
        class="btn btn-ghost btn-sm"
        @click="exportReportCsv"
      >
        Descargar CSV
        <IconSet name="arrow" />
      </button>
    </div>

    <!-- Tabs -->
    <div
      :style="{
        display: 'flex',
        gap: 'calc(var(--unit) * 1)',
        borderBottom: '1px solid var(--line)',
        marginBottom: 'calc(var(--unit) * 3)',
      }"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="btn btn-sm"
        :class="{ 'btn-primary': activeTab === tab.key, 'btn-ghost': activeTab !== tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Filters -->
    <div
      v-if="activeTab !== 'resumen'"
      :style="{
        display: 'flex',
        gap: 'calc(var(--unit) * 2)',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        marginBottom: 'calc(var(--unit) * 3)',
      }"
    >
      <div class="field" :style="{ minWidth: '180px' }">
        <label for="filter-curso">Curso ID</label>
        <input id="filter-curso" v-model="filterCursoId" type="text" placeholder="uuid del curso" />
      </div>
      <div class="field" :style="{ minWidth: '160px' }">
        <label for="filter-desde">Desde</label>
        <input id="filter-desde" v-model="filterDesde" type="date" />
      </div>
      <div class="field" :style="{ minWidth: '160px' }">
        <label for="filter-hasta">Hasta</label>
        <input id="filter-hasta" v-model="filterHasta" type="date" />
      </div>
      <button class="btn btn-primary btn-sm" @click="aplicarFiltros">Aplicar</button>
    </div>

    <!-- Resumen tab -->
    <div v-if="activeTab === 'resumen'">
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
            :style="{ color: 'var(--ink-2)', fontSize: 'var(--text-sm)', letterSpacing: '0.04em' }"
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
            {{ reportLoading ? 'Generando…' : `${reportRows.length} resultado(s)` }}
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

    <!-- Funnel tab -->
    <div v-else-if="activeTab === 'funnel'">
      <div
        v-if="error.funnel"
        class="publish-status publish-status-error"
        :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
      >
        {{ error.funnel }}
      </div>
      <div
        v-else-if="loading.funnel"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        Cargando funnel&hellip;
      </div>
      <FunnelChart v-else :data="funnel" />
    </div>

    <!-- Retención tab -->
    <div v-else-if="activeTab === 'retencion'">
      <div
        v-if="error.retencion"
        class="publish-status publish-status-error"
        :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
      >
        {{ error.retencion }}
      </div>
      <div
        v-else-if="loading.retencion"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        Cargando retención&hellip;
      </div>
      <RetentionMatrix v-else :data="retencion" />
    </div>

    <!-- Comparativa tab -->
    <div v-else-if="activeTab === 'comparativa'">
      <div
        v-if="error.comparativa"
        class="publish-status publish-status-error"
        :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
      >
        {{ error.comparativa }}
      </div>
      <div
        v-else-if="loading.comparativa"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        Cargando comparativa&hellip;
      </div>
      <CourseComparisonTable v-else :data="comparativa" />
    </div>

    <!-- Financieros tab -->
    <div v-else-if="activeTab === 'financieros'" class="tab-content">
      <p class="eyebrow">Costos de infraestructura</p>
      <div v-if="loading.costos" class="skeleton">Cargando...</div>
      <div v-else-if="error.costos" class="error">
        {{ error.costos }}
      </div>
      <CostosDashboard v-else-if="costos" :data="costos" />

      <p class="eyebrow" style="margin-top: calc(var(--unit) * 3)">Inscripciones por tiempo</p>
      <div v-if="loading.inscripcionesTiempo" class="skeleton">Cargando...</div>
      <div v-else-if="error.inscripcionesTiempo" class="error">
        {{ error.inscripcionesTiempo }}
      </div>
      <InscripcionesTimeline v-else-if="inscripcionesTiempo.length" :data="inscripcionesTiempo" />
      <p v-else class="caption">Sin datos de inscripciones.</p>
    </div>

    <!-- Personalizados tab -->
    <div v-else-if="activeTab === 'personalizados'" class="tab-content">
      <ReporteFavoritosManager />
      <ReporteProgramadoList />
      <ReporteProgramadoForm @guardado="recargarProgramados" />
    </div>
  </div>
</template>
