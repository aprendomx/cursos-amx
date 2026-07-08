<script setup>
const props = defineProps({
  stats: {
    type: Object,
    default: () => ({}),
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

function fmtHHMMSS(segundos) {
  const s = Math.max(0, Math.floor(segundos || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = []
  if (h > 0) parts.push(String(h).padStart(2, '0'))
  parts.push(String(m).padStart(2, '0'))
  parts.push(String(sec).padStart(2, '0'))
  return parts.join(':')
}

const metrics = [
  {
    key: 'vistas_unicas',
    label: 'Vistas únicas',
    format: (v) => v ?? 0,
  },
  {
    key: 'total_reproduccion_s',
    label: 'Tiempo total reproducción',
    format: (v) => fmtHHMMSS(v),
  },
  {
    key: 'terminacion_pct',
    label: 'Terminación',
    format: (v) => (v != null ? `${v.toFixed(1)}%` : '—'),
  },
  {
    key: 'abandonos',
    label: 'Abandonos',
    format: (v) => v ?? 0,
  },
  {
    key: 'avg_tiempo_visto_s',
    label: 'Tiempo promedio visto',
    format: (v) => fmtHHMMSS(v),
  },
  {
    key: 'max_tiempo_visto_s',
    label: 'Tiempo máximo visto',
    format: (v) => fmtHHMMSS(v),
  },
]

const hasStats = () => {
  return props.stats && Object.keys(props.stats).length > 0
}
</script>

<template>
  <div class="card">
    <div class="stats-header">
      <p class="eyebrow">Estadísticas de video</p>
    </div>

    <div v-if="loading" class="stats-grid">
      <div v-for="n in 6" :key="n" class="metric-item">
        <div class="skeleton skeleton-label" />
        <div class="skeleton skeleton-value" />
      </div>
    </div>

    <div v-else-if="hasStats()" class="stats-grid">
      <div v-for="m in metrics" :key="m.key" class="metric-item">
        <span class="metric-label">{{ m.label }}</span>
        <span class="metric-value mono">{{ m.format(stats[m.key]) }}</span>
      </div>
    </div>

    <p v-else class="empty-state">Sin datos</p>
  </div>
</template>

<style scoped>
.stats-header {
  padding: calc(var(--unit) * 2.5);
  border-bottom: 1px solid var(--line);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--unit) * 2.5);
  padding: calc(var(--unit) * 2.5);
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 0.75);
}

.metric-label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.metric-value {
  font-size: 18px;
  color: var(--ink);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.empty-state {
  padding: calc(var(--unit) * 2.5);
  color: var(--ink-3);
  font-size: 13px;
}

.skeleton {
  background: var(--paper-3);
  border-radius: 2px;
  animation: pulse 1.6s ease-in-out infinite;
}

.skeleton-label {
  width: 70%;
  height: 12px;
}

.skeleton-value {
  width: 50%;
  height: 22px;
}

@media (max-width: 720px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
