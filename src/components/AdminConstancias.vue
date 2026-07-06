<script setup>
defineProps({
  metrics: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="admin-content fade-in admin-centered">
    <p class="eyebrow">Constancias emitidas</p>
    <div
      class="display"
      :style="{
        fontSize: '96px',
        color: 'var(--ink)',
        lineHeight: '1',
        marginTop: 'calc(var(--unit) * 2)',
      }"
    >
      {{ metrics[2]?.value || '\u2014' }}
    </div>
    <p :style="{ fontSize: '16px', color: 'var(--ink-3)', marginTop: 'calc(var(--unit) * 2)' }">
      Constancias emitidas en el ciclo 2026
    </p>
  </div>
</template>
