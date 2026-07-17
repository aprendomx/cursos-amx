<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ModuleList from '@/components/ModuleList.vue'
import LessonTimeline from '@/components/LessonTimeline.vue'
import LessonEditorPanel, { fuenteDe } from '@/components/LessonEditorPanel.vue'
import { useCourseBuilder } from '@/composables/useCourseBuilder.js'
import { guardarEvaluacionAdmin, cargarPreguntasAdmin } from '@/services/evaluaciones'

const props = defineProps({
  cursoId: { type: String, required: true },
  session: { type: Object, default: null },
})
const emit = defineEmits(['structure-changed'])
const { t } = useI18n()

const cb = useCourseBuilder(props.cursoId)
const activeIndex = ref(0)
const leccionAbierta = ref(null)
const arrastrandoLeccion = ref(false)

const moduloActivo = computed(() => cb.modulos.value[activeIndex.value] || null)
const leccionesActivas = computed(() =>
  (moduloActivo.value?.lecciones || []).map((l) => ({ ...l, fuente: fuenteDe(l) }))
)
const moduleTitles = computed(() => cb.modulos.value.map((m) => m.titulo))

const resumen = computed(() => {
  const lecciones = cb.modulos.value.reduce((s, m) => s + m.lecciones.length, 0)
  const advertencias = cb.modulos.value.reduce(
    (s, m) => s + m.lecciones.filter((l) => fuenteDe(l) === 'ninguno').length,
    0
  )
  return { modulos: cb.modulos.value.length, lecciones, advertencias }
})

watch(resumen, (r) => emit('structure-changed', { ...r }), { deep: true })
watch(cb.modulos, () => {
  if (activeIndex.value >= cb.modulos.value.length)
    activeIndex.value = Math.max(0, cb.modulos.value.length - 1)
})

onMounted(() => {
  cb.cargar()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function onKey(e) {
  if (!(e.ctrlKey || e.metaKey)) return
  if (e.key.toLowerCase() === 'm') {
    e.preventDefault()
    cb.agregarModulo()
  } else if (e.key.toLowerCase() === 'n' && moduloActivo.value) {
    e.preventDefault()
    cb.agregarLeccion(moduloActivo.value.id)
  }
}

async function abrirLeccion(index) {
  const l = leccionesActivas.value[index]
  if (!l) {
    leccionAbierta.value = null
    return
  }
  if (fuenteDe(l) === 'examen') {
    let preguntas = []
    try {
      preguntas = await cargarPreguntasAdmin(l.id)
    } catch (e) {
      cb.error.value = e
      return
    }
    leccionAbierta.value = { ...l, preguntas }
  } else {
    leccionAbierta.value = { ...l }
  }
}

async function guardarLeccion(patch) {
  const { fuente, preguntas, ...cols } = patch
  const id = leccionAbierta.value.id
  await cb.editarLeccion(id, cols)
  if (fuente === 'examen') await guardarEvaluacionAdmin(id, preguntas || [])
  leccionAbierta.value = null
}

function moverLeccionAModulo(lessonIndex, targetModuleIndex) {
  const l = leccionesActivas.value[lessonIndex]
  const target = cb.modulos.value[targetModuleIndex]
  if (!l || !target) return
  cb.moverLeccion(l.id, target.id, target.lecciones.length)
}

async function duplicarLeccion(lessonIndex) {
  const l = leccionesActivas.value[lessonIndex]
  if (!l || !moduloActivo.value) return
  // video_id NO se copia: videos.leccion_id apunta a una sola lección.
  const { id, orden, modulo_id, fuente, video_id, ...copia } = l
  if (fuente === 'examen') {
    let preguntas = []
    try {
      preguntas = await cargarPreguntasAdmin(l.id)
    } catch (e) {
      console.error('Error cargando preguntas para duplicar:', e)
    }
    const nuevaLeccion = await cb.agregarLeccion(moduloActivo.value.id, {
      ...copia,
      titulo: `${l.titulo} (copia)`,
    })
    if (nuevaLeccion?.id) {
      try {
        await guardarEvaluacionAdmin(nuevaLeccion.id, preguntas)
      } catch (e) {
        console.error('Error guardando preguntas del duplicado:', e)
      }
    }
  } else {
    cb.agregarLeccion(moduloActivo.value.id, { ...copia, titulo: `${l.titulo} (copia)` })
  }
}
</script>

<template>
  <div class="course-builder" :class="{ 'dragging-lesson': arrastrandoLeccion }">
    <p v-if="cb.error.value" class="builder-error" role="alert">
      {{ cb.error.value.message }}
    </p>
    <div class="builder-panels">
      <ModuleList
        :modules="cb.modulos.value"
        :active-index="activeIndex"
        @select="(i) => (activeIndex = i)"
        @add="cb.agregarModulo()"
        @remove="(i) => cb.quitarModulo(cb.modulos.value[i].id)"
        @reorder="(from, to) => cb.moverModulo(from, to)"
        @update="(i, patch) => cb.editarModulo(cb.modulos.value[i].id, patch)"
        @drop-lesson="(targetIdx, lessonIdx) => moverLeccionAModulo(lessonIdx, targetIdx)"
      />
      <LessonTimeline
        v-if="moduloActivo"
        :lessons="leccionesActivas"
        :module-title="moduloActivo.titulo"
        :module-titles="moduleTitles"
        @select="abrirLeccion"
        @add="cb.agregarLeccion(moduloActivo.id)"
        @remove="(i) => cb.quitarLeccion(leccionesActivas[i].id)"
        @reorder="(from, to) => cb.moverLeccion(leccionesActivas[from].id, moduloActivo.id, to)"
        @move="moverLeccionAModulo"
        @duplicate="duplicarLeccion"
        @drag-state="(v) => (arrastrandoLeccion = v)"
      />
    </div>
    <footer class="validation-bar" data-test="validation-bar">
      {{
        t('builder.validationSummary', {
          modules: resumen.modulos,
          lessons: resumen.lecciones,
          warnings: resumen.advertencias,
        })
      }}
      <span class="drag-hint">{{ t('builder.dragHint') }}</span>
    </footer>
    <LessonEditorPanel
      :lesson="leccionAbierta"
      :session="session"
      @save="guardarLeccion"
      @close="leccionAbierta = null"
    />
  </div>
</template>

<style scoped>
.course-builder {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  min-height: 420px;
}
.builder-panels {
  display: flex;
  flex: 1;
  min-height: 0;
}
.builder-error {
  margin: 0;
  padding: calc(var(--unit) * 1);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
  font-size: 14px;
}
.validation-bar {
  display: flex;
  justify-content: space-between;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 1) calc(var(--unit) * 2);
  border-top: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 13px;
  background: var(--paper);
}
.drag-hint {
  color: var(--ink-4);
}
@media (max-width: 768px) {
  .builder-panels {
    flex-direction: column;
  }
}
</style>
