<script setup>
import { ref, watch, computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import LessonCard from '@/components/LessonCard.vue'
import { segToDuracion } from '@/lib/duracion.js'

const props = defineProps({
  lessons: { type: Array, required: true },
  moduleTitle: { type: String, default: '' },
  moduleTitles: { type: Array, default: () => [] },
})
const emit = defineEmits(['reorder', 'move', 'add', 'remove', 'select', 'duplicate', 'drag-state'])
const { t } = useI18n()

const local = ref([...props.lessons])
watch(
  () => props.lessons,
  (v) => {
    local.value = [...v]
  },
  { deep: true }
)

const totalSeg = computed(() => props.lessons.reduce((s, l) => s + (l.duracion_seg || 0), 0))
const sinContenido = computed(() => props.lessons.filter((l) => l.fuente === 'ninguno').length)

function onStart() {
  emit('drag-state', true)
}

function onEnd(evt) {
  if (evt.oldIndex !== evt.newIndex) emit('reorder', evt.oldIndex, evt.newIndex)
  emit('drag-state', false)
}
</script>

<template>
  <section
    class="timeline"
    :aria-label="moduleTitle"
  >
    <header class="timeline-header">
      <h3>{{ moduleTitle }}</h3>
      <p class="timeline-stats">
        {{ t('builder.totalDuration') }}: {{ segToDuracion(totalSeg) || '0:00' }} ·
        {{ lessons.length }} {{ t('builder.lessons') }}
        <template v-if="sinContenido">
          · {{ sinContenido }} {{ t('builder.noContent').toLowerCase() }}
        </template>
      </p>
    </header>
    <p
      v-if="!lessons.length"
      class="timeline-empty"
    >
      {{ t('builder.emptyTimeline') }}
    </p>
    <div
      class="timeline-scroll"
      role="list"
    >
      <VueDraggable
        v-model="local"
        class="timeline-track"
        handle=".lesson-drag"
        :group="{ name: 'lecciones', pull: true, put: true }"
        :animation="150"
        @start="onStart"
        @end="onEnd"
      >
        <LessonCard
          v-for="(l, i) in local"
          :key="l.id"
          role="listitem"
          :lesson="l"
          :index="i"
          :module-titles="moduleTitles"
          @edit="emit('select', i)"
          @delete="emit('remove', i)"
          @duplicate="emit('duplicate', i)"
          @move-to="(mi) => emit('move', i, mi)"
        />
      </VueDraggable>
      <button
        class="add-lesson"
        data-test="add-lesson"
        :aria-label="t('builder.addLesson')"
        @click="emit('add')"
      >
        +
      </button>
    </div>
  </section>
</template>

<style scoped>
.timeline {
  flex: 1;
  min-width: 0;
  background: var(--paper-2);
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.timeline-header h3 {
  margin: 0;
  color: var(--ink);
}
.timeline-stats {
  margin: 4px 0 0;
  color: var(--ink-3);
  font-size: 13px;
}
.timeline-empty {
  color: var(--ink-3);
  border: 1px dashed var(--line);
  border-radius: 8px;
  padding: calc(var(--unit) * 3);
  text-align: center;
}
.timeline-scroll {
  display: flex;
  align-items: stretch;
  gap: calc(var(--unit) * 1.5);
  overflow-x: auto;
  padding-bottom: calc(var(--unit) * 1);
}
.timeline-track {
  display: flex;
  gap: calc(var(--unit) * 1.5);
}
.add-lesson {
  flex-shrink: 0;
  width: 64px;
  min-height: 140px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--ink-3);
  font-size: 24px;
  cursor: pointer;
}
.add-lesson:hover {
  border-color: var(--primary);
  color: var(--primary);
}
@media (max-width: 768px) {
  .timeline-scroll,
  .timeline-track {
    flex-direction: column;
    overflow-x: visible;
  }
  .lesson-card {
    width: 100%;
  }
}
</style>
