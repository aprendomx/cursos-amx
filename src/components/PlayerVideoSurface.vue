<script setup>
import { computed } from 'vue'
import IconSet from '@/components/IconSet.vue'
import DocumentoViewer from '@/components/DocumentoViewer.vue'
import EvaluacionPanel from '@/components/EvaluacionPanel.vue'
import PlayerTextoSurface from '@/components/PlayerTextoSurface.vue'
import { featureEnabled } from '@/lib/featureFlags.js'

const props = defineProps({
  source: {
    type: Object,
    required: true,
    validator(v) {
      return ['youtube', 'hls', 'documento', 'examen', 'texto', 'none'].includes(v?.kind)
    },
  },
  leccion: {
    type: Object,
    required: true,
  },
  videoElRef: {
    type: Object,
    required: true,
  },
  hlsPoster: {
    type: String,
    default: '',
  },
  playing: {
    type: Boolean,
    default: false,
  },
  completada: {
    type: Boolean,
    default: false,
  },
  currentTime: {
    type: Number,
    default: 0,
  },
  totalTime: {
    type: Number,
    default: 735,
  },
  moduloTitulo: {
    type: String,
    default: '',
  },
  llegoAlFinal: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'togglePlay',
  'seek',
  'timeUpdate',
  'loadedMetadata',
  'ended',
  'update:currentTime',
  'update:totalTime',
  'finLectura',
  'evalAprobada',
  'marcarLecturaCompletada',
])

const youtubeEmbed = computed(() => {
  if (props.source?.kind === 'youtube' && props.source?.id) {
    return `https://www.youtube.com/embed/${props.source.id}?rel=0&modestbranding=1`
  }
  return ''
})

const progress = computed(() => Math.min(props.currentTime / props.totalTime, 1))

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function onSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  emit('seek', ratio)
}

function onTimeUpdate() {
  const el = props.videoElRef.value
  if (!el) return
  emit('timeUpdate')
  emit('update:currentTime', el.currentTime)
  if (el.duration) {
    emit('update:totalTime', el.duration)
  }
}

function onLoadedMetadata() {
  const el = props.videoElRef.value
  if (!el) return
  emit('loadedMetadata')
  emit('update:totalTime', el.duration)
}

function onEnded() {
  emit('ended')
}
</script>

<template>
  <div>
    <div
      class="video-surface"
      :class="{ 'has-iframe': source.kind === 'youtube' }"
      @click="source.kind === 'none' && emit('togglePlay')"
    >
      <iframe
        v-if="source.kind === 'youtube'"
        class="video-iframe"
        :src="youtubeEmbed"
        title="video"
        frameborder="0"
        allow="
          accelerometer;
          autoplay;
          clipboard-write;
          encrypted-media;
          gyroscope;
          picture-in-picture;
        "
        allowfullscreen
      />
      <video
        v-else-if="source.kind === 'hls'"
        :ref="videoElRef"
        class="video-native"
        :poster="hlsPoster"
        playsinline
        controls
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onLoadedMetadata"
        @ended="onEnded"
      />
      <DocumentoViewer
        v-else-if="source.kind === 'documento'"
        :leccion-id="source.leccionId"
        @fin-de-lectura="emit('finLectura')"
      />
      <PlayerTextoSurface
        v-else-if="source.kind === 'texto'"
        :contenido="leccion.contenido"
        :completada="completada"
        @completada="emit('marcarLecturaCompletada')"
      />
      <EvaluacionPanel
        v-else-if="source.kind === 'examen' && featureEnabled('evaluaciones')"
        :key="source.leccionId"
        :leccion-id="source.leccionId"
        @aprobada="emit('evalAprobada')"
      />
      <template v-else>
        <div class="video-bg">
          <div class="video-stripe-overlay" />
          <div class="video-radial" />
        </div>
        <div class="slide-content">
          <span class="slide-eyebrow eyebrow"
            >{{ moduloTitulo || 'Lección' }} &middot;
            {{ String(leccion.orden || 1).padStart(2, '0') }}</span
          >
          <h2 class="slide-heading display">
            {{ leccion.titulo || 'Lección' }}
          </h2>
          <span class="slide-footer mono">Sin video disponible</span>
        </div>
      </template>

      <!-- Badges -->
      <div class="video-badges">
        <span class="badge-live"><span class="badge-dot pulsing" /> Aula viva</span>
        <span class="badge-duration">{{ leccion.duracion }}</span>
      </div>

      <!-- Center play (when paused) -->
      <div
        v-if="source.kind === 'none' && !playing && !completada"
        class="play-overlay"
        @click.stop="emit('togglePlay')"
      >
        <div class="play-circle">
          <IconSet name="play" />
        </div>
      </div>

      <!-- Completion overlay -->
      <div v-if="source.kind === 'none' && completada" class="completion-overlay" @click.stop>
        <div class="completion-inner">
          <div class="completion-circle">
            <IconSet name="check" />
          </div>
          <span class="completion-text display-italic">Lección completada</span>
        </div>
      </div>

      <!-- Bottom controls (solo si no hay iframe real) -->
      <div v-if="source.kind === 'none'" class="video-controls" @click.stop>
        <div class="controls-progress" @click="onSeek">
          <div class="controls-progress-fill" :style="{ width: progress * 100 + '%' }" />
        </div>
        <div class="controls-bar">
          <button class="controls-play" @click="emit('togglePlay')">
            <IconSet :name="playing ? 'close' : 'play'" />
          </button>
          <span class="controls-time mono"
            >{{ fmtTime(currentTime) }} / {{ fmtTime(totalTime) }}</span
          >
          <span class="controls-status mono">{{
            source.kind === 'hls' ? 'HLS' : 'Simulador (sin URL)'
          }}</span>
        </div>
      </div>
    </div>

    <div v-if="source.kind === 'documento'" class="doc-actions">
      <button
        class="btn btn-primary doc-mark-btn"
        :disabled="!llegoAlFinal || completada"
        @click="emit('marcarLecturaCompletada')"
      >
        <template v-if="completada"> ✓ Lección completada </template>
        <template v-else-if="llegoAlFinal"> Marcar como leída </template>
        <template v-else> Desliza hasta el final para habilitar </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.video-surface {
  position: relative;
  background: #000;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}

.video-surface.has-iframe {
  cursor: default;
}

.video-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

.video-bg {
  position: absolute;
  inset: 0;
}

.video-radial {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 40%, rgba(98, 17, 50, 0.18) 0%, transparent 70%);
}

.video-stripe-overlay {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.03) 0,
    rgba(255, 255, 255, 0.03) 1px,
    transparent 1px,
    transparent 12px
  );
}

.slide-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 48px;
  z-index: 2;
}

.slide-eyebrow {
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 24px;
}

.slide-heading {
  font-size: clamp(28px, 4vw, 52px);
  color: var(--paper);
  line-height: 1;
  margin-bottom: 32px;
}

.slide-accent {
  color: var(--brand-accent);
}

.slide-footer {
  color: rgba(255, 255, 255, 0.3);
  font-size: 10px;
}

.video-badges {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
  z-index: 5;
}

.badge-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--primary);
  color: var(--paper);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--paper);
  display: inline-block;
}

.badge-duration {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
}

.play-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 10;
  background: rgba(0, 0, 0, 0.2);
}

.play-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px);
  display: grid;
  place-items: center;
  color: var(--paper);
  font-size: 24px;
  transition:
    transform 180ms var(--ease),
    background 180ms var(--ease);
}

.play-circle:hover {
  transform: scale(1.08);
  background: rgba(255, 255, 255, 0.22);
}

.play-circle svg {
  width: 24px;
  height: 24px;
}

.completion-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: grid;
  place-items: center;
  z-index: 10;
}

.completion-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.completion-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--brand-accent);
  color: var(--ink);
  display: grid;
  place-items: center;
}

.completion-circle svg {
  width: 28px;
  height: 28px;
}

.completion-text {
  font-size: 22px;
  color: var(--paper);
}

.video-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 12;
  cursor: default;
}

.controls-progress {
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  cursor: pointer;
  transition: height 120ms var(--ease);
}

.controls-progress:hover {
  height: 6px;
}

.controls-progress-fill {
  height: 100%;
  background: var(--brand-accent);
  transition: width 200ms linear;
}

.controls-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.5);
}

.controls-play {
  color: var(--paper);
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  transition: opacity 120ms;
}

.controls-play:hover {
  opacity: 0.8;
}

.controls-time {
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
}

.controls-status {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.3);
  font-size: 10px;
}

.video-native {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
  object-fit: contain;
}

.doc-actions {
  padding: 16px 24px;
  display: flex;
  justify-content: center;
  background: var(--ink, #1a1a1a);
}

.doc-mark-btn {
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.doc-mark-btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
