<script setup>
import IconSet from '@/components/IconSet.vue'

const props = defineProps({
  metrics: { type: Array, required: true },
  barData: { type: Array, required: true },
  topCourses: { type: Array, required: true },
  recentActivity: { type: Array, required: true },
})

const emit = defineEmits(['createCourse'])

function relativeTime(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Hace unos segundos'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  if (diff < 86400 * 30) return `Hace ${Math.floor(diff / 86400)} d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div class="admin-content fade-in">
    <!-- Header -->
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">
          Dashboard
        </p>
        <h1
          class="display"
          :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
        >
          Resumen de operaci&oacute;n
        </h1>
      </div>
      <div :style="{ display: 'flex', gap: 'calc(var(--unit) * 1.5)' }">
        <button class="btn btn-ghost btn-sm">
          Exportar
        </button>
        <button
          class="btn btn-primary btn-sm"
          @click="$emit('createCourse')"
        >
          Crear curso
          <IconSet name="arrow" />
        </button>
      </div>
    </div>

    <!-- Metric cards -->
    <div class="admin-metrics">
      <div
        v-for="m in metrics"
        :key="m.label"
        class="admin-metric-card card"
      >
        <p class="eyebrow">
          {{ m.label }}
        </p>
        <div
          class="display"
          :style="{ fontSize: '36px', color: 'var(--ink)', marginTop: '8px' }"
        >
          {{ m.value }}
        </div>
        <p
          class="mono"
          :style="{ color: m.up ? 'var(--success)' : 'var(--danger)', marginTop: '8px' }"
        >
          {{ m.delta }}
        </p>
      </div>
    </div>

    <!-- Bar chart -->
    <div class="admin-chart card">
      <div class="admin-chart-header">
        <p class="eyebrow">
          Inscripciones &middot; &Uacute;ltimos 30 d&iacute;as
        </p>
      </div>
      <div class="admin-chart-bars">
        <div
          v-for="(h, i) in barData"
          :key="i"
          class="admin-bar"
          :class="{ highlighted: i >= barData.length - 3 }"
          :style="{ height: h + '%' }"
        />
      </div>
    </div>

    <!-- Two-column: Top courses + Recent activity -->
    <div class="admin-two-col">
      <!-- Top courses -->
      <div
        class="card"
        :style="{ overflow: 'auto' }"
      >
        <div
          :style="{
            padding: 'calc(var(--unit) * 2.5)',
            borderBottom: '1px solid var(--line)',
          }"
        >
          <p class="eyebrow">
            Top cursos por inscripciones
          </p>
        </div>
        <table
          v-if="topCourses.length"
          class="admin-table"
        >
          <thead>
            <tr>
              <th class="mono">
                Curso
              </th>
              <th class="mono">
                Inscritos
              </th>
              <th class="mono">
                Nivel
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in topCourses"
              :key="c.id"
            >
              <td>{{ c.titulo }}</td>
              <td>{{ c.inscritos.toLocaleString() }}</td>
              <td>
                <span class="chip">{{ c.nivel }}</span>
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
          A&uacute;n no hay inscripciones registradas.
        </p>
      </div>

      <!-- Recent activity -->
      <div class="card">
        <div
          :style="{
            padding: 'calc(var(--unit) * 2.5)',
            borderBottom: '1px solid var(--line)',
          }"
        >
          <p class="eyebrow">
            Actividad reciente
          </p>
        </div>
        <div
          v-if="recentActivity.length"
          class="admin-activity-list"
        >
          <div
            v-for="(act, i) in recentActivity"
            :key="i"
            class="admin-activity-item"
          >
            <span class="admin-activity-dot" />
            <div>
              <p :style="{ fontSize: '14px', color: 'var(--ink-2)', lineHeight: '1.4' }">
                {{ act.text }}
              </p>
              <p
                class="mono"
                :style="{ color: 'var(--ink-4)', marginTop: '2px' }"
              >
                {{ act.time }}
              </p>
            </div>
          </div>
        </div>
        <p
          v-else
          :style="{
            padding: 'calc(var(--unit) * 2.5)',
            color: 'var(--ink-3)',
            fontSize: '13px',
          }"
        >
          Sin actividad reciente.
        </p>
      </div>
    </div>
  </div>
</template>
