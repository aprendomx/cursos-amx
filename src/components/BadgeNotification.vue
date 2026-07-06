<script setup>
import { onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  badge: { type: Object, required: true },
})

const emit = defineEmits(['close'])

let showTimer = null
let hideTimer = null

onMounted(() => {
  showTimer = setTimeout(() => {
    hideTimer = setTimeout(() => {
      emit('close')
    }, 5000)
  }, 100)
})

onBeforeUnmount(() => {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
})

function dismiss() {
  clearTimeout(hideTimer)
  emit('close')
}
</script>

<template>
  <div
    class="badge-notification"
    role="status"
    aria-live="polite"
    data-test="badge-notification"
    @click="dismiss"
  >
    <div class="badge-notification-content">
      <div class="badge-notification-header">
        <span class="badge-notification-icon">🏅</span>
        <span class="badge-notification-title">¡Insignia desbloqueada!</span>
      </div>
      <p class="badge-notification-name">
        {{ badge.nombre }}
      </p>
      <p class="badge-notification-points">
        +{{ badge.puntos_otorga }} puntos
      </p>
    </div>
    <button
      class="badge-notification-close"
      aria-label="Cerrar notificación"
      @click.stop="dismiss"
    >
      ✕
    </button>
  </div>
</template>

<style scoped>
.badge-notification {
  position: fixed;
  bottom: calc(var(--unit) * 3);
  right: calc(var(--unit) * 3);
  z-index: 100;
  display: flex;
  align-items: flex-start;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 2.5) calc(var(--unit) * 3);
  background: var(--paper);
  border: 1px solid var(--line);
  border-left: 4px solid var(--brand-secondary);
  border-radius: 4px;
  box-shadow: var(--shadow-pop);
  min-width: 280px;
  max-width: 360px;
  animation: slideInUp 400ms var(--ease) both;
  cursor: pointer;
}
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.badge-notification-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.badge-notification-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.badge-notification-icon {
  font-size: 20px;
}
.badge-notification-title {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--brand-secondary);
  font-weight: 600;
}
.badge-notification-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}
.badge-notification-points {
  margin: 0;
  font-size: 13px;
  color: var(--ink-3);
}
.badge-notification-close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--paper-2);
  color: var(--ink-3);
  font-size: 14px;
  transition: all 160ms var(--ease);
}
.badge-notification-close:hover {
  background: var(--paper-3);
  color: var(--ink);
}
</style>
