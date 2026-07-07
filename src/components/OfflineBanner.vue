<script setup>
import { useOffline } from '@/composables/useOffline'

const { isOffline } = useOffline()
</script>

<template>
  <div v-if="isOffline" class="offline-banner" role="status" aria-live="polite">
    Modo offline — Tus acciones se guardarán y sincronizarán al reconectar
  </div>
</template>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: var(--warning, #f59e0b);
  color: #ffffff;
  text-align: center;
  padding: calc(var(--unit)) calc(var(--unit) * 2);
  font-size: 13px;
  font-weight: 500;
}
</style>
