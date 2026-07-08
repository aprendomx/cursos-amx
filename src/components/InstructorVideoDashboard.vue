<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { cargarStatsCurso } from '@/services/videoAnalytics.js'
import { formatearDuracion } from '@/services/tiempo.js'

/* ── state ── */
const cursos = ref([
  { id: 'c1', titulo: 'Curso Ejemplo 1' },
  { id: 'c2', titulo: 'Curso Ejemplo 2' },
])
const cursoSeleccionado = ref('')
const stats = ref([])
const loading = ref(false)
const error = ref(null)
const sortKey = ref('leccion_titulo')
const sortDir = ref('asc')
const page = ref(1)
const perPage = 10

/* ── computed ── */
const lecciones = computed(() => {
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...stats.value].sort((a, b) => {
    const av = a[key] ?? 0
    const bv = b[key] ?? 0
    if (typeof av === 'string' && typeof bv === 'string') {
      return dir * av.localeCompare(bv)
    }
    return dir * (av < bv ? -1 : av > bv ? 1 : 0)
  })
})

const paginated = computed(() => {
  const start = (page.value - 1) * perPage
  return lecciones.value.slice(start, start + perPage)
})

const totalPages = computed(() => Math.max(1, Math.ceil(lecciones.value.length / perPage)))

const aggregate = computed(() => {
  if (!stats.value.length) {
    return {
      vistasUnicas: 0,
      avgCompletitud: 0,
      abandonos: 0,
      watchTimeSeg: 0,
    }
  }
  const vistasUnicas = stats.value.reduce((sum, r) => sum + (r.total_vistas_unicas ?? 0), 0)
  const avgCompletitud =
    stats.value.reduce((sum, r) => sum + (r.tasa_completitud_pct ?? 0), 0) / stats.value.length
  const abandonos = Math.round(
    stats.value.reduce(
      (sum, r) => sum + (r.total_vistas_unicas ?? 0) * ((r.tasa_abandono_pct ?? 0) / 100),
      0
    )
  )
  const watchTimeSeg = stats.value.reduce((sum, r) => sum + (r.total_segundos_vistos ?? 0), 0)
  return { vistasUnicas, avgCompletitud, abandonos, watchTimeSeg }
})

/* ── methods ── */
async function fetchStats() {
  if (!cursoSeleccionado.value) {
    stats.value = []
    return
  }
  loading.value = true
  error.value = null
  try {
    const data = await cargarStatsCurso(cursoSeleccionado.value)
    stats.value = data
    page.value = 1
  } catch (e) {
    error.value = e?.message || 'Error al cargar estadísticas'
    stats.value = []
  } finally {
    loading.value = false
  }
}

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

function sortIndicator(key) {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'asc' ? ' ▲' : ' ▼'
}

/* ── lifecycle ── */
watch(cursoSeleccionado, fetchStats)
onMounted(() => {
  if (cursos.value.length && !cursoSeleccionado.value) {
    cursoSeleccionado.value = cursos.value[0].id
  }
})

const columns = [
  { key: 'leccion_titulo', label: 'Lección', align: 'left' },
  { key: 'total_vistas_unicas', label: 'Vistas', align: 'right' },
  { key: 'tiempo_promedio_visto', label: 'Tiempo promedio', align: 'right' },
  { key: 'tasa_completitud_pct', label: 'Completitud %', align: 'right' },
  { key: 'tasa_abandono_pct', label: 'Abandono %', align: 'right' },
]
</script>

<template>
  <div class="admin-content fade-in">
    <!-- Header -->
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Videos</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
          Analytics de video
        </h1>
      </div>
    </div>

    <!-- Course selector -->
    <div class="field" :style="{ minWidth: '240px', marginBottom: 'calc(var(--unit) * 3)' }">
      <label for="curso-video-select">Curso</label>
      <select id="curso-video-select" v-model="cursoSeleccionado" data-test="course-select">
        <option value="">— Seleccionar curso —</option>
        <option v-for="c in cursos" :key="c.id" :value="c.id">
          {{ c.titulo }}
        </option>
      </select>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="card"
      :style="{
        padding: 'calc(var(--unit) * 4)',
        textAlign: 'center',
        color: 'var(--ink-3)',
      }"
      data-test="loading-state"
    >
      Cargando datos…
    </div>

    <!-- Error -->
    <div v-else-if="error" class="publish-status publish-status-error">
      {{ error }}
    </div>

    <template v-else>
      <!-- Stats overview -->
      <div
        :style="{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'calc(var(--unit) * 3)',
          marginBottom: 'calc(var(--unit) * 3)',
        }"
      >
        <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
          <p
            class="caption"
            :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
          >
            Vistas únicas
          </p>
          <p class="h4">
            {{ aggregate.vistasUnicas }}
          </p>
        </div>
        <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
          <p
            class="caption"
            :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
          >
            Completitud promedio
          </p>
          <p class="h4">{{ aggregate.avgCompletitud.toFixed(1) }}%</p>
        </div>
        <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
          <p
            class="caption"
            :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
          >
            Abandonos
          </p>
          <p class="h4">
            {{ aggregate.abandonos }}
          </p>
        </div>
        <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
          <p
            class="caption"
            :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
          >
            Tiempo total visto
          </p>
          <p class="h4">
            {{ formatearDuracion(aggregate.watchTimeSeg) }}
          </p>
        </div>
      </div>

      <!-- Lessons table -->
      <div class="card" :style="{ overflow: 'auto' }">
        <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
          <p class="eyebrow">Lecciones con video</p>
        </div>
        <table v-if="paginated.length" class="admin-table admin-table-full">
          <thead>
            <tr>
              <th
                v-for="col in columns"
                :key="col.key"
                class="mono sortable-header"
                :class="{ 'sort-active': sortKey === col.key }"
                :style="{ textAlign: col.align }"
                @click="toggleSort(col.key)"
              >
                {{ col.label }}{{ sortIndicator(col.key) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginated" :key="row.leccion_id">
              <td>
                <span :style="{ fontWeight: '500' }">{{ row.leccion_titulo }}</span>
              </td>
              <td :style="{ textAlign: 'right' }">
                {{ row.total_vistas_unicas ?? 0 }}
              </td>
              <td class="mono" :style="{ textAlign: 'right' }">
                {{
                  row.total_vistas_unicas
                    ? formatearDuracion(
                        Math.round((row.total_segundos_vistos ?? 0) / row.total_vistas_unicas)
                      )
                    : '—'
                }}
              </td>
              <td :style="{ textAlign: 'right' }">
                <span
                  class="mono"
                  :style="{
                    color:
                      (row.tasa_completitud_pct ?? 100) < 50 ? 'var(--danger)' : 'var(--ink-2)',
                  }"
                >
                  {{
                    row.tasa_completitud_pct != null
                      ? row.tasa_completitud_pct.toFixed(1) + '%'
                      : '—'
                  }}
                </span>
              </td>
              <td :style="{ textAlign: 'right' }">
                <span
                  class="mono"
                  :style="{
                    color: (row.tasa_abandono_pct ?? 0) > 30 ? 'var(--danger)' : 'var(--ink-2)',
                  }"
                >
                  {{ row.tasa_abandono_pct != null ? row.tasa_abandono_pct.toFixed(1) + '%' : '—' }}
                </span>
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
          Sin datos de lecciones con video.
        </p>

        <!-- Pagination -->
        <div
          v-if="totalPages > 1"
          :style="{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'calc(var(--unit) * 1.5)',
            padding: 'calc(var(--unit) * 2)',
            borderTop: '1px solid var(--line)',
          }"
        >
          <button class="btn btn-ghost btn-sm" :disabled="page === 1" @click="page--">
            ← Anterior
          </button>
          <span class="mono" :style="{ fontSize: '13px', color: 'var(--ink-3)' }">
            Página {{ page }} de {{ totalPages }}
          </span>
          <button class="btn btn-ghost btn-sm" :disabled="page === totalPages" @click="page++">
            Siguiente →
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sortable-header {
  cursor: pointer;
  user-select: none;
  transition: color 150ms var(--ease);
}
.sortable-header:hover {
  color: var(--primary);
}
.sort-active {
  color: var(--primary);
}
</style>
