<script setup>
defineProps({
  metrics: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="admin-content fade-in admin-centered">
    <h1 class="eyebrow">Constancias emitidas</h1>
    <div
      class="display"
      :style="{
        fontSize: 'var(--text-4xl)',
        color: 'var(--ink)',
        lineHeight: '1',
        marginTop: 'calc(var(--unit) * 2)',
      }"
    >
      {{ metrics[2]?.value || '\u2014' }}
    </div>
    <p
      :style="{
        fontSize: 'var(--text-base)',
        color: 'var(--ink-3)',
        marginTop: 'calc(var(--unit) * 2)',
      }"
    >
      Constancias emitidas en el ciclo 2026
    </p>
  </div>
</template>
