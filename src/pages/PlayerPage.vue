<script setup>
import { defineProps } from 'vue'
import IconSet from '@/components/IconSet.vue'
import PlayerVideoSurface from '@/components/PlayerVideoSurface.vue'
import PlayerChatPane from '@/components/PlayerChatPane.vue'
import PlayerLessonNavigator from '@/components/PlayerLessonNavigator.vue'
import EntregaUploadField from '@/components/EntregaUploadField.vue'
import { featureEnabled } from '@/lib/featureFlags.js'
import { usePlayerPage } from '@/composables/usePlayerPage.js'
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
</script>
<template>
  <div
    class="player-page"
    :class="`variant-${variant}`"
  >
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
          <button
            :class="{ on: variant === 'split' }"
            @click="setVariant('split')"
          >
            Split
          </button>
          <button
            :class="{ on: variant === 'stacked' }"
            @click="setVariant('stacked')"
          >
            Chat inferior
          </button>
          <button
            :class="{ on: variant === 'focus' }"
            @click="setVariant('focus')"
          >
            Enfoque
          </button>
        </div>
      </div>
    </header>

    <!-- Split -->
    <div
      v-if="variant === 'split'"
      class="layout-split"
    >
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
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
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
      <PlayerChatPane
        v-model:draft="draft"
        :comentarios="comentarios"
        @send="sendComment"
      />
    </div>

    <!-- Stacked -->
    <div
      v-else-if="variant === 'stacked'"
      class="layout-stacked"
    >
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
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
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
        <PlayerChatPane
          v-model:draft="draft"
          :comentarios="comentarios"
          @send="sendComment"
        />
      </div>
    </div>

    <!-- Focus -->
    <div
      v-else
      class="layout-focus"
    >
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
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />
        <div class="focus-below">
          <div class="focus-title-block">
            <span class="eyebrow">Modulo 02 &middot; Leccion {{ leccion.orden }}</span>
            <h2 class="display-italic focus-lesson-title">
              {{ leccion.titulo }}
            </h2>
          </div>
          <div class="focus-actions">
            <button
              class="btn btn-ghost btn-sm"
              title="Notas (proximamente)"
              @click="() => {}"
            >
              <IconSet name="doc" /> Notas
            </button>
            <button
              class="btn btn-ghost btn-sm"
              title="Chat (proximamente)"
              @click="() => {}"
            >
              <IconSet name="chat" /> Chat
            </button>
            <button
              v-if="completada"
              class="btn btn-primary btn-sm"
              @click="goToNextLesson"
            >
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
  </div>
</template>
