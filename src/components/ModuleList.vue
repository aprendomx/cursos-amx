<script setup>
import { ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import ModuleListItem from '@/components/ModuleListItem.vue'

const props = defineProps({
  modules: { type: Array, required: true },
  activeIndex: { type: Number, default: 0 },
})
const emit = defineEmits(['reorder', 'add', 'remove', 'select', 'update', 'drop-lesson'])
const { t } = useI18n()

// Copia local: VueDraggable necesita v-model; la fuente de verdad vive arriba.
const local = ref([...props.modules])
watch(
  () => props.modules,
  (v) => {
    local.value = [...v]
  },
  { deep: true }
)

function onEnd(evt) {
  if (evt.oldIndex !== evt.newIndex) emit('reorder', evt.oldIndex, evt.newIndex)
}
</script>

<template>
  <aside class="module-list" role="list" :aria-label="t('builder.modules')">
    <h3 class="module-list-title">
      {{ t('builder.modules') }}
    </h3>
    <p v-if="!modules.length" class="module-empty">
      {{ t('builder.emptyModules') }}
    </p>
    <VueDraggable v-model="local" handle=".drag-handle" :animation="150" @end="onEnd">
      <ModuleListItem
        v-for="(m, i) in local"
        :key="m.id"
        role="listitem"
        :module="m"
        :index="i"
        :is-active="i === activeIndex"
        :is-first="i === 0"
        :is-last="i === local.length - 1"
        @click="emit('select', i)"
        @remove="emit('remove', i)"
        @update="(patch) => emit('update', i, patch)"
        @move-up="emit('reorder', i, i - 1)"
        @move-down="emit('reorder', i, i + 1)"
        @drop-lesson="(lessonOldIndex) => emit('drop-lesson', i, lessonOldIndex)"
      />
    </VueDraggable>
    <button class="add-module" data-test="add-module" @click="emit('add')">
      + {{ t('builder.addModule') }}
    </button>
  </aside>
</template>

<style scoped>
.module-list {
  width: 260px;
  flex-shrink: 0;
  background: var(--paper);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
}
.module-list-title {
  margin: 0;
  padding: calc(var(--unit) * 1.5);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-3);
}
.module-empty {
  padding: calc(var(--unit) * 2);
  color: var(--ink-3);
  font-size: 14px;
}
.add-module {
  margin: calc(var(--unit) * 1.5);
  padding: calc(var(--unit) * 1);
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
}
.add-module:hover {
  border-color: var(--primary);
  color: var(--primary);
}
@media (max-width: 768px) {
  .module-list {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--line);
  }
}
</style>
