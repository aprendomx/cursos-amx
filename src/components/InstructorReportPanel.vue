<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useReportes } from '@/composables/useReportes.js'
import InstructorAlumnosTable from '@/components/InstructorAlumnosTable.vue'
import LessonAnalyticsTable from '@/components/LessonAnalyticsTable.vue'
import IconSet from '@/components/IconSet.vue'

const props = defineProps({
  instructorId: { type: String, required: true },
})

const {
  instructorDashboard,
  instructorAlumnos,
  leccionAnalytics,
  loading,
  error,
  cargarInstructorDashboard,
  cargarInstructorAlumnos,
  cargarLeccionAnalytics,
} = useReportes()

const tabs = [
  { key: 'cursos', label: 'Mis cursos' },
  { key: 'alumnos', label: 'Alumnos' },
  { key: 'analisis', label: 'Análisis por lección' },
]
const activeTab = ref('cursos')

const selectedCursoId = ref('')

const cursos = computed(() => instructorDashboard.value || [])

const cursoSeleccionado = computed(() =>
  cursos.value.find((c) => c.curso_id === selectedCursoId.value)
)

watch(activeTab, (tab) => {
  if (tab === 'alumnos' && selectedCursoId.value) {
    cargarInstructorAlumnos(selectedCursoId.value)
  }
  if (tab === 'analisis' && selectedCursoId.value) {
    cargarLeccionAnalytics(selectedCursoId.value)
  }
})

watch(selectedCursoId, (id) => {
  if (!id) return
  if (activeTab.value === 'alumnos') {
    cargarInstructorAlumnos(id)
  }
  if (activeTab.value === 'analisis') {
    cargarLeccionAnalytics(id)
  }
})

onMounted(() => {
  cargarInstructorDashboard(props.instructorId)
})

function onSeleccionarCurso(id) {
  selectedCursoId.value = id
}
</script>

<template>
  <div class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Reportes</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
          Panel del instructor
        </h1>
      </div>
    </div>

    <!-- Tabs -->
    <div
      :style="{
        display: 'flex',
        gap: 'calc(var(--unit) * 1)',
        borderBottom: '1px solid var(--line)',
        marginBottom: 'calc(var(--unit) * 3)',
      }"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="btn btn-sm"
        :class="{ 'btn-primary': activeTab === tab.key, 'btn-ghost': activeTab !== tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Mis cursos -->
    <div v-if="activeTab === 'cursos'">
      <div
        v-if="error.instructorDashboard"
        class="publish-status publish-status-error"
        :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
      >
        {{ error.instructorDashboard }}
      </div>
      <div
        v-else-if="loading.instructorDashboard"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        Cargando cursos&hellip;
      </div>
      <div
        v-else-if="!cursos.length"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        No tienes cursos asignados.
      </div>
      <div
        v-else
        :style="{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 'calc(var(--unit) * 3)',
        }"
      >
        <div
          v-for="c in cursos"
          :key="c.curso_id"
          class="card"
          :style="{ padding: 'calc(var(--unit) * 3)', cursor: 'pointer' }"
          @click="
            onSeleccionarCurso(c.curso_id)
            activeTab = 'alumnos'
          "
        >
          <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 1.5)' }">
            {{ c.curso_titulo || 'Curso' }}
          </p>
          <div
            :style="{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'calc(var(--unit) * 2)',
            }"
          >
            <div>
              <p class="caption" :style="{ color: 'var(--ink-3)' }">Alumnos</p>
              <p class="h4" :style="{ marginTop: '4px' }">
                {{ c.total_alumnos ?? 0 }}
              </p>
            </div>
            <div>
              <p class="caption" :style="{ color: 'var(--ink-3)' }">Aprobación</p>
              <p
                class="h4"
                :style="{
                  marginTop: '4px',
                  color: (c.tasa_aprobacion ?? 0) < 50 ? 'var(--danger)' : 'var(--ink)',
                }"
              >
                {{ c.tasa_aprobacion != null ? c.tasa_aprobacion.toFixed(1) + '%' : '—' }}
              </p>
            </div>
            <div>
              <p class="caption" :style="{ color: 'var(--ink-3)' }">Calificación</p>
              <p class="h4" :style="{ marginTop: '4px' }">
                {{ c.calificacion_promedio != null ? c.calificacion_promedio.toFixed(1) : '—' }}
              </p>
            </div>
            <div>
              <p class="caption" :style="{ color: 'var(--ink-3)' }">Lecciones</p>
              <p class="h4" :style="{ marginTop: '4px' }">
                {{ c.total_lecciones ?? 0 }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Alumnos -->
    <div v-else-if="activeTab === 'alumnos'">
      <div
        v-if="!cursos.length && !loading.instructorDashboard"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        No hay cursos disponibles.
      </div>
      <div v-else>
        <div class="field" :style="{ maxWidth: '320px', marginBottom: 'calc(var(--unit) * 3)' }">
          <label for="curso-select">Curso</label>
          <select id="curso-select" v-model="selectedCursoId">
            <option value="" disabled>Selecciona un curso</option>
            <option v-for="c in cursos" :key="c.curso_id" :value="c.curso_id">
              {{ c.curso_titulo || c.curso_id }}
            </option>
          </select>
        </div>

        <div
          v-if="error.instructorAlumnos"
          class="publish-status publish-status-error"
          :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
        >
          {{ error.instructorAlumnos }}
        </div>
        <div
          v-else-if="loading.instructorAlumnos"
          class="card"
          :style="{
            padding: 'calc(var(--unit) * 4)',
            textAlign: 'center',
            color: 'var(--ink-3)',
          }"
        >
          Cargando alumnos&hellip;
        </div>
        <InstructorAlumnosTable v-else :data="instructorAlumnos" />
      </div>
    </div>

    <!-- Análisis por lección -->
    <div v-else-if="activeTab === 'analisis'">
      <div
        v-if="!cursos.length && !loading.instructorDashboard"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        No hay cursos disponibles.
      </div>
      <div v-else>
        <div class="field" :style="{ maxWidth: '320px', marginBottom: 'calc(var(--unit) * 3)' }">
          <label for="curso-select-analisis">Curso</label>
          <select id="curso-select-analisis" v-model="selectedCursoId">
            <option value="" disabled>Selecciona un curso</option>
            <option v-for="c in cursos" :key="c.curso_id" :value="c.curso_id">
              {{ c.curso_titulo || c.curso_id }}
            </option>
          </select>
        </div>

        <div
          v-if="error.leccionAnalytics"
          class="publish-status publish-status-error"
          :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
        >
          {{ error.leccionAnalytics }}
        </div>
        <div
          v-else-if="loading.leccionAnalytics"
          class="card"
          :style="{
            padding: 'calc(var(--unit) * 4)',
            textAlign: 'center',
            color: 'var(--ink-3)',
          }"
        >
          Cargando análisis&hellip;
        </div>
        <LessonAnalyticsTable v-else :data="leccionAnalytics" />
      </div>
    </div>
  </div>
</template>
