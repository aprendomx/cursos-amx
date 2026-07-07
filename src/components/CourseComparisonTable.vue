<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  data: {
    type: Array,
    default: () => [],
  },
})

const sortKey = ref('total_inscritos')
const sortDir = ref('desc')

const columns = [
  { key: 'curso_titulo', label: 'Curso', align: 'left' },
  { key: 'total_inscritos', label: 'Inscritos', align: 'right' },
  { key: 'total_completados', label: 'Completados', align: 'right' },
  { key: 'tasa_finalizacion', label: 'Finalización %', align: 'right' },
  { key: 'engagement_promedio', label: 'Engagement', align: 'right' },
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

const topThreeIds = computed(() => {
  const byCompletion = [...props.data]
    .sort((a, b) => (b.tasa_finalizacion ?? 0) - (a.tasa_finalizacion ?? 0))
    .slice(0, 3)
    .map((d) => d.curso_id)
  return byCompletion
})

function badgeForRow(row) {
  const idx = topThreeIds.value.indexOf(row.curso_id)
  if (idx === 0) return '🥇'
  if (idx === 1) return '🥈'
  if (idx === 2) return '🥉'
  return ''
}

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
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Comparativa de cursos</p>
    </div>
    <table v-if="data.length" class="admin-table admin-table-full">
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            class="mono sortable-header"
            :class="{ 'sort-active': sortKey === col.key }"
            @click="toggleSort(col.key)"
          >
            {{ col.label }}{{ sortIndicator(col.key) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sortedData" :key="row.curso_id">
          <td>
            <div :style="{ display: 'flex', alignItems: 'center', gap: '6px' }">
              <span :style="{ fontWeight: '500' }">{{ row.curso_titulo }}</span>
              <span v-if="badgeForRow(row)" :style="{ fontSize: '16px' }">
                {{ badgeForRow(row) }}
              </span>
            </div>
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.total_inscritos ?? 0 }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.total_completados ?? 0 }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.tasa_finalizacion != null ? row.tasa_finalizacion.toFixed(1) + '%' : '—' }}
          </td>
          <td :style="{ textAlign: 'right' }">
            {{ row.engagement_promedio != null ? row.engagement_promedio.toFixed(1) : '—' }}
          </td>
          <td :style="{ textAlign: 'right' }">
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
      Sin datos de comparativa.
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
