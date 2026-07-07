<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    default: () => ({
      visitantes: 0,
      registrados: 0,
      inscritos: 0,
      activos: 0,
      completados: 0,
      conversiones: 0,
    }),
  },
})

const stages = [
  { key: 'visitantes', label: 'Visitantes' },
  { key: 'registrados', label: 'Registrados' },
  { key: 'inscritos', label: 'Inscritos' },
  { key: 'activos', label: 'Activos' },
  { key: 'completados', label: 'Completados' },
]

const maxValue = computed(() => {
  return Math.max(...stages.map((s) => props.data[s.key] ?? 0), 1)
})

function stageValue(key) {
  return props.data[key] ?? 0
}

function barWidth(key) {
  return (stageValue(key) / maxValue.value) * 100
}

function conversionPct(index) {
  if (index === 0) return null
  const prev = stageValue(stages[index - 1].key)
  const curr = stageValue(stages[index].key)
  if (!prev) return '0.0'
  return ((curr / prev) * 100).toFixed(1)
}

function stageColor(index) {
  const t = index / (stages.length - 1)
  const r = Math.round(59 + (34 - 59) * t)
  const g = Math.round(130 + (197 - 130) * t)
  const b = Math.round(246 + (94 - 246) * t)
  return `rgb(${r}, ${g}, ${b})`
}
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Embudo de conversión</p>
    </div>
    <div :style="{ padding: 'calc(var(--unit) * 2.5)' }">
      <div
        v-for="(stage, i) in stages"
        :key="stage.key"
        class="funnel-row"
        :style="{ marginBottom: i < stages.length - 1 ? 'calc(var(--unit) * 1.5)' : '0' }"
      >
        <div class="funnel-label">
          <span class="mono" :style="{ color: 'var(--ink-2)', fontSize: '13px' }">
            {{ stage.label }}
          </span>
          <span class="mono" :style="{ color: 'var(--ink-4)', fontSize: '12px' }">
            {{ stageValue(stage.key) }}
            <template v-if="conversionPct(i) !== null"> ({{ conversionPct(i) }}%) </template>
          </span>
        </div>
        <div class="funnel-bar-track">
          <div
            class="funnel-bar-fill"
            :style="{
              width: `${barWidth(stage.key)}%`,
              background: stageColor(i),
            }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.funnel-row {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 0.75);
}
.funnel-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.funnel-bar-track {
  width: 100%;
  height: 8px;
  background: var(--paper-3);
  border-radius: 4px;
  overflow: hidden;
}
.funnel-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 500ms var(--ease);
}
</style>
