<script setup>
import { computed } from 'vue'

const props = defineProps({
  puntos: { type: Number, default: 0 },
  nivel: { type: Object, default: () => ({}) },
  niveles: { type: Array, default: () => [] },
})

const nivelActual = computed(() => {
  return props.nivel || { puntos_totales: 0, nivel_nombre: 'Novato', color: '#6b7280' }
})

const siguienteNivel = computed(() => {
  const sorted = [...props.niveles].sort((a, b) => a.puntos_min - b.puntos_min)
  return sorted.find((n) => n.puntos_min > (nivelActual.value.puntos_totales || 0))
})

const puntosParaSiguiente = computed(() => {
  if (!siguienteNivel.value) return 0
  const necesarios = siguienteNivel.value.puntos_min - (nivelActual.value.puntos_totales || 0)
  return Math.max(0, necesarios)
})

const progreso = computed(() => {
  if (!siguienteNivel.value) return 1
  const prev = [...props.niveles]
    .sort((a, b) => a.puntos_min - b.puntos_min)
    .filter((n) => n.puntos_min <= (nivelActual.value.puntos_totales || 0))
    .pop()
  const prevMin = prev ? prev.puntos_min : 0
  const range = siguienteNivel.value.puntos_min - prevMin
  const current = (nivelActual.value.puntos_totales || 0) - prevMin
  return Math.min(Math.max(current / range, 0), 1)
})
</script>

<template>
  <div
    class="user-level-bar"
    data-test="user-level-bar"
  >
    <div class="level-header">
      <span
        class="level-name"
        :style="{ color: nivelActual.color || 'var(--ink-3)' }"
      >
        {{ nivelActual.nivel_nombre || 'Novato' }}
      </span>
      <span class="level-points">{{ nivelActual.puntos_totales || 0 }} pts</span>
    </div>
    <div class="level-progress-track">
      <div
        class="level-progress-fill"
        :style="{
          width: `${progreso * 100}%`,
          background: nivelActual.color || 'var(--brand-secondary)',
        }"
      />
    </div>
    <p
      v-if="siguienteNivel"
      class="level-next"
    >
      {{ puntosParaSiguiente }} pts para {{ siguienteNivel.nombre }}
    </p>
    <p
      v-else
      class="level-next level-max"
    >
      ¡Nivel máximo alcanzado!
    </p>
  </div>
</template>

<style scoped>
.user-level-bar {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
  padding: calc(var(--unit) * 2);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.level-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--unit) * 1);
}
.level-name {
  font-family: var(--display);
  font-weight: 500;
  font-size: 18px;
}
.level-points {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.level-progress-track {
  width: 100%;
  height: 6px;
  background: var(--paper-3);
  border-radius: 3px;
  overflow: hidden;
}
.level-progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 400ms var(--ease);
}
.level-next {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
}
.level-max {
  color: var(--brand-secondary);
  font-weight: 500;
}
</style>
