<script setup>
// Tarjeta de edición de un módulo (AdminCourseEditor, paso Estructura):
// metadatos del módulo, portada y lista editable de lecciones.
// Muta `mod` directamente (mismo objeto reactivo del curso en edición).
import IconSet from '@/components/IconSet.vue'
import VideoUploadField from '@/components/VideoUploadField.vue'
import DocumentoUploadField from '@/components/DocumentoUploadField.vue'
import EvaluacionEditor from '@/components/EvaluacionEditor.vue'
import PortadaUploadField from '@/components/PortadaUploadField.vue'
import { featureEnabled } from '@/lib/featureFlags.js'
import { tipoOptions } from '@/composables/useCourseEditorModel'

defineProps({
  mod: { type: Object, required: true },
  mi: { type: Number, required: true },
  total: { type: Number, required: true },
})

const emit = defineEmits(['move', 'remove', 'add-lesson', 'remove-lesson'])
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -- `mod` es el mismo objeto
       reactivo del curso en edición: mutarlo aquí es el contrato con
       AdminCourseEditor (igual que `lec` dentro del v-for). -->
  <div class="editor-module card">
    <div class="editor-module-header">
      <span class="mono" :style="{ color: 'var(--ink-4)' }"> Módulo {{ mi + 1 }} </span>
      <div :style="{ display: 'flex', gap: '4px' }">
        <button
          class="editor-icon-btn"
          :disabled="mi === 0"
          title="Mover arriba"
          @click="emit('move', -1)"
        >
          &uarr;
        </button>
        <button
          class="editor-icon-btn"
          :disabled="mi === total - 1"
          title="Mover abajo"
          @click="emit('move', 1)"
        >
          &darr;
        </button>
        <button
          class="editor-icon-btn editor-icon-btn-danger"
          :disabled="total <= 1"
          title="Eliminar módulo"
          @click="emit('remove')"
        >
          &times;
        </button>
      </div>
    </div>

    <div class="editor-module-body">
      <div class="field">
        <label>Título del módulo</label>
        <input v-model="mod.titulo" type="text" placeholder="Ej. Fundamentos de la transparencia" />
      </div>
      <div class="field">
        <label>Descripción</label>
        <textarea
          v-model="mod.descripcion"
          rows="2"
          placeholder="Breve descripción del módulo..."
          :style="{ resize: 'vertical' }"
        />
      </div>
      <label class="editor-checkbox">
        <input v-model="mod.requiere_previo" type="checkbox" />
        <span>Requiere completar módulo previo</span>
      </label>

      <div class="field">
        <label>Portada del módulo</label>
        <PortadaUploadField
          v-model="mod.imagen_portada"
          confirm-message="¿Quitar la portada del módulo?"
        />
      </div>

      <!-- Lecciones -->
      <div class="editor-lessons">
        <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 1)' }">
          Lecciones ({{ mod.lecciones.length }})
        </p>
        <div v-for="(lec, li) in mod.lecciones" :key="lec.id" class="editor-lesson-row">
          <span class="mono" :style="{ color: 'var(--ink-4)', minWidth: '28px' }">
            {{ String(li + 1).padStart(2, '0') }}
          </span>
          <input
            v-model="lec.titulo"
            type="text"
            placeholder="Título de la lección"
            class="editor-lesson-input"
          />
          <select v-model="lec.tipo" class="editor-lesson-select">
            <option v-for="t in tipoOptions" :key="t" :value="t">
              {{ t }}
            </option>
          </select>
          <div class="leccion-fuente">
            <label class="leccion-fuente-opt">
              <input v-model="lec.fuente" type="radio" :value="'youtube'" /> YouTube
            </label>
            <label class="leccion-fuente-opt">
              <input v-model="lec.fuente" type="radio" :value="'hls'" /> HLS
            </label>
            <label class="leccion-fuente-opt">
              <input v-model="lec.fuente" type="radio" :value="'documento'" />
              Documento
            </label>
            <label class="leccion-fuente-opt">
              <input v-model="lec.fuente" type="radio" :value="'ninguno'" /> Sin contenido
            </label>
            <label v-if="featureEnabled('evaluaciones')" class="leccion-fuente-opt">
              <input v-model="lec.fuente" type="radio" :value="'examen'" /> Examen
            </label>
          </div>

          <input
            v-if="lec.fuente === 'youtube'"
            v-model="lec.youtube_url"
            type="url"
            placeholder="URL de YouTube"
            class="editor-lesson-input"
            :style="{ flex: '1.5' }"
          />

          <VideoUploadField
            v-else-if="lec.fuente === 'hls'"
            :leccion-id="lec.id"
            :video-id="lec.video_id || null"
            @video-id-updated="(id) => (lec.video_id = id)"
          />
          <DocumentoUploadField
            v-else-if="lec.fuente === 'documento'"
            :leccion-id="lec.id"
            :documento-path="lec.documento_path || null"
            :documento-tipo="lec.documento_tipo || null"
            @documento-updated="
              (data) => {
                lec.documento_path = data?.path || null
                lec.documento_tipo = data?.tipo || null
              }
            "
          />
          <input
            v-model="lec.duracion"
            type="text"
            placeholder="mm:ss"
            class="editor-lesson-input"
            :style="{ maxWidth: '80px' }"
          />
          <button
            class="editor-icon-btn editor-icon-btn-danger"
            :disabled="mod.lecciones.length <= 1"
            @click="emit('remove-lesson', li)"
          >
            &times;
          </button>

          <!-- Entrega de archivo -->
          <div
            v-if="featureEnabled('entregas')"
            :style="{
              flexBasis: '100%',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }"
          >
            <label class="leccion-fuente-opt">
              <input v-model="lec.requiere_entrega" type="checkbox" />
              Requiere entrega de archivo
            </label>
            <template v-if="lec.requiere_entrega">
              <input
                v-model="lec.entrega_tipos_csv"
                type="text"
                placeholder="pdf, docx, zip, png, jpg"
                title="Extensiones permitidas, separadas por coma"
                class="editor-lesson-input"
                :style="{ maxWidth: '220px' }"
              />
              <input
                v-model.number="lec.entrega_max_mb"
                type="number"
                min="1"
                max="50"
                title="Tamaño máximo en MB"
                class="editor-lesson-input"
                :style="{ maxWidth: '70px' }"
              />
              <span class="mono" :style="{ fontSize: '10px', color: 'var(--ink-4)' }"
                >MB m&aacute;x</span
              >
            </template>
          </div>

          <!-- Evaluación -->
          <div
            v-if="featureEnabled('evaluaciones') && lec.fuente === 'examen'"
            :style="{
              flexBasis: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }"
          >
            <div
              :style="{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }"
            >
              <label class="leccion-fuente-opt">
                Puntaje mínimo (%)
                <input
                  v-model.number="lec.eval_puntaje_minimo"
                  type="number"
                  min="0"
                  max="100"
                  class="editor-lesson-input"
                  :style="{ maxWidth: '80px' }"
                />
              </label>
              <label class="leccion-fuente-opt">
                Máx. intentos
                <input
                  v-model.number="lec.eval_max_intentos"
                  type="number"
                  min="1"
                  class="editor-lesson-input"
                  :style="{ maxWidth: '70px' }"
                />
              </label>
            </div>
            <EvaluacionEditor :preguntas="lec.preguntas" />
          </div>
        </div>
        <button
          class="btn btn-ghost btn-sm"
          :style="{ marginTop: 'calc(var(--unit) * 1)' }"
          @click="emit('add-lesson')"
        >
          + Agregar lección
        </button>
      </div>
    </div>
  </div>
</template>
