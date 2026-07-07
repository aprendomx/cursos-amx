<script setup>
import { onMounted } from 'vue'
import RiskStudentTable from '@/components/RiskStudentTable.vue'
import ActivityHeatmap from '@/components/ActivityHeatmap.vue'
import ReportDownloader from '@/components/ReportDownloader.vue'
import { useAnalytics } from '@/composables/useAnalytics.js'

const props = defineProps({
  session: { type: Object, default: null },
})

const emit = defineEmits(['navigate'])

const {
  cursos,
  selectedCursoId,
  minRisk,
  filteredAlumnos,
  engagement,
  loading,
  error,
  loadCursos,
} = useAnalytics(() => props.session)

function handleDownload(tipo, cursoId) {
  console.log('Download requested:', tipo, cursoId)
  // TODO: wire to actual download logic
}

onMounted(loadCursos)
</script>

<template>
  <div class="admin-content fade-in">
    <!-- Header -->
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Análisis</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
          Analytics
        </h1>
      </div>
    </div>

    <!-- Controls -->
    <div
      :style="{
        display: 'flex',
        gap: 'calc(var(--unit) * 3)',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }"
    >
      <div class="field" :style="{ minWidth: '240px' }">
        <label for="curso-select">Curso</label>
        <select id="curso-select" v-model="selectedCursoId">
          <option value="">— Seleccionar curso —</option>
          <option v-for="c in cursos" :key="c.id" :value="c.id">
            {{ c.titulo }}
          </option>
        </select>
      </div>

      <div class="field" :style="{ minWidth: '140px' }">
        <label for="min-risk">Riesgo mínimo (0–100)</label>
        <input
          id="min-risk"
          v-model.number="minRisk"
          type="number"
          min="0"
          max="100"
          placeholder="50"
        />
      </div>
    </div>

    <!-- Status -->
    <div v-if="error" class="publish-status publish-status-error">
      {{ error }}
    </div>
    <div
      v-else-if="loading"
      class="card"
      :style="{
        padding: 'calc(var(--unit) * 4)',
        textAlign: 'center',
        color: 'var(--ink-3)',
      }"
    >
      Cargando datos…
    </div>

    <!-- Tables side by side -->
    <div
      v-else
      :style="{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'calc(var(--unit) * 3)',
      }"
    >
      <RiskStudentTable :alumnos="filteredAlumnos" />
      <ActivityHeatmap :engagement="engagement" />
    </div>

    <!-- Report downloader -->
    <ReportDownloader :curso-id="selectedCursoId" @download="handleDownload" />

    <!-- Summary cards linking to reportes -->
    <div
      :style="{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'calc(var(--unit) * 3)',
        marginTop: 'calc(var(--unit) * 4)',
      }"
    >
      <div
        class="card"
        :style="{ cursor: 'pointer', padding: 'calc(var(--unit) * 3)' }"
        @click="emit('navigate', 'reportes')"
      >
        <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 1)' }">Reportes</p>
        <p class="h4" :style="{ marginBottom: 'calc(var(--unit) * 1)' }">Funnel de conversión</p>
        <p class="caption" :style="{ color: 'var(--text-secondary)' }">
          Visualiza el embudo de inscripción y finalización de cursos.
        </p>
      </div>

      <div
        class="card"
        :style="{ cursor: 'pointer', padding: 'calc(var(--unit) * 3)' }"
        @click="emit('navigate', 'reportes')"
      >
        <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 1)' }">Reportes</p>
        <p class="h4" :style="{ marginBottom: 'calc(var(--unit) * 1)' }">Retención de cohortes</p>
        <p class="caption" :style="{ color: 'var(--text-secondary)' }">
          Analiza la retención de usuarios por cohorte a lo largo del tiempo.
        </p>
      </div>

      <div
        class="card"
        :style="{ cursor: 'pointer', padding: 'calc(var(--unit) * 3)' }"
        @click="emit('navigate', 'reportes')"
      >
        <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 1)' }">Reportes</p>
        <p class="h4" :style="{ marginBottom: 'calc(var(--unit) * 1)' }">
          Comparativa entre cursos
        </p>
        <p class="caption" :style="{ color: 'var(--text-secondary)' }">
          Compara métricas clave entre diferentes cursos.
        </p>
      </div>
    </div>
  </div>
</template>
