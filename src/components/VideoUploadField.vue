<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { uploadVideoForLeccion, retryVideo, deleteVideo } from '@/services/videos.js'
import { useVideoStatus } from '@/composables/useVideoStatus.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const leccionEsPersistida = computed(() => UUID_RE.test(props.leccionId || ''))

const props = defineProps({
  leccionId: { type: String, required: true },
  videoId: { type: String, default: null },
})
const emit = defineEmits(['videoId-updated'])

const videoIdRef = ref(props.videoId)
watch(
  () => props.videoId,
  (v) => {
    videoIdRef.value = v
  }
)

const { video } = useVideoStatus(videoIdRef)
const uploading = ref(false)
const progress = ref(0)
const localErr = ref('')

const status = computed(() => {
  if (uploading.value) return 'uploading'
  return video.value?.status || (videoIdRef.value ? 'loading' : 'none')
})
const errMsg = computed(() => video.value?.error_msg || '')

// Stage tracking
const STAGES = [
  { key: 'uploading', label: 'Subiendo' },
  { key: 'pending', label: 'En cola' },
  { key: 'processing', label: 'Procesando' },
  { key: 'ready', label: 'Listo' },
]
const stageIndex = computed(() => {
  const i = STAGES.findIndex((s) => s.key === status.value)
  return i === -1 ? -1 : i
})

// Elapsed time counter (kicks in during pending/processing where we
// have no measurable progress).
const stageStartedAt = ref(0)
const now = ref(Date.now())
let tickTimer = null

function startTick() {
  if (tickTimer) return
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
}
function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

const elapsedSec = computed(() => {
  if (!stageStartedAt.value) return 0
  return Math.max(0, Math.floor((now.value - stageStartedAt.value) / 1000))
})
const elapsedStr = computed(() => {
  const s = elapsedSec.value
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}m ${r.toString().padStart(2, '0')}s`
})

// Reset elapsed timer whenever the active stage changes.
watch(
  status,
  (s, prev) => {
    if (s === prev) return
    stageStartedAt.value = Date.now()
    if (s === 'uploading' || s === 'pending' || s === 'processing') {
      startTick()
    } else {
      stopTick()
    }
  },
  { immediate: true }
)

onBeforeUnmount(stopTick)

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  localErr.value = ''
  uploading.value = true
  progress.value = 0
  try {
    const newId = await uploadVideoForLeccion(props.leccionId, file, {
      onProgress: (p) => {
        progress.value = p
      },
    })
    videoIdRef.value = newId
    emit('videoId-updated', newId)
  } catch (err) {
    localErr.value = String(err.message || err)
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}

async function onRetry() {
  if (!videoIdRef.value) return
  await retryVideo(videoIdRef.value)
}

async function onRemove() {
  if (!videoIdRef.value) return
  if (!confirm('¿Eliminar este video?')) return
  await deleteVideo(videoIdRef.value)
  videoIdRef.value = null
  emit('videoId-updated', null)
}
</script>

<template>
  <div class="vuf">
    <div class="vuf-row">
      <strong>Video HLS</strong>
      <span
        class="vuf-status"
        :data-status="status"
      >{{ status }}</span>
    </div>

    <div
      v-if="!leccionEsPersistida"
      class="vuf-info"
    >
      Guarda el curso primero para poder subir el video de esta lección.
    </div>

    <template v-else>
      <!-- Stage tracker visible whenever there's a video in progress -->
      <div
        v-if="stageIndex >= 0 && status !== 'failed' && status !== 'none' && status !== 'loading'"
        class="vuf-stages"
      >
        <div
          v-for="(s, i) in STAGES"
          :key="s.key"
          class="vuf-stage"
          :class="{
            'is-active': i === stageIndex,
            'is-done': i < stageIndex,
            'is-pending': i > stageIndex,
          }"
        >
          <span class="vuf-stage-dot">
            <span
              v-if="i === stageIndex && (s.key === 'pending' || s.key === 'processing')"
              class="vuf-pulse"
            />
          </span>
          <span class="vuf-stage-label">{{ s.label }}</span>
        </div>
      </div>

      <div
        v-if="status === 'uploading'"
        class="vuf-progress-block"
      >
        <div class="vuf-progress-bar">
          <div
            class="vuf-progress-fill"
            :style="{ width: Math.round(progress * 100) + '%' }"
          />
        </div>
        <div class="vuf-progress-text">
          Subiendo… {{ Math.round(progress * 100) }}% · {{ elapsedStr }}
        </div>
      </div>

      <div
        v-else-if="status === 'pending'"
        class="vuf-info"
      >
        En cola para procesar… {{ elapsedStr }}
      </div>

      <div
        v-else-if="status === 'processing'"
        class="vuf-info"
      >
        Procesando video con ffmpeg… {{ elapsedStr }}
        <div class="vuf-progress-bar indeterminate">
          <div class="vuf-progress-fill-anim" />
        </div>
        <small class="vuf-hint">
          El tiempo depende del tamaño y duración. Un video de 5 min suele tardar ~2 min. Puedes
          cerrar esta ventana y volver más tarde.
        </small>
      </div>

      <div
        v-else-if="status === 'failed'"
        class="vuf-err"
      >
        <strong>Falló:</strong> {{ errMsg || 'error desconocido' }}
        <button
          type="button"
          class="vuf-btn"
          @click="onRetry"
        >
          Reintentar
        </button>
      </div>

      <div
        v-else-if="status === 'ready'"
        class="vuf-ok"
      >
        ✓ Listo · {{ video?.duracion_seg }}s
        <button
          type="button"
          class="vuf-btn vuf-btn-danger"
          @click="onRemove"
        >
          Eliminar
        </button>
      </div>

      <label
        v-if="!uploading && status !== 'processing' && status !== 'pending'"
        class="vuf-upload"
      >
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
          @change="onFileChange"
        >
        <span>{{ status === 'ready' ? 'Reemplazar' : 'Subir video' }}</span>
      </label>

      <div
        v-if="localErr"
        class="vuf-err"
      >
        {{ localErr }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.vuf {
  border: 1px solid #ccc;
  padding: 12px;
  border-radius: 6px;
  background: #fafafa;
}
.vuf-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.vuf-status {
  font-family: monospace;
  font-size: 0.75em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 3px;
  background: #eee;
}
.vuf-status[data-status='ready'] {
  color: #fff;
  background: #060;
}
.vuf-status[data-status='failed'] {
  color: #fff;
  background: #a00;
}
.vuf-status[data-status='processing'],
.vuf-status[data-status='pending'],
.vuf-status[data-status='uploading'] {
  color: #fff;
  background: #c80;
}

.vuf-stages {
  display: flex;
  gap: 8px;
  margin: 12px 0;
  align-items: center;
}
.vuf-stage {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  position: relative;
}
.vuf-stage + .vuf-stage::before {
  content: '';
  position: absolute;
  left: -8px;
  right: calc(100% - 12px);
  top: 50%;
  height: 1px;
  background: #ddd;
}
.vuf-stage.is-done + .vuf-stage::before,
.vuf-stage.is-active::before {
  background: #c80;
}
.vuf-stage-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ddd;
  flex-shrink: 0;
  position: relative;
  display: grid;
  place-items: center;
}
.vuf-stage.is-done .vuf-stage-dot {
  background: #060;
}
.vuf-stage.is-active .vuf-stage-dot {
  background: #c80;
}
.vuf-stage-label {
  font-size: 0.8em;
  white-space: nowrap;
}
.vuf-stage.is-pending .vuf-stage-label {
  color: #999;
}
.vuf-pulse {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid #c80;
  animation: vuf-pulse 1.4s ease-out infinite;
  opacity: 0;
}
@keyframes vuf-pulse {
  0% {
    transform: scale(0.6);
    opacity: 0.9;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}

.vuf-progress-block {
  margin: 8px 0;
}
.vuf-progress-bar {
  width: 100%;
  height: 8px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
  margin: 6px 0;
}
.vuf-progress-fill {
  height: 100%;
  background: #060;
  transition: width 0.2s linear;
}
.vuf-progress-bar.indeterminate {
  position: relative;
}
.vuf-progress-fill-anim {
  position: absolute;
  width: 40%;
  height: 100%;
  background: #c80;
  border-radius: 4px;
  animation: vuf-indet 1.6s ease-in-out infinite;
}
@keyframes vuf-indet {
  0% {
    left: -40%;
  }
  100% {
    left: 100%;
  }
}
.vuf-progress-text {
  font-family: monospace;
  font-size: 0.85em;
  color: #555;
}

.vuf-info {
  font-size: 0.9em;
  color: #555;
  margin: 6px 0;
}
.vuf-hint {
  display: block;
  margin-top: 6px;
  font-size: 0.8em;
  color: #888;
  line-height: 1.3;
}
.vuf-err {
  color: #a00;
  font-size: 0.9em;
  margin: 6px 0;
}
.vuf-ok {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.9em;
  color: #060;
  margin: 6px 0;
}
.vuf-btn {
  border: 1px solid currentColor;
  background: transparent;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
}
.vuf-btn-danger {
  color: #a00;
}
.vuf-upload {
  display: inline-block;
  margin-top: 8px;
}
.vuf-upload input {
  display: none;
}
.vuf-upload span {
  cursor: pointer;
  text-decoration: underline;
  color: #036;
  font-size: 0.9em;
}
</style>
