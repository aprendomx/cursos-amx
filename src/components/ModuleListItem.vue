<script setup>
import { ref, nextTick } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  module: { type: Object, required: true },
  index: { type: Number, required: true },
  isActive: { type: Boolean, default: false },
  isFirst: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})
const emit = defineEmits(['remove', 'update', 'drop-lesson', 'move-up', 'move-down'])
const { t } = useI18n()

// Zona invisible que acepta lecciones arrastradas desde el timeline
const dropZone = []
function onLessonDrop(evt) {
  emit('drop-lesson', evt.oldIndex)
}

function confirmarRemove() {
  const count = props.module.lecciones?.length || 0
  if (window.confirm(t('builder.deleteModuleConfirm', { count }))) emit('remove')
}

/* Renombrado inline */
const renombrando = ref(false)
const tituloDraft = ref('')
const inputRef = ref(null)
async function empezarRenombrar() {
  tituloDraft.value = props.module.titulo || ''
  renombrando.value = true
  await nextTick()
  inputRef.value?.focus()
}
function confirmarRenombrar() {
  if (!renombrando.value) return // evita doble emit Enter→blur
  renombrando.value = false
  const titulo = tituloDraft.value.trim()
  if (titulo && titulo !== props.module.titulo) emit('update', { titulo })
}
</script>

<template>
  <div class="module-item" :class="{ active: isActive }" data-test="module-item">
    <span class="drag-handle" aria-hidden="true">≡</span>
    <div class="module-info">
      <input
        v-if="renombrando"
        ref="inputRef"
        v-model="tituloDraft"
        class="module-title-input"
        data-test="module-title-input"
        type="text"
        @click.stop
        @keydown.enter="confirmarRenombrar"
        @keydown.esc="renombrando = false"
        @blur="confirmarRenombrar"
      />
      <span v-else class="module-title">{{ module.titulo || t('builder.newModule') }}</span>
      <span class="module-count"
        >{{ module.lecciones?.length || 0 }} {{ t('builder.lessons') }}</span
      >
    </div>
    <div class="module-actions">
      <button
        data-test="module-rename"
        :aria-label="t('builder.edit')"
        @click.stop="empezarRenombrar"
      >
        ✎
      </button>
      <button
        v-if="!isFirst"
        data-test="module-up"
        :aria-label="`${module.titulo} arriba`"
        @click.stop="emit('move-up')"
      >
        ↑
      </button>
      <button
        v-if="!isLast"
        data-test="module-down"
        :aria-label="`${module.titulo} abajo`"
        @click.stop="emit('move-down')"
      >
        ↓
      </button>
      <button
        data-test="module-remove"
        :aria-label="t('builder.delete')"
        @click.stop="confirmarRemove"
      >
        ✕
      </button>
    </div>
    <VueDraggable
      :model-value="dropZone"
      :group="{ name: 'lecciones', pull: false, put: true }"
      class="lesson-drop"
      @add="onLessonDrop"
    />
  </div>
</template>

<style scoped>
.module-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 1);
  padding: calc(var(--unit) * 1.5);
  border-left: 3px solid transparent;
  border-bottom: 1px solid var(--line-soft);
  cursor: pointer;
  transition: background 0.15s var(--ease);
}
.module-item.active {
  border-left-color: var(--primary);
  background: var(--paper-2);
}
.drag-handle {
  color: var(--ink-4);
  cursor: grab;
}
.module-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.module-title {
  color: var(--ink);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.module-count {
  color: var(--ink-3);
  font-size: 12px;
}
.module-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s var(--ease);
}
.module-item:hover .module-actions,
.module-item:focus-within .module-actions {
  opacity: 1;
}
.module-actions button {
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink-2);
  border-radius: 6px;
  padding: 2px 6px;
  cursor: pointer;
}
.lesson-drop {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.module-item.sortable-drag-over .lesson-drop,
.lesson-drop:has(.sortable-ghost) {
  pointer-events: auto;
}
</style>
