<script setup>
import { ref, computed } from 'vue'

/* ── mock data ── */
const mockTareas = [
  {
    id: 't1',
    curso: 'Derecho Administrativo',
    titulo: 'Ensayo sobre principios de legalidad',
    fecha_limite: '2025-08-15',
    entregas: 34,
    calificadas: 12,
  },
  {
    id: 't2',
    curso: 'Ética Pública',
    titulo: 'Caso práctico: conflicto de intereses',
    fecha_limite: '2025-08-20',
    entregas: 28,
    calificadas: 28,
  },
  {
    id: 't3',
    curso: 'Gestión Documental',
    titulo: 'Análisis de flujo de tramites',
    fecha_limite: '2025-08-25',
    entregas: 15,
    calificadas: 0,
  },
  {
    id: 't4',
    curso: 'Transparencia y Acceso a la Información',
    titulo: 'Solicitud de información simulada',
    fecha_limite: '2025-09-01',
    entregas: 42,
    calificadas: 30,
  },
  {
    id: 't5',
    curso: 'Protección de Datos Personales',
    titulo: 'Checklist de cumplimiento LFPDPPP',
    fecha_limite: '2025-09-05',
    entregas: 19,
    calificadas: 5,
  },
]

/* ── computed stats ── */
const stats = computed(() => {
  const total = mockTareas.length
  const totalEntregas = mockTareas.reduce((s, t) => s + t.entregas, 0)
  const totalCalificadas = mockTareas.reduce((s, t) => s + t.calificadas, 0)
  const pendientes = totalEntregas - totalCalificadas
  const tasa = totalEntregas > 0 ? ((totalCalificadas / totalEntregas) * 100).toFixed(1) : '0.0'
  return { total, pendientes, tasa }
})

const tareas = computed(() => mockTareas)

function fmtFecha(fechaISO) {
  if (!fechaISO) return '—'
  const d = new Date(fechaISO)
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="admin-content fade-in">
    <!-- Header -->
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Gestión</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
          Entregas
        </h1>
      </div>
    </div>

    <!-- Stats cards -->
    <div
      :style="{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 'calc(var(--unit) * 3)',
        marginBottom: 'calc(var(--unit) * 3)',
      }"
    >
      <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
        <p
          class="caption"
          :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
        >
          Total tareas
        </p>
        <p class="h4">
          {{ stats.total }}
        </p>
      </div>
      <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
        <p
          class="caption"
          :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
        >
          Entregas pendientes de calificación
        </p>
        <p class="h4">
          {{ stats.pendientes }}
        </p>
      </div>
      <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
        <p
          class="caption"
          :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
        >
          Tasa de entrega promedio
        </p>
        <p class="h4">{{ stats.tasa }}%</p>
      </div>
    </div>

    <!-- Recent tareas table -->
    <div class="card" :style="{ overflow: 'auto' }">
      <div
        :style="{
          padding: 'calc(var(--unit) * 2.5)',
          borderBottom: '1px solid var(--line)',
        }"
      >
        <p class="eyebrow">Tareas recientes</p>
      </div>
      <table v-if="tareas.length" class="admin-table admin-table-full">
        <thead>
          <tr>
            <th class="mono">Curso</th>
            <th class="mono">Título</th>
            <th class="mono">Fecha límite</th>
            <th class="mono" :style="{ textAlign: 'right' }">Entregas</th>
            <th class="mono" :style="{ textAlign: 'right' }">Calificadas</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in tareas" :key="t.id">
            <td>
              <span :style="{ fontWeight: '500' }">{{ t.curso }}</span>
            </td>
            <td>{{ t.titulo }}</td>
            <td>{{ fmtFecha(t.fecha_limite) }}</td>
            <td :style="{ textAlign: 'right' }">
              {{ t.entregas }}
            </td>
            <td :style="{ textAlign: 'right' }">
              {{ t.calificadas }}
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-else
        :style="{
          padding: 'calc(var(--unit) * 2.5)',
          color: 'var(--ink-3)',
          fontSize: '13px',
        }"
      >
        Sin tareas registradas.
      </p>
    </div>
  </div>
</template>
