<script setup>
import { computed } from 'vue'

const props = defineProps({
  rubrica: { type: Object, required: true },
  calificaciones: { type: Array, default: () => [] },
  puntajeFinal: { type: Number, default: 0 },
})

const calificacionesMap = computed(() => {
  const map = new Map()
  for (const c of props.calificaciones) {
    map.set(c.criterio_id, c)
  }
  return map
})

function puntajeColor(p) {
  if (p >= 80) return 'color: var(--success)'
  if (p >= 60) return 'color: var(--warning)'
  return 'color: var(--danger)'
}

function getNivelParaCriterio(criterioId) {
  const cal = calificacionesMap.value.get(criterioId)
  if (!cal || !cal.nivel_id) return null
  return props.rubrica.rubrica_niveles?.find((n) => n.id === cal.nivel_id)
}

function getPuntajeParaCriterio(criterioId) {
  const cal = calificacionesMap.value.get(criterioId)
  return cal?.puntaje ?? null
}

function getComentarioParaCriterio(criterioId) {
  const cal = calificacionesMap.value.get(criterioId)
  return cal?.comentario ?? ''
}
</script>

<template>
  <div class="rubrica-view card">
    <h4 class="eyebrow">Rúbrica: {{ rubrica.titulo }}</h4>

    <div v-for="c in rubrica.rubrica_criterios" :key="c.id" class="criterio-row">
      <div class="criterio-header">
        <strong>{{ c.titulo }}</strong>
        <span v-if="c.descripcion" class="text-muted"> — {{ c.descripcion }}</span>
      </div>

      <div v-if="rubrica.tipo === 'niveles'" class="niveles-row">
        <div
          v-for="n in rubrica.rubrica_niveles"
          :key="n.id"
          class="nivel-chip"
          :class="{ 'nivel-selected': getNivelParaCriterio(c.id)?.id === n.id }"
        >
          {{ n.etiqueta }} ({{ n.puntaje }})
        </div>
      </div>

      <div v-else class="puntaje-row">
        <span class="mono" :style="puntajeColor(getPuntajeParaCriterio(c.id) || 0)">
          {{ getPuntajeParaCriterio(c.id) ?? '-' }} / {{ c.puntaje_maximo }}
        </span>
      </div>

      <p v-if="getComentarioParaCriterio(c.id)" class="comentario">
        {{ getComentarioParaCriterio(c.id) }}
      </p>
    </div>

    <div class="puntaje-final">
      <strong>Puntaje final:</strong>
      <span class="display" :style="puntajeColor(puntajeFinal)">{{ puntajeFinal }}</span>
      <span class="text-muted">/ {{ rubrica.puntaje_maximo }}</span>
    </div>
  </div>
</template>

<style scoped>
.rubrica-view {
  padding: 1.5rem;
}
.criterio-row {
  margin-bottom: 1.25rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--paper-3);
}
.criterio-header {
  margin-bottom: 0.5rem;
}
.niveles-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.nivel-chip {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: var(--paper-3);
  font-size: 0.875rem;
}
.nivel-selected {
  background: var(--primary);
  color: white;
}
.puntaje-row {
  font-size: 1.125rem;
}
.comentario {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--ink-3);
  font-style: italic;
}
.puntaje-final {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.puntaje-final .display {
  font-size: 2rem;
  font-weight: 700;
}
</style>
