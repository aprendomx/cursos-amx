<script setup>
import { computed } from 'vue'

const props = defineProps({
  modulos: { type: Array, default: () => [] },
  progresoModulos: { type: Object, default: () => ({}) },
  condiciones: { type: Object, default: () => ({}) },
})

function estadoModulo(modulo) {
  const prog = props.progresoModulos[modulo.id]
  if (prog >= 100) return 'completed'
  if (prog > 0) return 'in-progress'
  return 'locked'
}

function progreso(modulo) {
  return props.progresoModulos[modulo.id] || 0
}

function bloqueado(modulo, index) {
  if (index === 0) return false
  const prev = props.modulos[index - 1]
  return estadoModulo(prev) !== 'completed'
}

const modulosConEstado = computed(() => {
  return props.modulos.map((m, i) => ({
    ...m,
    estado: bloqueado(m, i) ? 'locked' : estadoModulo(m),
    progreso: progreso(m),
  }))
})
</script>

<template>
  <div
    class="unlock-tree"
    data-test="unlock-tree"
  >
    <div
      v-for="(mod, index) in modulosConEstado"
      :key="mod.id"
      class="unlock-node"
      :class="mod.estado"
    >
      <div class="unlock-connector">
        <div
          v-if="index > 0"
          class="unlock-line"
          :class="{ active: mod.estado !== 'locked' }"
        />
      </div>
      <div class="unlock-card">
        <div class="unlock-status">
          <span
            v-if="mod.estado === 'completed'"
            class="unlock-icon unlock-check"
          >✓</span>
          <span
            v-else-if="mod.estado === 'locked'"
            class="unlock-icon unlock-lock"
          >🔒</span>
          <span
            v-else
            class="unlock-icon unlock-progress"
          >{{ Math.round(mod.progreso) }}%</span>
        </div>
        <div class="unlock-info">
          <span class="unlock-title">{{ mod.titulo || `Módulo ${index + 1}` }}</span>
          <span
            v-if="mod.estado === 'in-progress'"
            class="unlock-sub"
          >En progreso</span>
          <span
            v-else-if="mod.estado === 'locked'"
            class="unlock-sub"
          >Bloqueado</span>
          <span
            v-else
            class="unlock-sub unlock-done"
          >Completado</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unlock-tree {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: calc(var(--unit) * 1) 0;
}
.unlock-node {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 1.5);
  position: relative;
}
.unlock-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
  flex-shrink: 0;
}
.unlock-line {
  width: 2px;
  height: 24px;
  background: var(--line);
  margin-bottom: 4px;
  transition: background 220ms var(--ease);
}
.unlock-line.active {
  background: var(--brand-secondary);
}
.unlock-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 1.5);
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 2);
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  transition: all 220ms var(--ease);
  min-width: 0;
}
.unlock-node.completed .unlock-card {
  border-color: var(--brand-secondary);
  background: var(--brand-secondary-soft);
}
.unlock-node.locked .unlock-card {
  opacity: 0.5;
  background: var(--paper-2);
}
.unlock-status {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
}
.unlock-node.completed .unlock-status {
  background: var(--brand-secondary);
  color: var(--paper);
}
.unlock-node.locked .unlock-status {
  background: var(--paper-3);
  color: var(--ink-3);
}
.unlock-node.in-progress .unlock-status {
  background: var(--brand-accent-soft);
  color: var(--brand-accent);
}
.unlock-icon {
  line-height: 1;
}
.unlock-check {
  font-size: 16px;
}
.unlock-lock {
  font-size: 14px;
}
.unlock-progress {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.04em;
}
.unlock-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.unlock-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unlock-sub {
  font-size: 12px;
  color: var(--ink-3);
}
.unlock-done {
  color: var(--brand-secondary);
  font-weight: 500;
}
</style>
