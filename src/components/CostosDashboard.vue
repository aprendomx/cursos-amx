<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    default: () => ({
      almacenamiento_videos_gb: 0,
      almacenamiento_docs_gb: 0,
      total_tokens: 0,
      costo_total_estimado_usd: 0,
    }),
  },
})

const metrics = [
  {
    key: 'almacenamiento_videos_gb',
    label: 'Almacenamiento videos',
    unit: 'GB',
    color: 'var(--primary)',
  },
  {
    key: 'almacenamiento_docs_gb',
    label: 'Almacenamiento documentos',
    unit: 'GB',
    color: 'var(--success)',
  },
  {
    key: 'total_tokens',
    label: 'Tokens consumidos',
    unit: 'tokens',
    color: 'var(--warning)',
  },
  {
    key: 'costo_total_estimado_usd',
    label: 'Costo estimado',
    unit: 'USD',
    color: 'var(--error)',
  },
]

function formatValue(key, value) {
  if (key === 'costo_total_estimado_usd') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value || 0)
  }
  return new Intl.NumberFormat('es-MX').format(value || 0)
}
</script>

<template>
  <div
    :style="{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 'calc(var(--unit) * 3)',
    }"
  >
    <div
      v-for="metric in metrics"
      :key="metric.key"
      class="card"
      :style="{ padding: 'calc(var(--unit) * 3)' }"
    >
      <div
        :style="{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: metric.color,
          marginBottom: 'calc(var(--unit) * 1.5)',
        }"
      />
      <p
        class="caption"
        :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
      >
        {{ metric.label }}
      </p>
      <p class="h4" :style="{ marginBottom: '4px' }">
        {{ formatValue(metric.key, props.data[metric.key]) }}
      </p>
      <p class="mono" :style="{ color: 'var(--ink-4)', fontSize: '12px' }">
        {{ metric.unit }}
      </p>
    </div>
  </div>
</template>
