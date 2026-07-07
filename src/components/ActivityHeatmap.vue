<script setup>
const props = defineProps({
  engagement: { type: Array, default: () => [] },
})

const columns = [
  { key: 'logins', label: 'Logins' },
  { key: 'lecciones', label: 'Lecciones' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'foros', label: 'Foros' },
]

function maxValue(key) {
  const vals = props.engagement.map((d) => d[key] ?? 0)
  return Math.max(...vals, 1)
}

function cellOpacity(value, key) {
  const max = maxValue(key)
  return Math.max(0.08, (value ?? 0) / max)
}

function cellColor(value, key) {
  const baseColor =
    key === 'logins'
      ? 'var(--primary)'
      : key === 'lecciones'
        ? 'var(--success)'
        : key === 'quizzes'
          ? 'var(--warn)'
          : 'var(--brand-accent)'
  return baseColor
}
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Mapa de actividad</p>
    </div>
    <table v-if="engagement.length" class="admin-table admin-table-full">
      <thead>
        <tr>
          <th class="mono">Fecha</th>
          <th v-for="col in columns" :key="col.key" class="mono">
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in engagement" :key="row.fecha">
          <td class="mono" :style="{ color: 'var(--ink-3)' }">
            {{ row.fecha }}
          </td>
          <td v-for="col in columns" :key="col.key">
            <div
              :style="{
                width: '100%',
                height: '28px',
                borderRadius: '2px',
                background: cellColor(row[col.key], col.key),
                opacity: cellOpacity(row[col.key], col.key),
                transition: 'opacity 200ms var(--ease)',
              }"
              :title="`${col.label}: ${row[col.key] ?? 0}`"
            />
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
      Sin datos de engagement.
    </p>
  </div>
</template>
