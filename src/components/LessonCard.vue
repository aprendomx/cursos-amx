<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import IconSet from '@/components/IconSet.vue'
import { segToDuracion } from '@/lib/duracion.js'

const props = defineProps({
  lesson: { type: Object, required: true },
  index: { type: Number, required: true },
  moduleTitles: { type: Array, default: () => [] },
})
const emit = defineEmits(['edit', 'delete', 'duplicate', 'move-to'])
const { t } = useI18n()

const menuOpen = ref(false)

function cerrarMenu() {
  menuOpen.value = false
}

watch(menuOpen, (open) => {
  if (open) document.addEventListener('click', cerrarMenu)
  else document.removeEventListener('click', cerrarMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', cerrarMenu)
})

const ICONS = {
  youtube: 'video',
  hls: 'video',
  documento: 'doc',
  examen: 'exam',
  texto: 'doc',
  ninguno: 'doc',
}

function confirmarDelete() {
  menuOpen.value = false
  if (window.confirm(t('builder.deleteLessonConfirm', { title: props.lesson.titulo || '' })))
    emit('delete')
}

function doEdit() {
  menuOpen.value = false
  emit('edit')
}

function doDuplicate() {
  menuOpen.value = false
  emit('duplicate')
}

function doMoveTo(mi) {
  menuOpen.value = false
  emit('move-to', mi)
}
</script>

<template>
  <article
    class="lesson-card"
    data-test="lesson-card"
    @click="emit('edit')"
  >
    <span
      class="lesson-drag"
      aria-hidden="true"
    >≡</span>
    <div class="lesson-thumb">
      <IconSet :name="ICONS[lesson.fuente] || 'doc'" />
    </div>
    <div class="lesson-body">
      <h4 class="lesson-title">
        {{ lesson.titulo || t('builder.newLesson') }}
      </h4>
      <div class="lesson-meta">
        <span
          v-if="lesson.duracion_seg"
          class="lesson-duration"
        >
          {{ segToDuracion(lesson.duracion_seg) }}
        </span>
        <span
          v-if="lesson.fuente === 'examen'"
          class="badge"
        >📝 {{ t('builder.exam') }}</span>
        <span
          v-if="lesson.requiere_entrega"
          class="badge"
        >📎 {{ t('builder.delivery') }}</span>
        <span
          v-if="lesson.fuente === 'ninguno'"
          class="badge warn"
        >
          ⚠️ {{ t('builder.noContent') }}
        </span>
      </div>
    </div>
    <button
      class="lesson-menu-btn"
      data-test="lesson-menu"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      :aria-label="t('builder.lessonMenu')"
      @click.stop="menuOpen = !menuOpen"
    >
      ⋯
    </button>
    <div
      v-if="menuOpen"
      class="lesson-menu"
      role="menu"
      @click.stop
    >
      <button
        role="menuitem"
        @click="doEdit"
      >
        {{ t('builder.edit') }}
      </button>
      <button
        role="menuitem"
        data-test="lesson-duplicate"
        @click="doDuplicate"
      >
        {{ t('builder.duplicate') }}
      </button>
      <button
        v-for="(title, mi) in moduleTitles"
        :key="mi"
        role="menuitem"
        :data-test="`move-to-${mi}`"
        @click="doMoveTo(mi)"
      >
        {{ t('builder.moveTo') }} {{ title }}
      </button>
      <button
        role="menuitem"
        class="danger"
        data-test="lesson-delete"
        @click="confirmarDelete"
      >
        {{ t('builder.delete') }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.lesson-card {
  position: relative;
  width: 200px;
  min-height: 140px;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: visible;
}
.lesson-drag {
  position: absolute;
  top: 6px;
  left: 8px;
  color: var(--ink-4);
  cursor: grab;
  z-index: 1;
}
.lesson-thumb {
  height: 60%;
  min-height: 72px;
  display: grid;
  place-items: center;
  background: var(--paper-2);
  border-radius: 8px 8px 0 0;
  color: var(--ink-3);
}
.lesson-body {
  padding: calc(var(--unit) * 1);
}
.lesson-title {
  margin: 0 0 4px;
  font-size: 14px;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.lesson-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: var(--ink-3);
}
.badge {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 1px 8px;
}
.badge.warn {
  background: color-mix(in srgb, var(--warn) 15%, transparent);
  border-color: var(--warn);
}
.lesson-menu-btn {
  position: absolute;
  top: 4px;
  right: 6px;
  border: none;
  background: transparent;
  color: var(--ink-3);
  font-size: 18px;
  cursor: pointer;
}
.lesson-menu {
  position: absolute;
  top: 28px;
  right: 6px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow-pop);
  min-width: 160px;
}
.lesson-menu button {
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.lesson-menu button:hover {
  background: var(--paper-2);
}
.lesson-menu .danger {
  color: var(--danger);
}
</style>
