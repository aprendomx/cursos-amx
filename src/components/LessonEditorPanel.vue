<script>
export function fuenteDe(l) {
  if (l.tipo_material === 'examen') return 'examen'
  if (l.documento_path) return 'documento'
  if (l.video_id) return 'hls'
  if (l.contenido) return 'texto'
  if (l.url_youtube) return 'youtube'
  return 'ninguno'
}

function parseEntregaTipos(csv) {
  const tipos = String(csv || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/^\./, ''))
    .filter(Boolean)
  return tipos.length ? tipos : ['pdf', 'docx', 'zip', 'png', 'jpg']
}

export function leccionPatch(l) {
  return {
    titulo: l.titulo,
    tipo_material:
      l.fuente === 'examen'
        ? 'examen'
        : l.fuente === 'documento' || l.fuente === 'texto'
          ? 'lectura'
          : l.tipo_material && l.tipo_material !== 'examen'
            ? l.tipo_material
            : 'video',
    url_youtube: l.fuente === 'youtube' ? l.url_youtube || null : null,
    video_id: l.fuente === 'hls' ? l.video_id || null : null,
    documento_path: l.fuente === 'documento' ? l.documento_path || null : null,
    documento_tipo: l.fuente === 'documento' ? l.documento_tipo || null : null,
    contenido: l.fuente === 'texto' ? l.contenido || null : null,
    duracion_seg: l.duracion_seg || 0,
    requiere_entrega: l.requiere_entrega === true,
    entrega_tipos: parseEntregaTipos(l.entrega_tipos_csv),
    entrega_max_mb: Math.min(50, Math.max(1, parseInt(l.entrega_max_mb, 10) || 10)),
    eval_puntaje_minimo: l.fuente === 'examen' ? Number(l.eval_puntaje_minimo) || 70 : 70,
    eval_max_intentos: l.fuente === 'examen' ? Number(l.eval_max_intentos) || 3 : 3,
  }
}
</script>

<script setup>
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import VideoUploadField from '@/components/VideoUploadField.vue'
import DocumentoUploadField from '@/components/DocumentoUploadField.vue'
import EvaluacionEditor from '@/components/EvaluacionEditor.vue'
import LessonRichTextEditor from '@/components/LessonRichTextEditor.vue'
import { parseDuracionToSeg, segToDuracion } from '@/lib/duracion.js'

const props = defineProps({
  lesson: { type: Object, default: null },
  session: { type: Object, default: null },
})
const emit = defineEmits(['save', 'close'])
const { t } = useI18n()

const FUENTES = ['youtube', 'hls', 'documento', 'examen', 'texto', 'ninguno']
const local = ref(null)
const dirty = ref(false)
const richRef = ref(null)
const duracionStr = ref('')
let preguntasSnapshot = ''

watch(
  () => props.lesson,
  (l) => {
    local.value = l
      ? {
          ...l,
          fuente: l.fuente || fuenteDe(l),
          // Finding 2: deep-copy to avoid aliasing parent's preguntas array
          preguntas: (l.preguntas || []).map((p) => ({
            ...p,
            opciones: (p.opciones || []).map((o) => ({ ...o })),
          })),
          // Fix 3: initialize entrega_tipos_csv from entrega_tipos array or csv string
          entrega_tipos_csv: Array.isArray(l.entrega_tipos)
            ? l.entrega_tipos.join(', ')
            : l.entrega_tipos_csv || 'pdf, docx, zip, png, jpg',
        }
      : null
    duracionStr.value = l ? segToDuracion(l.duracion_seg) : ''
    dirty.value = false
    // Finding 3: snapshot taken AFTER building local, so open doesn't mark dirty
    preguntasSnapshot = JSON.stringify(local.value?.preguntas ?? [])
  },
  { immediate: true }
)

// Finding 3: deep watch on preguntas for exam-editor mutations
watch(
  () => local.value?.preguntas,
  (p) => {
    if (local.value && JSON.stringify(p) !== preguntasSnapshot) marcarDirty()
  },
  { deep: true }
)

const abierto = computed(() => !!local.value)

function marcarDirty() {
  dirty.value = true
}

function onEsc() {
  if (dirty.value && !window.confirm(t('builder.unsavedConfirm'))) return
  emit('close')
}

function guardar() {
  richRef.value?.flush?.()
  local.value.duracion_seg = parseDuracionToSeg(duracionStr.value)
  emit('save', {
    ...leccionPatch(local.value),
    fuente: local.value.fuente,
    preguntas: local.value.preguntas,
  })
  dirty.value = false
}
</script>

<template>
  <!-- Finding 1: teleport to body so position:fixed escapes any transform-retaining ancestor -->
  <teleport to="body">
    <template v-if="abierto">
      <div class="panel-backdrop" @click="onEsc" />
      <aside
        class="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('builder.editLesson')"
        tabindex="-1"
        @keydown.esc="onEsc"
      >
        <header class="panel-header">
          <h3>{{ t('builder.editLesson') }}</h3>
          <span v-if="dirty" class="unsaved">{{ t('builder.unsaved') }}</span>
          <button class="panel-close" :aria-label="t('builder.cancel')" @click="onEsc">✕</button>
        </header>

        <div class="panel-body">
          <label class="field">
            {{ t('builder.title') }}
            <input
              v-model="local.titulo"
              data-test="lesson-titulo"
              type="text"
              @input="marcarDirty"
            />
          </label>

          <fieldset class="field">
            <legend>{{ t('builder.source') }}</legend>
            <label v-for="f in FUENTES" :key="f" class="radio">
              <input
                v-model="local.fuente"
                type="radio"
                name="fuente"
                :value="f"
                :data-test="`fuente-${f}`"
                @change="marcarDirty"
              />
              {{ t(`builder.source${f.charAt(0).toUpperCase() + f.slice(1)}`) }}
            </label>
          </fieldset>

          <!-- Finding 4: i18n keys for hardcoded YouTube literals -->
          <label v-if="local.fuente === 'youtube'" class="field">
            {{ t('builder.youtubeUrl') }}
            <input
              v-model="local.url_youtube"
              type="url"
              placeholder="https://youtube.com/watch?v=…"
              @input="marcarDirty"
            />
            <iframe
              v-if="/youtu\.?be/.test(local.url_youtube || '')"
              class="yt-preview"
              :src="`https://www.youtube.com/embed/${(local.url_youtube.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1] || ''}?rel=0`"
              :title="t('builder.youtubePreview')"
            />
          </label>

          <!-- VideoUploadField: real props leccionId + videoId, emit videoId-updated -->
          <VideoUploadField
            v-if="local.fuente === 'hls'"
            :leccion-id="local.id"
            :video-id="local.video_id || null"
            @video-id-updated="
              (id) => {
                local.video_id = id
                marcarDirty()
              }
            "
          />

          <!-- DocumentoUploadField: real props leccionId + documentoPath + documentoTipo, emit documento-updated -->
          <DocumentoUploadField
            v-if="local.fuente === 'documento'"
            :leccion-id="local.id"
            :documento-path="local.documento_path || null"
            :documento-tipo="local.documento_tipo || null"
            @documento-updated="
              (data) => {
                local.documento_path = data?.path || null
                local.documento_tipo = data?.tipo || null
                marcarDirty()
              }
            "
          />

          <!-- EvaluacionEditor: real prop preguntas (mutates in-place, no emits) -->
          <EvaluacionEditor v-if="local.fuente === 'examen'" :preguntas="local.preguntas" />

          <!-- Fix 3: Eval config fields (only for examen) -->
          <template v-if="local.fuente === 'examen'">
            <label class="field">
              {{ t('builder.minScore') }}
              <input
                v-model.number="local.eval_puntaje_minimo"
                data-test="eval-min-score"
                type="number"
                min="0"
                max="100"
                @input="marcarDirty"
              />
            </label>
            <label class="field">
              {{ t('builder.maxAttempts') }}
              <input
                v-model.number="local.eval_max_intentos"
                data-test="eval-max-attempts"
                type="number"
                min="1"
                @input="marcarDirty"
              />
            </label>
          </template>

          <LessonRichTextEditor
            v-if="local.fuente === 'texto'"
            ref="richRef"
            v-model="local.contenido"
            @dirty="marcarDirty"
          />

          <label class="field">
            {{ t('builder.duration') }}
            <input v-model="duracionStr" type="text" placeholder="12:30" @input="marcarDirty" />
          </label>

          <!-- Fix 3: Entrega fields (always visible) -->
          <label class="field">
            <label class="radio">
              <input
                v-model="local.requiere_entrega"
                data-test="requiere-entrega"
                type="checkbox"
                @change="marcarDirty"
              />
              {{ t('builder.requiresDelivery') }}
            </label>
          </label>
          <label class="field">
            {{ t('builder.deliveryTypes') }}
            <input
              v-model="local.entrega_tipos_csv"
              data-test="entrega-tipos"
              type="text"
              placeholder="pdf, docx, zip, png, jpg"
              @input="marcarDirty"
            />
          </label>
          <label class="field">
            {{ t('builder.deliveryMaxMb') }}
            <input
              v-model.number="local.entrega_max_mb"
              data-test="entrega-max-mb"
              type="number"
              min="1"
              max="50"
              @input="marcarDirty"
            />
          </label>
        </div>

        <footer class="panel-footer">
          <button class="btn-secondary" data-test="panel-cancel" @click="emit('close')">
            {{ t('builder.cancel') }}
          </button>
          <button class="btn-primary" data-test="panel-save" @click="guardar">
            {{ t('builder.save') }}
          </button>
        </footer>
      </aside>
    </template>
  </teleport>
</template>

<style scoped>
.panel-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.15);
  z-index: 90;
}
.panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(480px, 100vw);
  background: var(--paper);
  border-left: 1px solid var(--line);
  z-index: 91;
  display: flex;
  flex-direction: column;
  animation: slide-in 0.2s var(--ease);
}
@keyframes slide-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
.panel-header {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 1);
  padding: calc(var(--unit) * 2);
  border-bottom: 1px solid var(--line-soft);
}
.panel-header h3 {
  margin: 0;
  flex: 1;
  color: var(--ink);
}
.unsaved {
  color: var(--warn);
  font-size: 12px;
}
.panel-close {
  border: none;
  background: transparent;
  color: var(--ink-3);
  font-size: 18px;
  cursor: pointer;
}
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--ink-2);
  font-size: 14px;
}
.field input[type='text'],
.field input[type='url'] {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--paper);
  color: var(--ink);
}
fieldset.field {
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  padding: calc(var(--unit) * 1);
}
.radio {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.yt-preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  border-radius: 8px;
  margin-top: 8px;
}
.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: calc(var(--unit) * 1);
  padding: calc(var(--unit) * 2);
  border-top: 1px solid var(--line-soft);
}
.btn-primary {
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
}
.btn-secondary {
  background: transparent;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
}
</style>
