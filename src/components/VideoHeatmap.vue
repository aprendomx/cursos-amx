<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: Array, default: () => [] },
  duracionTotal: { type: Number, default: 0 },
})

const maxVistas = computed(() => {
  if (!props.data.length) return 1
  return Math.max(...props.data.map((d) => d.vistas_unicas ?? 0), 1)
})

function barOpacity(vistas) {
  const ratio = (vistas ?? 0) / maxVistas.value
  return 0.2 + ratio * 0.8
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const timeLabels = computed(() => {
  const total = props.duracionTotal
  if (!total) return []
  return [
    { label: formatTime(0), pct: 0 },
    { label: formatTime(total / 2), pct: 50 },
    { label: formatTime(total), pct: 100 },
  ]
})
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Intensidad de visualización</p>
    </div>
    <div :style="{ padding: 'calc(var(--unit) * 2.5)' }">
      <div v-if="data.length" class="heatmap-track">
        <div
          v-for="bucket in data"
          :key="bucket.intervalo_inicio"
          class="heatmap-bar"
          :style="{
            opacity: barOpacity(bucket.vistas_unicas),
            background: 'var(--primary)',
          }"
          :title="`${formatTime(bucket.intervalo_inicio)} – vistas: ${bucket.vistas_unicas ?? 0}, abandonos: ${bucket.abandonos ?? 0}`"
        />
      </div>
      <p
        v-else
        :style="{
          color: 'var(--ink-3)',
          fontSize: '13px',
        }"
      >
        Sin datos de visualización.
      </p>
      <div v-if="timeLabels.length" class="heatmap-labels">
        <span
          v-for="t in timeLabels"
          :key="t.pct"
          class="mono"
          :style="{ color: 'var(--ink-3)', fontSize: '12px' }"
        >
          {{ t.label }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.heatmap-track {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 48px;
}
.heatmap-bar {
  flex: 1;
  height: 100%;
  border-radius: 2px;
  min-width: 4px;
  transition: opacity 200ms var(--ease);
}
.heatmap-labels {
  display: flex;
  justify-content: space-between;
  margin-top: calc(var(--unit) * 1);
}
</style>
