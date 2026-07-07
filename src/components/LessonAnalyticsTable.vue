<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  data: {
    type: Array,
    default: () => [],
  },
})

const sortKey = ref('leccion_titulo')
const sortDir = ref('asc')

const columns = [
  { key: 'leccion_titulo', label: 'Lección', align: 'left' },
  { key: 'modulo_titulo', label: 'Módulo', align: 'left' },
  { key: 'total_alumnos_vieron', label: 'Vieron', align: 'right' },
  { key: 'tasa_completitud', label: 'Completaron %', align: 'right' },
  { key: 'tiempo_promedio_visto_segundos', label: 'Tiempo promedio', align: 'right' },
  { key: 'total_comentarios', label: 'Comentarios', align: 'right' },
  { key: 'total_entregas', label: 'Entregas', align: 'right' },
  { key: 'total_foro_hilos', label: 'Foros', align: 'right' },
  { key: 'total_evaluaciones', label: 'Evaluaciones', align: 'right' },
  { key: 'calificacion_promedio', label: 'Calificación', align: 'right' },
]

const sortedData = computed(() => {
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...props.data].sort((a, b) => {
    const av = a[key] ?? 0
    const bv = b[key] ?? 0
    if (typeof av === 'string' && typeof bv === 'string') {
      return dir * av.localeCompare(bv)
    }
    return dir * (av < bv ? -1 : av > bv ? 1 : 0)
  })
})

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

function sortIndicator(key) {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'asc' ? ' ▲' : ' ▼'
}

function fmtMinutos(segundos) {
  const s = Math.max(0, Math.floor(segundos || 0))
  const m = Math.floor(s / 60)
  if (m > 0) return `${m}m`
  return `${s}s`
}

function isWarning(row) {
  return (row.tasa_completitud ?? 100) < 50
}
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Análisis por lección</p>
    </div>
    <table v-if="data.length" class="admin-table admin-table-full">
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
        <tr
          v-for="row in sortedData"
          :key="row.leccion_id"
          :class="{ 'row-warning': isWarning(row) }"
        >
          <td>
            <span :style="{ fontWeight: '500' }">{{ row.leccion_titulo }}</span>
          </td>
          <td :style="{ color: 'var(--ink-3)' }">
            {{ row.modulo_titulo }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.total_alumnos_vieron ?? 0 }}
          </td>
          <td :style="{ textAlign: 'right' }">
            <span
              class="mono"
              :style="{ color: isWarning(row) ? 'var(--danger)' : 'var(--ink-2)' }"
            >
              {{ row.tasa_completitud != null ? row.tasa_completitud.toFixed(1) + '%' : '—' }}
            </span>
          </td>
          <td class="mono" :style="{ textAlign: 'right' }">
            {{ fmtMinutos(row.tiempo_promedio_visto_segundos) }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.total_comentarios ?? 0 }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.total_entregas ?? 0 }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.total_foro_hilos ?? 0 }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.total_evaluaciones ?? 0 }}
          </td>
          <td class="mono" :style="{ textAlign: 'right' }">
            {{ row.calificacion_promedio != null ? row.calificacion_promedio.toFixed(1) : '—' }}
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
      Sin datos de lecciones.
    </p>
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
.row-warning td {
  background: rgba(138, 43, 31, 0.04);
}
.row-warning td:first-child {
  border-left: 3px solid var(--danger);
}
</style>
