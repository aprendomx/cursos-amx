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

// El degradado iba de rgb(59,130,246) a rgb(34,197,94) —un azul y un verde
// fijos— así que el embudo ignoraba por completo los colores de la
// institución. Ahora interpola entre el primario y el secundario del tema,
// mezclándolos en CSS para no tener que leer los valores en JS.
function stageColor(index) {
  const t = Math.round((index / (stages.length - 1)) * 100)
  return `color-mix(in srgb, var(--brand-secondary) ${t}%, var(--primary))`
}

// Resumen para lectores de pantalla. Las filas ya exponen etiqueta y valor como
// texto, así que el dato es alcanzable; esto añade la lectura de conjunto, que
// es lo que un gráfico comunica de un vistazo y una lista de números no.
const resumenAccesible = computed(() => {
  const primera = stages[0]
  const ultima = stages[stages.length - 1]
  const ini = stageValue(primera.key)
  const fin = stageValue(ultima.key)
  const pct = ini ? ((fin / ini) * 100).toFixed(1) : '0.0'
  return (
    `Embudo de conversión: de ${ini} ${primera.label.toLowerCase()} a ${fin} ` +
    `${ultima.label.toLowerCase()}, un ${pct} por ciento. ` +
    stages.map((s) => `${s.label}: ${stageValue(s.key)}`).join('. ') +
    '.'
  )
})
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }" role="img" :aria-label="resumenAccesible">
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
          <span class="mono" :style="{ color: 'var(--ink-2)', fontSize: 'var(--text-sm)' }">
            {{ stage.label }}
          </span>
          <span class="mono" :style="{ color: 'var(--ink-4)', fontSize: 'var(--text-xs)' }">
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
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.funnel-bar-fill {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width 500ms var(--ease);
}
</style>
