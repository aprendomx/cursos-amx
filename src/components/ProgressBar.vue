<script setup>
defineProps({
  value: { type: Number, default: 0 },
  color: { type: String, default: 'var(--primary)' },
})
</script>

<template>
  <div class="progress-bar">
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
  height: 4px;
  background: var(--paper-3);
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 400ms var(--ease);
}
</style>
