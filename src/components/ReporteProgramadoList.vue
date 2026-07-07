<script setup>
import { computed } from 'vue'

const props = defineProps({
  reportes: {
    type: Array,
    default: () => [],
  },
})

const hasData = computed(() => Array.isArray(props.reportes) && props.reportes.length > 0)

const frecuenciaLabels = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  mensual: 'Mensual',
  trimestral: 'Trimestral',
}

const tipoLabels = {
  inscripciones: 'Inscripciones',
  avance: 'Avance de curso',
  constancias: 'Constancias',
  evaluaciones: 'Evaluaciones',
  financiero: 'Financiero',
}

function labelFrecuencia(key) {
  return frecuenciaLabels[key] || key
}

function labelTipo(key) {
  return tipoLabels[key] || key
}
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Reportes programados</p>
    </div>

    <div
      v-if="!hasData"
      :style="{
        padding: 'calc(var(--unit) * 4)',
        textAlign: 'center',
        color: 'var(--ink-3)',
      }"
    >
      No hay reportes programados.
    </div>

    <table v-else class="admin-table admin-table-full">
      <thead>
        <tr>
          <th class="mono">Nombre</th>
          <th class="mono">Tipo</th>
          <th class="mono">Frecuencia</th>
          <th class="mono">Activo</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in reportes" :key="i">
          <td>{{ r.nombre }}</td>
          <td>{{ labelTipo(r.tipo_reporte) }}</td>
          <td>{{ labelFrecuencia(r.frecuencia) }}</td>
          <td>
            <span
              :style="{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: r.activo !== false ? 'var(--success)' : 'var(--ink-4)',
              }"
            />
            <span class="caption" :style="{ marginLeft: '6px', color: 'var(--ink-3)' }">
              {{ r.activo !== false ? 'Sí' : 'No' }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
