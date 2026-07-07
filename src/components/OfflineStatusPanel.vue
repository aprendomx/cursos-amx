<script setup>
import { ref, onMounted } from 'vue'
import { useSyncStatus } from '@/composables/useSyncStatus'
import { useVideoCache } from '@/composables/useVideoCache'

const { pendingCount, errorCount, syncing, doSync, retry } = useSyncStatus()
const { stats } = useVideoCache()

const cacheStats = ref({ used: 0, max: 0, videos: 0 })

async function refreshStats() {
  cacheStats.value = await stats()
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

onMounted(refreshStats)
</script>

<template>
  <div class="offline-panel card">
    <div class="offline-panel-header">
      <h4 class="h4">Almacenamiento offline</h4>
      <span class="eyebrow">Estado de sincronización</span>
    </div>

    <div class="offline-panel-body">
      <div class="field">
        <label>Espacio usado / total</label>
        <span class="caption">
          {{ formatBytes(cacheStats.used) }} / {{ formatBytes(cacheStats.max) }}
        </span>
      </div>

      <div class="field">
        <label>Videos en caché</label>
        <span class="caption">{{ cacheStats.videos }}</span>
      </div>

      <div class="field">
        <label>Acciones pendientes</label>
        <span class="caption">{{ pendingCount }}</span>
      </div>

      <div class="field">
        <label>Errores</label>
        <span class="caption">{{ errorCount }}</span>
      </div>
    </div>

    <div class="offline-panel-actions">
      <button class="btn btn-primary" :disabled="syncing" @click="doSync">
        {{ syncing ? 'Sincronizando…' : 'Sincronizar ahora' }}
      </button>
      <button v-if="errorCount > 0" class="btn btn-secondary" :disabled="syncing" @click="retry">
        Reintentar fallidas
      </button>
    </div>
  </div>
</template>

<style scoped>
.offline-panel {
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.offline-panel-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.offline-panel-header .h4 {
  margin: 0;
  font-family: var(--display);
  font-weight: 500;
  font-size: 18px;
  color: var(--ink);
}
.offline-panel-body {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: calc(var(--unit) * 2);
}
.offline-panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--unit));
}
</style>
