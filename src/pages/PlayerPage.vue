<script setup>
import '@/assets/player-layouts.css'
// EntregaAlumnoPanel y el heatmap usan clases de admin-shared.
import '@/assets/admin-shared.css'
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
  invitado,
  invitacionRegistro,
  cerrarInvitacion,
  irARegistroDesdeLeccion,
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
  // Sin sesión no hay eventos de video: la función exige auth y los eventos
  // llevarían user_id vacío.
  enabled: videoAnalyticsEnabled.value && !!session.value,
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
    <!-- Modo invitado: primera lección abierta, sin registro -->
    <div v-if="invitado" class="invitado-banner" data-test="invitado-banner">
      <span>
        Est&aacute;s probando la primera lecci&oacute;n, gratis y sin registrarte. Con una cuenta
        guardas tu avance, tomas notas y obtienes constancia al terminar.
      </span>
      <button class="btn btn-primary btn-sm" @click="irARegistroDesdeLeccion">
        Crear mi cuenta
      </button>
    </div>

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
      <!-- Invitado: el chat exige sesión; en su lugar, qué gana registrándose -->
      <aside v-if="invitado" class="invitado-pane" data-test="invitado-pane">
        <p class="eyebrow">Con tu cuenta</p>
        <ul class="invitado-lista">
          <li><IconSet name="check" /> <span>Guardas tu avance y retomas donde ibas.</span></li>
          <li><IconSet name="check" /> <span>Tomas notas y participas en las dudas.</span></li>
          <li><IconSet name="check" /> <span>Presentas evaluaciones.</span></li>
          <li>
            <IconSet name="check" /> <span>Obtienes tu constancia verificable al terminar.</span>
          </li>
        </ul>
        <button class="btn btn-primary" @click="irARegistroDesdeLeccion">Crear mi cuenta</button>
      </aside>
      <PlayerChatPane v-else v-model:draft="draft" :comentarios="comentarios" @send="sendComment" />
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

    <!-- Invitación a registrarse: aparece al intentar avanzar, guardar o
         evaluar sin sesión. No navega sola — el punto en el que estaba la
         persona no se pierde hasta que ella decide (tarea 4.4). -->
    <div
      v-if="invitacionRegistro"
      class="invitacion-overlay"
      data-test="invitacion-registro"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invitacion-titulo"
    >
      <div class="invitacion-card">
        <p class="eyebrow">Hasta aqu&iacute; llega la prueba</p>
        <h2 id="invitacion-titulo" class="display invitacion-titulo">
          Para continuar, crea tu cuenta.
        </h2>
        <p class="invitacion-texto">
          El resto del curso, tu avance, las notas y la constancia verificable van con tu cuenta. Es
          gratuito y tu lecci&oacute;n te espera donde la dejaste.
        </p>
        <div class="invitacion-acciones">
          <button class="btn btn-primary" @click="irARegistroDesdeLeccion">Crear mi cuenta</button>
          <button class="btn btn-ghost" @click="cerrarInvitacion">Seguir viendo</button>
        </div>
      </div>
    </div>

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

<style scoped>
/* ── Modo invitado (primera lección abierta) ── */
.invitado-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--unit) * 2);
  flex-wrap: wrap;
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 3);
  background: var(--paper-3);
  border-bottom: 2px solid var(--brand-accent);
  color: var(--ink);
  font-size: var(--text-sm);
  line-height: 1.5;
}
.invitado-banner span {
  max-width: 72ch;
}

.invitado-pane {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 3);
  border-left: 1px solid var(--line);
  background: var(--paper-2);
  align-self: start;
}
.invitado-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.invitado-lista li {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--unit) * 1);
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--ink-2);
}
.invitado-lista li :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--primary-fg);
}

/* Invitación modal: overlay propio, sin dependencia de librerías */
.invitacion-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: calc(var(--unit) * 3);
  background: rgba(0, 0, 0, 0.55);
}
.invitacion-card {
  background: var(--paper);
  color: var(--ink);
  border-radius: var(--radius-lg);
  padding: calc(var(--unit) * 4);
  max-width: 480px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
}
.invitacion-titulo {
  font-size: clamp(22px, 3vw, 30px);
  line-height: 1.1;
  color: var(--ink);
}
.invitacion-texto {
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--ink-2);
}
.invitacion-acciones {
  display: flex;
  gap: calc(var(--unit) * 1.5);
  flex-wrap: wrap;
  margin-top: calc(var(--unit) * 1);
}
</style>
