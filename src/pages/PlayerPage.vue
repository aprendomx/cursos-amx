<script setup>
import { defineProps, computed, watch } from 'vue'
import IconSet from '@/components/IconSet.vue'
import PlayerVideoSurface from '@/components/PlayerVideoSurface.vue'
import PlayerChatPane from '@/components/PlayerChatPane.vue'
import PlayerTabsPanel from '@/components/PlayerTabsPanel.vue'
import PlayerLessonNavigator from '@/components/PlayerLessonNavigator.vue'
import EntregaUploadField from '@/components/EntregaUploadField.vue'
import AiSummarizeButton from '@/components/AiSummarizeButton.vue'
import AiChatWidget from '@/components/AiChatWidget.vue'
import VideoHeatmap from '@/components/VideoHeatmap.vue'
import EntregaAlumnoPanel from '@/components/EntregaAlumnoPanel.vue'
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
  moduloProgreso,
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
  avisoAvance,
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

watch(
  videoEl,
  (el) => {
    if (el) startTracking(el)
  },
  { immediate: true }
)

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

// Saltos de ±15 s: el control de video que más se usa en móvil, legible y
// con área propia en vez de depender de la barra nativa.
function saltar(delta) {
  const el = videoEl.value
  if (source.value?.kind === 'hls' && el) {
    const tope = Number.isFinite(el.duration) ? el.duration : Infinity
    el.currentTime = Math.max(0, Math.min(tope, el.currentTime + delta))
  } else if (totalTime.value) {
    handleSeek(Math.max(0, Math.min(1, (currentTime.value + delta) / totalTime.value)))
  }
}

const esVideo = computed(() => source.value?.kind === 'hls' || source.value?.kind === 'none')

// Una nota con sello de minuto es también un marcador: el clic lleva ahí.
function irASegundo(segundo) {
  const el = videoEl.value
  if (source.value?.kind === 'hls' && el) {
    el.currentTime = Math.max(0, segundo)
  } else if (totalTime.value) {
    handleSeek(Math.max(0, Math.min(1, segundo / totalTime.value)))
  }
}
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
          <span class="eyebrow"
            >M&oacute;dulo {{ leccion.modulo_orden || 1 }} &middot; Lecci&oacute;n
            {{ leccion.orden }}</span
          >
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
          :modulo-progreso="moduloProgreso"
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
        <div v-if="esVideo" class="player-skips">
          <button class="player-skip-btn" aria-label="Retroceder 15 segundos" @click="saltar(-15)">
            −15 s
          </button>
          <button class="player-skip-btn" aria-label="Adelantar 15 segundos" @click="saltar(15)">
            +15 s
          </button>
        </div>
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
        <!-- Fase K: panel de entrega por tarea vinculada a la lección -->
        <EntregaAlumnoPanel
          v-if="leccion?.tarea_id && session?.user?.id"
          :tarea-id="leccion.tarea_id"
          :user-id="session.user.id"
        />
        <AiSummarizeButton
          v-if="aiSummariesEnabled && leccionTexto"
          :content="leccionTexto"
          content-type="text"
          :leccion-id="leccion.id"
        />
        <div v-if="completada" class="leccion-completada-strip" role="status">
          <span class="strip-check"><IconSet name="check" /> Lección completada</span>
          <button class="btn btn-primary btn-sm" @click="goToNextLesson">
            Siguiente leccion <IconSet name="arrow" />
          </button>
        </div>
        <PlayerLessonNavigator
          :lecciones="lecciones"
          :current-leccion-id="currentLeccion"
          :completed-count="completedCount"
          :progress-fraction="progressFraction"
          :progress-pct="progressPct"
          :modulo-titulo="moduloTitulo"
          :modulo-progreso="moduloProgreso"
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
          :modulo-progreso="moduloProgreso"
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
        <div v-if="esVideo" class="player-skips">
          <button class="player-skip-btn" aria-label="Retroceder 15 segundos" @click="saltar(-15)">
            −15 s
          </button>
          <button class="player-skip-btn" aria-label="Adelantar 15 segundos" @click="saltar(15)">
            +15 s
          </button>
        </div>
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
        <!-- Fase K: panel de entrega por tarea vinculada a la lección -->
        <EntregaAlumnoPanel
          v-if="leccion?.tarea_id && session?.user?.id"
          :tarea-id="leccion.tarea_id"
          :user-id="session.user.id"
        />
        <AiSummarizeButton
          v-if="aiSummariesEnabled && leccionTexto"
          :content="leccionTexto"
          content-type="text"
          :leccion-id="leccion.id"
        />
        <div v-if="completada" class="leccion-completada-strip" role="status">
          <span class="strip-check"><IconSet name="check" /> Lección completada</span>
          <button class="btn btn-primary btn-sm" @click="goToNextLesson">
            Siguiente leccion <IconSet name="arrow" />
          </button>
        </div>
        <PlayerLessonNavigator
          variant="stacked"
          :lecciones="lecciones"
          :current-leccion-id="currentLeccion"
          :completed-count="completedCount"
          :progress-fraction="progressFraction"
          :progress-pct="progressPct"
          :modulo-titulo="moduloTitulo"
          :modulo-progreso="moduloProgreso"
          @select="selectLesson"
        />
      </div>
      <!-- El bloque de «notas» traía tres párrafos clavados sobre la PNT,
           idénticos para toda lección: utilería que mentía. Lo sustituyen las
           pestañas Notas · Recursos · Dudas con datos reales (y la de notas
           dice honesto que aún no hay dato). -->
      <div class="stacked-bottom">
        <PlayerTabsPanel
          :lecciones="lecciones"
          :comentarios="comentarios"
          :draft="draft"
          :offline-enabled="offlineEnabled"
          :source="source"
          :hls-master-url="hlsMasterUrl"
          :leccion-id="leccion.id"
          :current-time="currentTime"
          :con-sesion="!!session"
          @update:draft="(v) => (draft = v)"
          @send="sendComment"
          @select="selectLesson"
          @ir-a-segundo="irASegundo"
        />
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
          :modulo-progreso="moduloProgreso"
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
        <div v-if="esVideo" class="player-skips">
          <button class="player-skip-btn" aria-label="Retroceder 15 segundos" @click="saltar(-15)">
            −15 s
          </button>
          <button class="player-skip-btn" aria-label="Adelantar 15 segundos" @click="saltar(15)">
            +15 s
          </button>
        </div>
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
        <!-- Fase K: panel de entrega por tarea vinculada a la lección -->
        <EntregaAlumnoPanel
          v-if="leccion?.tarea_id && session?.user?.id"
          :tarea-id="leccion.tarea_id"
          :user-id="session.user.id"
        />
        <AiSummarizeButton
          v-if="aiSummariesEnabled && leccionTexto"
          :content="leccionTexto"
          content-type="text"
          :leccion-id="leccion.id"
        />
        <div class="focus-below">
          <div class="focus-title-block">
            <span class="eyebrow"
              >M&oacute;dulo {{ leccion.modulo_orden || 1 }} &middot; Lecci&oacute;n
              {{ leccion.orden }}</span
            >
            <h1 class="display-italic focus-lesson-title">
              {{ leccion.titulo }}
            </h1>
          </div>
          <div class="focus-actions">
            <button v-if="completada" class="btn btn-primary btn-sm" @click="goToNextLesson">
              Siguiente leccion <IconSet name="arrow" />
            </button>
          </div>
        </div>
        <!-- Los botones de Notas y Chat estaban muertos (@click vacío, título
             «próximamente»); la descarga sin conexión vive ahora en la
             pestaña de Recursos. -->
        <div class="focus-tabs-wrap">
          <PlayerTabsPanel
            :lecciones="lecciones"
            :comentarios="comentarios"
            :draft="draft"
            :offline-enabled="offlineEnabled"
            :source="source"
            :hls-master-url="hlsMasterUrl"
            :leccion-id="leccion.id"
            @update:draft="(v) => (draft = v)"
            @send="sendComment"
            @select="selectLesson"
          />
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

    <!-- Confirmación de avance guardado -->
    <div
      v-if="avisoAvance"
      class="avance-toast"
      :class="`avance-toast-${avisoAvance.tipo}`"
      role="status"
      aria-live="polite"
    >
      {{ avisoAvance.texto }}
    </div>
  </div>
</template>
