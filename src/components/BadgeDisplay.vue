<script setup>
import { computed } from 'vue'

const props = defineProps({
  badge: { type: Object, required: true },
  desbloqueado: { type: Boolean, default: false },
})

const iconSvg = computed(() => {
  return props.badge.icono_svg || defaultBadgeIcon()
})

function defaultBadgeIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`
}
</script>

<template>
  <div
    class="badge-card"
    :class="{ locked: !desbloqueado }"
    data-test="badge-display"
  >
    <div
      class="badge-icon"
      v-html="iconSvg"
    />
    <div class="badge-info">
      <h4 class="badge-name">
        {{ badge.nombre }}
      </h4>
      <p class="badge-description">
        {{ badge.descripcion }}
      </p>
      <span class="badge-points">{{ badge.puntos_otorga }} pts</span>
    </div>
  </div>
</template>

<style scoped>
.badge-card {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 2);
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--brand-secondary-soft);
  transition: all 220ms var(--ease);
}
.badge-card.locked {
  opacity: 0.4;
  filter: grayscale(100%);
  background: var(--paper-2);
}
.badge-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  color: var(--brand-secondary);
}
.badge-icon :deep(svg) {
  width: 100%;
  height: 100%;
}
.badge-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.badge-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}
.badge-description {
  margin: 0;
  font-size: 13px;
  color: var(--ink-3);
  line-height: 1.4;
}
.badge-points {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--brand-secondary);
}
</style>
