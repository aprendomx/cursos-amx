<script setup>
import { ref, watch, onMounted } from 'vue'
import { useReproductor } from '@/composables/useReproductor.js'

const props = defineProps({
  grabacion: { type: Object, required: true },
})

const videoRef = ref(null)
const { tiempoActual, segmentoActual, textoCercano, cargarTranscripcion, saltarATiempo } =
  useReproductor(props.grabacion.sesion_id)

function onTimeUpdate() {
  if (videoRef.value) {
    tiempoActual.value = videoRef.value.currentTime
  }
}

function onSegmentClick(seg) {
  saltarATiempo(seg.start)
  if (videoRef.value) {
    videoRef.value.currentTime = seg.start
  }
}

watch(() => props.grabacion.sesion_id, cargarTranscripcion, { immediate: true })
</script>

<template>
  <div class="reproductor">
    <video
      ref="videoRef"
      class="video-player"
      controls
      :src="grabacion.url_grabacion"
      @timeupdate="onTimeUpdate"
    />

    <div v-if="textoCercano" class="transcripcion-panel">
      <h4>Transcripción</h4>
      <p class="transcripcion-texto">
        {{ textoCercano }}
      </p>
    </div>

    <div v-if="segmentoActual" class="segmento-actual">
      <span class="tiempo mono">{{ Math.floor(segmentoActual.start) }}s</span>
      <span class="texto">{{ segmentoActual.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.reproductor {
  max-width: 900px;
  margin: 0 auto;
}
.video-player {
  width: 100%;
  border-radius: 8px;
  background: #000;
}
.transcripcion-panel {
  margin-top: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 2);
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
}
.transcripcion-panel h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: calc(var(--unit));
}
.transcripcion-texto {
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink-2);
}
.segmento-actual {
  margin-top: calc(var(--unit));
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--primary-100);
  border-radius: 4px;
}
.segmento-actual .tiempo {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary);
}
.segmento-actual .texto {
  font-size: 13px;
  color: var(--ink);
}
</style>
