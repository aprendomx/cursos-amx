<script setup>
import { ref, watch, onMounted } from 'vue'
import { useVideoCache } from '@/composables/useVideoCache'

const props = defineProps({
  videoId: { type: String, required: true },
  leccionId: { type: String, required: true },
  playlistUrl: { type: String, required: true },
})

const { downloading, progress, error, download, remove, check } = useVideoCache()
const isCached = ref(false)

async function refreshCached() {
  isCached.value = await check(props.videoId)
}

async function handleClick() {
  error.value = ''
  if (isCached.value) {
    await remove(props.videoId)
    await refreshCached()
  } else {
    await download(props.videoId, props.leccionId, props.playlistUrl)
    await refreshCached()
  }
}

onMounted(refreshCached)
watch(() => props.videoId, refreshCached)
</script>

<template>
  <div class="download-btn-wrap">
    <button class="btn btn-secondary btn-sm" :disabled="downloading" @click="handleClick">
      <span v-if="downloading">Descargando… {{ Math.round(progress) }}%</span>
      <span v-else-if="isCached">Eliminar de offline</span>
      <span v-else>Descargar para offline</span>
    </button>
    <p v-if="error" class="download-error">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.download-btn-wrap {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}
.download-error {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}
</style>
