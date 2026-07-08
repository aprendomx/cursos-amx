<script setup>
import { ref, computed } from 'vue'

/* ── state ── */
const periodo = ref('30d')
const loading = ref(false)

/* ── mock data ── */
const mockStats = {
  total_eventos_hoy: 1523,
  vistas_unicas: 892,
  tasa_completitud: 67,
  videos_activos: 45,
}

const mockTopCursos = [
  { titulo: 'Curso A', vistas: 234, completitud: 78, tiempo: 45000 },
  { titulo: 'Curso B', vistas: 189, completitud: 65, tiempo: 32000 },
]

const mockTopLecciones = [
  { titulo: 'Lección 1', curso: 'Curso A', vistas: 120, tiempo: 300, completitud: 80 },
]

/* ── computed ── */
const stats = computed(() => mockStats)
const topCursos = computed(() => mockTopCursos)
const topLecciones = computed(() => mockTopLecciones)

/* ── helpers ── */
function fmtMinutos(segundos) {
  const s = Math.max(0, Math.floor(segundos || 0))
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  if (m > 0) return `${m}:${String(s % 60).padStart(2, '0')}`
  return `${s}s`
}
</script>

<template>
  <div class="admin-content fade-in">
    <!-- Header -->
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Analytics</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
          Video analytics
        </h1>
      </div>

      <!-- Date filter -->
      <div
        class="segmented"
        :style="{
          display: 'flex',
          gap: '2px',
          background: 'var(--surface)',
          borderRadius: '8px',
          padding: '2px',
        }"
      >
        <button
          class="btn btn-sm"
          :class="{ 'btn-primary': periodo === '7d', 'btn-ghost': periodo !== '7d' }"
          :style="{ borderRadius: '6px' }"
          @click="periodo = '7d'"
        >
          7 días
        </button>
        <button
          class="btn btn-sm"
          :class="{ 'btn-primary': periodo === '30d', 'btn-ghost': periodo !== '30d' }"
          :style="{ borderRadius: '6px' }"
          @click="periodo = '30d'"
        >
          30 días
        </button>
        <button
          class="btn btn-sm"
          :class="{ 'btn-primary': periodo === 'all', 'btn-ghost': periodo !== 'all' }"
          :style="{ borderRadius: '6px' }"
          @click="periodo = 'all'"
        >
          Todo
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="card"
      :style="{
        padding: 'calc(var(--unit) * 4)',
        textAlign: 'center',
        color: 'var(--ink-3)',
      }"
    >
      Cargando datos…
    </div>

    <template v-else>
      <!-- System stats cards -->
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
            Eventos hoy
          </p>
          <p class="h4">
            {{ stats.total_eventos_hoy.toLocaleString() }}
          </p>
        </div>
        <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
          <p
            class="caption"
            :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
          >
            Vistas únicas
          </p>
          <p class="h4">
            {{ stats.vistas_unicas.toLocaleString() }}
          </p>
        </div>
        <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
          <p
            class="caption"
            :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
          >
            Completitud promedio
          </p>
          <p class="h4">{{ stats.tasa_completitud }}%</p>
        </div>
        <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
          <p
            class="caption"
            :style="{ color: 'var(--text-secondary)', marginBottom: 'calc(var(--unit) * 1)' }"
          >
            Videos activos
          </p>
          <p class="h4">
            {{ stats.videos_activos }}
          </p>
        </div>
      </div>

      <!-- Two-column: Top courses + Top lessons -->
      <div
        :style="{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'calc(var(--unit) * 3)',
        }"
      >
        <!-- Top courses -->
        <div class="card" :style="{ overflow: 'auto' }">
          <div
            :style="{
              padding: 'calc(var(--unit) * 2.5)',
              borderBottom: '1px solid var(--line)',
            }"
          >
            <p class="eyebrow">Top cursos por vistas</p>
          </div>
          <table v-if="topCursos.length" class="admin-table admin-table-full">
            <thead>
              <tr>
                <th class="mono">Curso</th>
                <th class="mono" :style="{ textAlign: 'right' }">Vistas</th>
                <th class="mono" :style="{ textAlign: 'right' }">Completitud</th>
                <th class="mono" :style="{ textAlign: 'right' }">Tiempo total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in topCursos" :key="c.titulo">
                <td>
                  <span :style="{ fontWeight: '500' }">{{ c.titulo }}</span>
                </td>
                <td :style="{ textAlign: 'right' }">
                  {{ c.vistas.toLocaleString() }}
                </td>
                <td :style="{ textAlign: 'right' }">
                  <span class="mono">{{ c.completitud }}%</span>
                </td>
                <td class="mono" :style="{ textAlign: 'right' }">
                  {{ fmtMinutos(c.tiempo) }}
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
            Sin datos de cursos.
          </p>
        </div>

        <!-- Top lessons -->
        <div class="card" :style="{ overflow: 'auto' }">
          <div
            :style="{
              padding: 'calc(var(--unit) * 2.5)',
              borderBottom: '1px solid var(--line)',
            }"
          >
            <p class="eyebrow">Top lecciones por vistas</p>
          </div>
          <table v-if="topLecciones.length" class="admin-table admin-table-full">
            <thead>
              <tr>
                <th class="mono">Lección</th>
                <th class="mono">Curso</th>
                <th class="mono" :style="{ textAlign: 'right' }">Vistas</th>
                <th class="mono" :style="{ textAlign: 'right' }">Tiempo promedio</th>
                <th class="mono" :style="{ textAlign: 'right' }">Completitud</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in topLecciones" :key="l.titulo">
                <td>
                  <span :style="{ fontWeight: '500' }">{{ l.titulo }}</span>
                </td>
                <td :style="{ color: 'var(--ink-3)' }">
                  {{ l.curso }}
                </td>
                <td :style="{ textAlign: 'right' }">
                  {{ l.vistas.toLocaleString() }}
                </td>
                <td class="mono" :style="{ textAlign: 'right' }">
                  {{ fmtMinutos(l.tiempo) }}
                </td>
                <td :style="{ textAlign: 'right' }">
                  <span class="mono">{{ l.completitud }}%</span>
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
            Sin datos de lecciones.
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.segmented .btn {
  font-size: 13px;
  padding: 4px 12px;
}
</style>
