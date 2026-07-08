<script setup>
import { defineProps, computed, watch } from 'vue'
import IconSet from '@/components/IconSet.vue'
import PlayerVideoSurface from '@/components/PlayerVideoSurface.vue'
import PlayerChatPane from '@/components/PlayerChatPane.vue'
import PlayerLessonNavigator from '@/components/PlayerLessonNavigator.vue'
import EntregaUploadField from '@/components/EntregaUploadField.vue'
import AiSummarizeButton from '@/components/AiSummarizeButton.vue'
import AiChatWidget from '@/components/AiChatWidget.vue'
import DownloadButton from '@/components/DownloadButton.vue'
import VideoHeatmap from '@/components/VideoHeatmap.vue'
import { featureEnabled } from '@/lib/featureFlags.js'
import { usePlayerPage } from '@/composables/usePlayerPage.js'
import { useOffline } from '@/composables/useOffline'
import { useVideoAnalytics } from '@/composables/useVideoAnalytics.js'
const props = defineProps({
  cursoId: { type: String, default: 'c1' },
  leccionId: { type: String, default: '' },
})
const {
  router,
  session,
  currentLeccion,
  playing,
  currentTime,
  totalTime,
  comentarios,
  draft,
  completada,
  llegoAlFinal,
  handleFinLectura,
  videoEl,
  hlsPoster,
  hlsMasterUrl,
  leccion,
  lecciones,
  moduloTitulo,
  variant,
  source,
  completedCount,
  progressFraction,
  progressPct,
  setVariant,
  togglePlay,
  handleSeek,
  onHlsTimeUpdate,
  onHlsLoadedMetadata,
  onHlsEnded,
  selectLesson,
  sendComment,
  handleEvaluacionAprobada,
  marcarLecturaCompletada,
  goToNextLesson,
} = usePlayerPage(props)

const aiSummariesEnabled = featureEnabled('ai_summaries')
const aiChatEnabled = featureEnabled('ai_study_assistant')

const { offlineEnabled } = useOffline()

const videoAnalyticsEnabled = computed(() => featureEnabled('video_analytics'))

/* ── mock heatmap data (Fase J) ── */
const heatmapMockData = [
  { intervalo_inicio: 0, vistas_unicas: 120, abandonos: 5 },
  { intervalo_inicio: 30, vistas_unicas: 115, abandonos: 3 },
  { intervalo_inicio: 60, vistas_unicas: 110, abandonos: 4 },
  { intervalo_inicio: 90, vistas_unicas: 105, abandonos: 2 },
  { intervalo_inicio: 120, vistas_unicas: 100, abandonos: 6 },
  { intervalo_inicio: 150, vistas_unicas: 95, abandonos: 3 },
  { intervalo_inicio: 180, vistas_unicas: 90, abandonos: 4 },
  { intervalo_inicio: 210, vistas_unicas: 85, abandonos: 2 },
  { intervalo_inicio: 240, vistas_unicas: 80, abandonos: 5 },
  { intervalo_inicio: 270, vistas_unicas: 75, abandonos: 3 },
]
const heatmapDuracionTotal = 300

const { startTracking } = useVideoAnalytics({
  leccionId: leccion.value?.id,
  cursoId: props.cursoId,
  videoId: source.value?.videoId,
  enabled: videoAnalyticsEnabled.value,
})

watch(videoEl, (el) => {
  if (el) startTracking(el)
}, { immediate: true })

function extractTextFromContenido(contenido) {
  if (!contenido) return ''
  if (typeof contenido === 'string') return contenido
  // Simple Tiptap text extraction
  let text = ''
  function walk(node) {
    if (node.text) text += node.text + ' '
    if (node.content) node.content.forEach(walk)
  }
  if (contenido.content) contenido.content.forEach(walk)
  return text.trim()
}

const leccionTexto = computed(() => extractTextFromContenido(leccion.value?.contenido))
</script>
<template>
  <div class="player-page" :class="`variant-${variant}`">
    <!-- Top bar -->
    <header class="player-topbar">
      <div class="topbar-left">
        <button
          class="topbar-back"
          @click="router.push({ name: 'curso', params: { id: props.cursoId } })"
        >
          <IconSet name="arrowLeft" />
          <span>Salir del curso</span>
        </button>
        <div class="topbar-divider" />
        <div class="topbar-info">
          <span class="eyebrow">Modulo 02 &middot; Leccion {{ leccion.orden }}</span>
          <span class="topbar-title display-italic">{{ leccion.titulo }}</span>
        </div>
      </div>
      <div class="topbar-right">
        <div class="topbar-variants tweaks-segment">
          <button :class="{ on: variant === 'split' }" @click="setVariant('split')">Split</button>
          <button :class="{ on: variant === 'stacked' }" @click="setVariant('stacked')">
            Chat inferior
          </button>
          <button :class="{ on: variant === 'focus' }" @click="setVariant('focus')">Enfoque</button>
        </div>
      </div>
    </header>

    <!-- Split -->
    <div v-if="variant === 'split'" class="layout-split">
      <div class="split-left">
        <PlayerVideoSurface
          :source="source"
          :leccion="leccion"
          :video-el-ref="videoEl"
          :hls-poster="hlsPoster"
          :playing="playing"
          :completada="completada"
          :current-time="currentTime"
          :total-time="totalTime"
          :modulo-titulo="moduloTitulo"
          :llego-al-final="llegoAlFinal"
          @toggle-play="togglePlay"
          @seek="handleSeek"
          @time-update="onHlsTimeUpdate"
          @loaded-metadata="onHlsLoadedMetadata"
          @ended="onHlsEnded"
          @update:current-time="(v) => (currentTime = v)"
          @update:total-time="(v) => (totalTime = v)"
          @fin-lectura="handleFinLectura"
          @eval-aprobada="handleEvaluacionAprobada"
          @marcar-lectura-completada="marcarLecturaCompletada"
        />
        <VideoHeatmap
          v-if="featureEnabled('video_analytics_heatmap')"
          :data="heatmapMockData"
          :duracion-total="heatmapDuracionTotal"
        />
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />
        <AiSummarizeButton
          v-if="aiSummariesEnabled && leccionTexto"
          :content="leccionTexto"
          content-type="text"
          :leccion-id="leccion.id"
        />
        <PlayerLessonNavigator
          :lecciones="lecciones"
          :current-leccion-id="currentLeccion"
          :completed-count="completedCount"
          :progress-fraction="progressFraction"
          :progress-pct="progressPct"
          :modulo-titulo="moduloTitulo"
          @select="selectLesson"
        />
      </div>
      <PlayerChatPane v-model:draft="draft" :comentarios="comentarios" @send="sendComment" />
    </div>

    <!-- Stacked -->
    <div v-else-if="variant === 'stacked'" class="layout-stacked">
      <div class="stacked-top">
        <PlayerVideoSurface
          :source="source"
          :leccion="leccion"
          :video-el-ref="videoEl"
          :hls-poster="hlsPoster"
          :playing="playing"
          :completada="completada"
          :current-time="currentTime"
          :total-time="totalTime"
          :modulo-titulo="moduloTitulo"
          :llego-al-final="llegoAlFinal"
          @toggle-play="togglePlay"
          @seek="handleSeek"
          @time-update="onHlsTimeUpdate"
          @loaded-metadata="onHlsLoadedMetadata"
          @ended="onHlsEnded"
          @update:current-time="(v) => (currentTime = v)"
          @update:total-time="(v) => (totalTime = v)"
          @fin-lectura="handleFinLectura"
          @eval-aprobada="handleEvaluacionAprobada"
          @marcar-lectura-completada="marcarLecturaCompletada"
        />
        <VideoHeatmap
          v-if="featureEnabled('video_analytics_heatmap')"
          :data="heatmapMockData"
          :duracion-total="heatmapDuracionTotal"
        />
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />
        <AiSummarizeButton
          v-if="aiSummariesEnabled && leccionTexto"
          :content="leccionTexto"
          content-type="text"
          :leccion-id="leccion.id"
        />
        <PlayerLessonNavigator
          variant="stacked"
          :lecciones="lecciones"
          :current-leccion-id="currentLeccion"
          :completed-count="completedCount"
          :progress-fraction="progressFraction"
          :progress-pct="progressPct"
          :modulo-titulo="moduloTitulo"
          @select="selectLesson"
        />
      </div>
      <div class="stacked-bottom">
        <div class="stacked-notes">
          <div class="notes-header">
            <span class="eyebrow">Notas de leccion</span>
            <h3 class="display-italic">
              {{ leccion.titulo }}
            </h3>
          </div>
          <div class="notes-body">
            <p>
              La Plataforma Nacional de Transparencia (PNT) es el sistema informatico que concentra
              las obligaciones de transparencia de todos los sujetos obligados en Mexico.
            </p>
            <p>
              Permite a cualquier ciudadano consultar la informacion publica de oficio, presentar
              solicitudes de acceso a la informacion y dar seguimiento a recursos de revision.
            </p>
            <p class="notes-highlight">
              Articulo 70 de la LGTAIP establece 48 fracciones de obligaciones comunes que deben
              publicarse y actualizarse periodicamente.
            </p>
          </div>
        </div>
        <PlayerChatPane v-model:draft="draft" :comentarios="comentarios" @send="sendComment" />
      </div>
    </div>

    <!-- Focus -->
    <div v-else class="layout-focus">
      <div class="focus-center">
        <PlayerVideoSurface
          :source="source"
          :leccion="leccion"
          :video-el-ref="videoEl"
          :hls-poster="hlsPoster"
          :playing="playing"
          :completada="completada"
          :current-time="currentTime"
          :total-time="totalTime"
          :modulo-titulo="moduloTitulo"
          :llego-al-final="llegoAlFinal"
          @toggle-play="togglePlay"
          @seek="handleSeek"
          @time-update="onHlsTimeUpdate"
          @loaded-metadata="onHlsLoadedMetadata"
          @ended="onHlsEnded"
          @update:current-time="(v) => (currentTime = v)"
          @update:total-time="(v) => (totalTime = v)"
          @fin-lectura="handleFinLectura"
          @eval-aprobada="handleEvaluacionAprobada"
          @marcar-lectura-completada="marcarLecturaCompletada"
        />
        <VideoHeatmap
          v-if="featureEnabled('video_analytics_heatmap')"
          :data="heatmapMockData"
          :duracion-total="heatmapDuracionTotal"
        />
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />
        <AiSummarizeButton
          v-if="aiSummariesEnabled && leccionTexto"
          :content="leccionTexto"
          content-type="text"
          :leccion-id="leccion.id"
        />
        <div class="focus-below">
          <div class="focus-title-block">
            <span class="eyebrow">Modulo 02 &middot; Leccion {{ leccion.orden }}</span>
            <h2 class="display-italic focus-lesson-title">
              {{ leccion.titulo }}
            </h2>
          </div>
          <div class="focus-actions">
            <button class="btn btn-ghost btn-sm" title="Notas (proximamente)" @click="() => {}">
              <IconSet name="doc" /> Notas
            </button>
            <button class="btn btn-ghost btn-sm" title="Chat (proximamente)" @click="() => {}">
              <IconSet name="chat" /> Chat
            </button>
            <DownloadButton
              v-if="offlineEnabled && source?.kind === 'hls'"
              :video-id="source.videoId"
              :leccion-id="leccion.id"
              :playlist-url="hlsMasterUrl"
            />
            <button v-if="completada" class="btn btn-primary btn-sm" @click="goToNextLesson">
              Siguiente leccion <IconSet name="arrow" />
            </button>
          </div>
        </div>
      </div>
      <PlayerLessonNavigator
        variant="focus"
        :lecciones="lecciones"
        :current-leccion-id="currentLeccion"
        :completed-count="completedCount"
        :progress-fraction="progressFraction"
        :progress-pct="progressPct"
        :modulo-titulo="moduloTitulo"
        @select="selectLesson"
      />
    </div>

    <AiChatWidget v-if="aiChatEnabled && leccionTexto" :context="leccionTexto" />
  </div>
</template>
