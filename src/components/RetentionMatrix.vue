<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: {
    type: Array,
    default: () => [],
  },
})

const days = [7, 14, 30, 60, 90]

const maxRetention = computed(() => {
  let max = 0
  for (const row of props.data) {
    for (const d of days) {
      const val = row[`d${d}`] ?? 0
      const total = row.total ?? 1
      const pct = (val / total) * 100
      if (pct > max) max = pct
    }
  }
  return max || 100
})

function retentionPct(row, day) {
  const val = row[`d${day}`] ?? 0
  const total = row.total ?? 1
  return ((val / total) * 100).toFixed(1)
}

function heatColor(pct) {
  const t = maxRetention.value > 0 ? pct / maxRetention.value : 0
  const r = Math.round(239 + (34 - 239) * t)
  const g = Math.round(68 + (197 - 68) * t)
  const b = Math.round(68 + (94 - 68) * t)
  return `rgb(${r}, ${g}, ${b})`
}

function heatTextColor(pct) {
  const t = maxRetention.value > 0 ? pct / maxRetention.value : 0
  return t > 0.5 ? '#ffffff' : 'var(--ink-2)'
}
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Matriz de retención</p>
    </div>
    <table v-if="data.length" class="admin-table admin-table-full">
      <thead>
        <tr>
          <th class="mono">Cohorte</th>
          <th class="mono">Total</th>
          <th v-for="d in days" :key="d" class="mono">Día {{ d }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in data" :key="row.semana">
          <td class="mono" :style="{ color: 'var(--ink-2)' }">
            {{ row.semana }}
          </td>
          <td class="mono" :style="{ color: 'var(--ink-3)' }">
            {{ row.total ?? 0 }}
          </td>
          <td v-for="d in days" :key="d">
            <span
              class="retention-cell"
              :style="{
                background: heatColor(parseFloat(retentionPct(row, d))),
                color: heatTextColor(parseFloat(retentionPct(row, d))),
              }"
            >
              {{ retentionPct(row, d) }}%
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
      Sin datos de retención.
    </p>
  </div>
</template>

<style scoped>
.retention-cell {
  display: inline-block;
  min-width: 48px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  transition: background 200ms var(--ease);
}
</style>
