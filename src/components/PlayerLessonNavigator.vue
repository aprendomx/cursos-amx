<script setup>
import { watch, ref } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { featureEnabled } from '@/lib/featureFlags.js'
import { useGamificacion } from '@/composables/useGamificacion.js'
import { emitirEvento } from '@/services/analytics'
import IconSet from '@/components/IconSet.vue'
import BadgeNotification from '@/components/BadgeNotification.vue'

const props = defineProps({
  lecciones: { type: Array, required: true },
  currentLeccionId: { type: String, required: true },
  completedCount: { type: Number, required: true },
  progressFraction: { type: String, required: true },
  progressPct: { type: Number, required: true },
  variant: { type: String, default: 'split' },
  moduloTitulo: { type: String, default: '' },
})

const emit = defineEmits(['select'])

function isVertical() {
  return props.variant === 'split' || props.variant === 'stacked'
}

const auth = useAuthStore()
const gamificacionHabilitada = featureEnabled('gamificacion')
const gamificacion = ref(null)

watch(
  () => props.completedCount,
  async (newCount, oldCount) => {
    if (!gamificacionHabilitada) return
    if (oldCount === undefined) return
    if (newCount <= oldCount) return
    const userId = auth.session?.user?.id
    if (!userId) return
    if (!gamificacion.value) {
      gamificacion.value = useGamificacion(userId)
    }
    await gamificacion.value.verificarBadges()
    try {
      await emitirEvento({
        verb: 'completed',
        objectType: 'lesson',
        objectId: props.currentLeccionId,
      })
    } catch {
      /* best effort */
    }
  }
)
</script>

<template>
  <!-- Vertical list: split & stacked -->
  <div
    v-if="isVertical()"
    class="lesson-list"
    :class="{ 'stacked-lessons': variant === 'stacked' }"
  >
    <div class="lesson-list-header">
      <span class="eyebrow">{{ $t('navigator.eyebrow') }}</span>
      <h3 class="lesson-list-title">
        {{ moduloTitulo || $t('navigator.fallbackTitle') }}
      </h3>
      <span class="lesson-list-progress mono"
        >{{ progressFraction }} &middot; {{ progressPct }}%</span
      >
    </div>
    <ul class="lesson-items">
      <li
        v-for="l in lecciones"
        :key="l.id"
        class="lesson-item"
        :class="{
          'lesson-active': l.id === currentLeccionId,
          'lesson-completed': l.completado,
        }"
        @click="$emit('select', l.id)"
      >
        <div class="lesson-status-icon">
          <template v-if="l.completado">
            <span class="lesson-check"><IconSet name="check" /></span>
          </template>
          <template v-else-if="l.id === currentLeccionId">
            <span class="lesson-playing pulsing"><IconSet name="play" /></span>
          </template>
          <template v-else>
            <span class="lesson-num mono">{{ l.orden }}</span>
          </template>
        </div>
        <div class="lesson-info">
          <span class="lesson-name">{{ l.titulo }}</span>
          <span class="lesson-meta mono">{{ l.duracion }} &middot; {{ l.tipo }}</span>
        </div>
        <IconSet v-if="l.tipo === 'lectura'" name="doc" />
        <IconSet v-else name="clock" />
      </li>
    </ul>
  </div>

  <!-- Horizontal strip: focus -->
  <div v-else class="focus-lesson-strip">
    <div class="lesson-strip-header">
      <span class="eyebrow">{{ moduloTitulo || $t('navigator.fallbackTitle') }}</span>
      <span class="lesson-list-progress mono"
        >{{ progressFraction }} &middot; {{ progressPct }}%</span
      >
    </div>
    <div class="lesson-strip-items">
      <div
        v-for="l in lecciones"
        :key="l.id"
        class="lesson-strip-card"
        :class="{
          'lesson-active': l.id === currentLeccionId,
          'lesson-completed': l.completado,
        }"
        @click="$emit('select', l.id)"
      >
        <div class="lesson-status-icon">
          <template v-if="l.completado">
            <span class="lesson-check"><IconSet name="check" /></span>
          </template>
          <template v-else-if="l.id === currentLeccionId">
            <span class="lesson-playing pulsing"><IconSet name="play" /></span>
          </template>
          <template v-else>
            <span class="lesson-num mono">{{ l.orden }}</span>
          </template>
        </div>
        <div class="lesson-info">
          <span class="lesson-name">{{ l.titulo }}</span>
          <span class="lesson-meta mono">{{ l.duracion }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Badge notifications -->
  <template v-if="gamificacionHabilitada && gamificacion?.nuevosBadges?.length">
    <BadgeNotification
      v-for="badge in gamificacion.nuevosBadges"
      :key="badge.id"
      :badge="badge"
      @close="gamificacion.clearNuevos()"
    />
  </template>
</template>

<style scoped>
/* ─── Lesson list (vertical) ─────────────────────── */
.lesson-list {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  overflow-y: auto;
}

.stacked-lessons {
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  overflow-y: auto;
}

.lesson-list-header {
  padding: 20px 20px 12px;
}

.lesson-list-header .eyebrow {
  color: var(--ink-4);
  display: block;
  margin-bottom: 4px;
}

.lesson-list-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--paper);
  margin-bottom: 4px;
}

.lesson-list-progress {
  color: var(--ink-4);
  font-size: 11px;
}

.lesson-items {
  list-style: none;
  padding: 0 8px 8px;
}

.lesson-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 180ms var(--ease);
  border-left: 3px solid transparent;
}
.lesson-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.lesson-active {
  background: rgba(255, 255, 255, 0.06);
  border-left-color: var(--brand-accent);
}

.lesson-completed .lesson-check {
  color: var(--paper);
}

.lesson-status-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.lesson-check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--success);
  display: grid;
  place-items: center;
  color: var(--paper);
}

.lesson-playing {
  color: var(--brand-accent);
}

.lesson-num {
  color: var(--ink-4);
  font-size: 12px;
}

.lesson-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lesson-name {
  font-size: 13px;
  color: var(--paper);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lesson-meta {
  font-size: 10px;
  color: var(--ink-4);
}

.lesson-item > svg {
  color: var(--ink-4);
  flex-shrink: 0;
}

/* ─── Focus horizontal lesson strip ──────────────── */
.focus-lesson-strip {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 16px 24px 20px;
  flex-shrink: 0;
}

.lesson-strip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.lesson-strip-header .eyebrow {
  color: var(--ink-4);
}
.lesson-strip-header .lesson-list-progress {
  color: var(--ink-4);
}

.lesson-strip-items {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.lesson-strip-items::-webkit-scrollbar {
  height: 3px;
}
.lesson-strip-items::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.lesson-strip-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    background 180ms var(--ease),
    border-color 180ms var(--ease);
  border-left: 3px solid transparent;
}
.lesson-strip-card:hover {
  background: rgba(255, 255, 255, 0.07);
}
.lesson-strip-card.lesson-active {
  background: rgba(255, 255, 255, 0.08);
  border-left-color: var(--brand-accent);
}
</style>
