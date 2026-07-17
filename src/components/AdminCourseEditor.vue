<script setup>
// Editor de cursos del admin: orquesta los tres pasos (Básico, Estructura,
// Revisar). El modelo y la validación viven en useCourseEditorModel; la
// carga/publicación en useCursoPersistence; la edición de módulos en
// ModuleEditorCard y la portada en PortadaUploadField.
import { computed, ref, watch, onMounted } from 'vue'
import IconSet from '@/components/IconSet.vue'
import PlaceholderImage from '@/components/PlaceholderImage.vue'
import CourseBuilder from '@/components/CourseBuilder.vue'
import ModuleEditorCard from '@/components/ModuleEditorCard.vue'
import PortadaUploadField from '@/components/PortadaUploadField.vue'
import { useFeatureFlags } from '@/composables/useFeatureFlags.js'
import {
  useCourseEditorModel,
  createBlankCurso,
  autoSlug,
  isUuid,
  nivelOptions,
  idiomaOptions,
} from '@/composables/useCourseEditorModel'
import { useCursoPersistence } from '@/composables/useCursoPersistence.js'

const props = defineProps({
  session: { type: Object, default: null },
  initialCurso: { type: Object, default: null },
})

const emit = defineEmits(['published', 'cancel'])

const isUrl = (v) => typeof v === 'string' && /^(https?:|\/)/.test(v)

const editorStep = ref(0)

const { isEnabled, load: loadFlags } = useFeatureFlags()
onMounted(loadFlags)
const visualBuilder = computed(() => isEnabled('visual_builder'))
const builderResumen = ref(null)

const {
  editingCurso,
  addModule,
  removeModule,
  moveModule,
  addLesson,
  removeLesson,
  validationChecks,
  allValid,
  editorSummary,
} = useCourseEditorModel({ visualBuilder, builderResumen })

const { publishing, publishStatus, creandoBorrador, loadCurso, crearBorrador, publishCurso } =
  useCursoPersistence({
    editingCurso,
    getSession: () => props.session,
    visualBuilder,
    allValid,
    validationChecks,
    onPublished: (cursoId) => emit('published', cursoId),
  })

watch(
  () => props.initialCurso,
  (curso) => {
    editorStep.value = 0
    publishStatus.value = null
    if (curso) {
      loadCurso(curso)
    } else {
      editingCurso.value = createBlankCurso()
    }
  },
  { immediate: true }
)

// Auto-slug desde el título.
watch(
  () => editingCurso.value?.titulo,
  (val) => {
    if (editingCurso.value && val) {
      editingCurso.value.slug = autoSlug(val)
    }
  }
)

/* ── Navegación de pasos ──────────────────────────── */
async function goToStep(i) {
  if (creandoBorrador.value) return
  // Con el constructor visual la estructura se persiste en vivo: para entrar
  // a Estructura el curso necesita existir en la base (borrador).
  if (i >= 1 && visualBuilder.value && !isUuid(editingCurso.value.id)) {
    if (!editingCurso.value.titulo || !editingCurso.value.slug) {
      publishStatus.value = { type: 'error', text: 'Completa el título antes de continuar.' }
      return
    }
    const ok = await crearBorrador()
    if (!ok) return
  }
  editorStep.value = i
}
</script>

<template>
  <div v-if="editingCurso" class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Editor de curso</p>
        <h1 class="display" :style="{ fontSize: '28px', color: 'var(--ink)', marginTop: '4px' }">
          {{ editingCurso.titulo || 'Nuevo curso' }}
        </h1>
      </div>
      <button class="btn btn-ghost btn-sm" @click="$emit('cancel')">
        <IconSet name="close" />
        Cerrar
      </button>
    </div>

    <!-- Step indicator -->
    <div class="editor-steps">
      <button
        v-for="(label, i) in ['Básico', 'Estructura', 'Revisar']"
        :key="i"
        class="editor-step-btn"
        :class="{ active: editorStep === i, completed: editorStep > i }"
        @click="goToStep(i)"
      >
        <span class="editor-step-num">{{ i + 1 }}</span>
        {{ label }}
      </button>
    </div>

    <!-- Step 1: Basico -->
    <div v-if="editorStep === 0" class="editor-panel fade-in">
      <div class="editor-fields">
        <div class="field">
          <label>Título del curso</label>
          <input
            v-model="editingCurso.titulo"
            type="text"
            placeholder="Ej. Transparencia y Rendición de Cuentas"
          />
        </div>
        <div class="field">
          <label>Slug (auto)</label>
          <input
            v-model="editingCurso.slug"
            type="text"
            :style="{ color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: '14px' }"
            readonly
          />
        </div>
        <div class="field">
          <label>Descripción</label>
          <textarea
            v-model="editingCurso.descripcion"
            rows="4"
            placeholder="Describe el contenido y objetivos del curso..."
            :style="{ resize: 'vertical' }"
          />
        </div>
        <div
          :style="{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'calc(var(--unit) * 3)',
          }"
        >
          <div class="field">
            <label>Nivel</label>
            <select v-model="editingCurso.nivel">
              <option v-for="n in nivelOptions" :key="n" :value="n">
                {{ n }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Idioma</label>
            <select v-model="editingCurso.idioma">
              <option v-for="i in idiomaOptions" :key="i" :value="i">
                {{ i }}
              </option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Imagen de portada</label>
          <PortadaUploadField v-model="editingCurso.imagen" />
        </div>
        <label class="editor-checkbox">
          <input v-model="editingCurso.publicado" type="checkbox" />
          <span>Publicar curso inmediatamente</span>
        </label>
      </div>

      <div class="editor-nav">
        <div />
        <button class="btn btn-primary btn-sm" :disabled="creandoBorrador" @click="goToStep(1)">
          <template v-if="creandoBorrador"> Creando borrador&hellip; </template>
          <template v-else> Siguiente: Estructura </template>
        </button>
      </div>
    </div>

    <!-- Step 2: Estructura -->
    <div v-else-if="editorStep === 1" class="editor-panel fade-in">
      <CourseBuilder
        v-if="visualBuilder && isUuid(editingCurso.id)"
        :curso-id="editingCurso.id"
        :session="session"
        @structure-changed="(r) => (builderResumen = r)"
      />
      <template v-else>
        <div class="editor-structure-layout">
          <div class="editor-modules">
            <ModuleEditorCard
              v-for="(mod, mi) in editingCurso.modulos"
              :key="mod.id"
              :mod="mod"
              :mi="mi"
              :total="editingCurso.modulos.length"
              @move="(dir) => moveModule(mi, dir)"
              @remove="removeModule(mi)"
              @add-lesson="addLesson(mi)"
              @remove-lesson="(li) => removeLesson(mi, li)"
            />

            <button class="btn btn-ghost" :style="{ alignSelf: 'flex-start' }" @click="addModule">
              + Agregar módulo
            </button>
          </div>

          <!-- Sidebar guide -->
          <div class="editor-guide card">
            <div :style="{ padding: 'calc(var(--unit) * 2.5)' }">
              <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
                Guía de estructura
              </p>
              <ul class="editor-guide-list">
                <li>Cada módulo agrupa lecciones por tema.</li>
                <li>Ordena los módulos de lo general a lo específico.</li>
                <li>Incluye al menos una lección por módulo.</li>
                <li>Usa URLs de YouTube para contenido de video.</li>
                <li>La duración se ingresa en formato mm:ss.</li>
                <li>Marca "requiere previo" para secuenciar módulos.</li>
              </ul>
            </div>
          </div>
        </div>
      </template>

      <div class="editor-nav">
        <button class="btn btn-ghost btn-sm" @click="editorStep = 0">
          <IconSet name="arrowLeft" />
          Básico
        </button>
        <button class="btn btn-primary btn-sm" @click="goToStep(2)">
          Siguiente: Revisar
          <IconSet name="arrow" />
        </button>
      </div>
    </div>

    <!-- Step 3: Revisar -->
    <div v-else-if="editorStep === 2" class="editor-panel fade-in">
      <div class="editor-review-layout">
        <!-- Preview card -->
        <div>
          <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
            Vista previa de tarjeta
          </p>
          <div class="card" :style="{ maxWidth: '380px' }">
            <img
              v-if="isUrl(editingCurso.imagen)"
              :src="editingCurso.imagen"
              :alt="editingCurso.titulo || 'Portada del curso'"
              :style="{
                aspectRatio: '4/3',
                width: '100%',
                objectFit: 'cover',
                display: 'block',
              }"
            />
            <PlaceholderImage
              v-else
              :label="editingCurso.imagen || editingCurso.titulo || 'Sin imagen'"
              :style="{ aspectRatio: '4/3', width: '100%' }"
            />
            <div
              :style="{
                padding: 'calc(var(--unit) * 2.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'calc(var(--unit) * 1.5)',
              }"
            >
              <div
                :style="{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }"
              >
                <span class="mono" :style="{ color: 'var(--ink-4)' }">
                  {{ editingCurso.nivel }}
                </span>
                <span class="chip chip-accent">
                  <span class="chip-dot" />
                  Nuevo
                </span>
              </div>
              <h3
                class="display"
                :style="{ fontSize: '22px', lineHeight: '1.1', color: 'var(--ink)' }"
              >
                {{ editingCurso.titulo || 'Sin título' }}
              </h3>
              <p :style="{ fontSize: '13px', lineHeight: '1.5', color: 'var(--ink-3)' }">
                {{ editingCurso.descripcion || 'Sin descripción' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Summary + validation -->
        <div>
          <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">Resumen</p>
          <div class="card" :style="{ marginBottom: 'calc(var(--unit) * 3)' }">
            <table class="admin-table">
              <tbody>
                <tr v-for="row in editorSummary" :key="row.label">
                  <td class="mono" :style="{ color: 'var(--ink-3)', width: '120px' }">
                    {{ row.label }}
                  </td>
                  <td>{{ row.value }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">Validación</p>
          <div class="editor-validation">
            <div
              v-for="check in validationChecks"
              :key="check.label"
              class="editor-validation-item"
            >
              <span
                :style="{
                  color: check.pass ? 'var(--success)' : 'var(--danger)',
                  display: 'inline-flex',
                }"
              >
                <IconSet :name="check.pass ? 'check' : 'close'" />
              </span>
              <span
                :style="{
                  fontSize: '14px',
                  color: check.pass ? 'var(--ink-2)' : 'var(--danger)',
                }"
              >
                {{ check.label }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="publishStatus"
        class="publish-status"
        :class="`publish-status-${publishStatus.type}`"
      >
        {{ publishStatus.text }}
      </div>

      <div class="editor-nav">
        <button class="btn btn-ghost btn-sm" :disabled="publishing" @click="editorStep = 1">
          <IconSet name="arrowLeft" />
          Estructura
        </button>
        <button
          class="btn btn-primary btn-sm"
          :style="{ opacity: allValid && !publishing ? 1 : 0.6 }"
          :disabled="publishing"
          @click="publishCurso"
        >
          <template v-if="publishing"> Guardando&hellip; </template>
          <template v-else-if="isUuid(editingCurso?.id || '')"> Actualizar curso </template>
          <template v-else> Publicar curso </template>
          <IconSet v-if="!publishing" name="arrow" />
        </button>
      </div>
    </div>
  </div>
</template>
