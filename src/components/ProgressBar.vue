<script setup>
defineProps({
  value: { type: Number, default: 0 },
  color: { type: String, default: 'var(--primary)' },
  // 'titular' cuando el progreso ES el mensaje de la pantalla (detalle de
  // curso); el grosor por defecto queda para usos de soporte.
  alto: { type: String, default: '4px' },
})
</script>

<template>
  <div class="progress-bar" :style="{ height: alto }">
    <div
      class="progress-bar-fill"
      :style="{
        width: `${Math.min(Math.max(value, 0), 1) * 100}%`,
        background: color,
      }"
    />
  </div>
</template>

<style scoped>
.progress-bar {
  width: 100%;
  background: var(--paper-3);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  border-radius: var(--radius-sm);
  transition: width 400ms var(--ease);
}
</style>
