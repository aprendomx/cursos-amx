<script setup>
import { ref, computed } from 'vue'
import ProgressBar from '@/components/ProgressBar.vue'
import { formatearDuracion } from '@/services/tiempo'

const props = defineProps({
  data: {
    type: Array,
    default: () => [],
  },
})

const sortKey = ref('nombres_completos')
const sortDir = ref('asc')

const columns = [
  { key: 'nombres_completos', label: 'Alumno', align: 'left' },
  { key: 'pct_progreso', label: 'Progreso %', align: 'right' },
  { key: 'calificacion_promedio', label: 'Calificación', align: 'right' },
  { key: 'tiempo_dedicado_segundos', label: 'Tiempo visto', align: 'right' },
  { key: 'tiempo_activo_segundos', label: 'Tiempo activo', align: 'right' },
  { key: 'ultima_actividad', label: 'Última actividad', align: 'left' },
  { key: 'foros_posts', label: 'Foros', align: 'right' },
  { key: 'entregas_realizadas', label: 'Entregas', align: 'right' },
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

function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Alumnos del curso</p>
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
        <tr v-for="row in sortedData" :key="row.user_id">
          <td>
            <div :style="{ display: 'flex', flexDirection: 'column', gap: '2px' }">
              <span :style="{ fontWeight: '500' }">{{ row.nombres_completos }}</span>
              <span
                v-if="row.correo"
                class="mono"
                :style="{ color: 'var(--ink-4)', fontSize: '12px' }"
              >
                {{ row.correo }}
              </span>
            </div>
          </td>
          <td :style="{ textAlign: 'right' }">
            <div
              :style="{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: 'flex-end',
              }"
            >
              <span class="mono">{{
                row.pct_progreso != null ? row.pct_progreso.toFixed(1) + '%' : '—'
              }}</span>
              <ProgressBar :value="(row.pct_progreso ?? 0) / 100" :style="{ width: '60px' }" />
            </div>
          </td>
          <td class="mono" :style="{ textAlign: 'right' }">
            {{ row.calificacion_promedio != null ? row.calificacion_promedio.toFixed(1) : '—' }}
          </td>
          <td class="mono" :style="{ textAlign: 'right' }">
            {{ formatearDuracion(row.tiempo_dedicado_segundos) }}
          </td>
          <td class="mono" :style="{ textAlign: 'right' }">
            {{ formatearDuracion(row.tiempo_activo_segundos) }}
          </td>
          <td class="mono" :style="{ color: 'var(--ink-3)' }">
            {{ fmtFecha(row.ultima_actividad) }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.foros_posts ?? 0 }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.entregas_realizadas ?? 0 }}
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
      Sin alumnos registrados.
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
</style>
