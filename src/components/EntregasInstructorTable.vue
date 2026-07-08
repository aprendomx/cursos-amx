<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  entregas: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['calificar', 'ver'])

const estadoFiltro = ref('')
const busqueda = ref('')

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  entregada: 'Entregada',
  calificada: 'Calificada',
  devuelta: 'Devuelta',
}

const entregasFiltradas = computed(() => {
  let list = props.entregas
  if (estadoFiltro.value) {
    list = list.filter((e) => e.estado === estadoFiltro.value)
  }
  if (busqueda.value.trim()) {
    const q = busqueda.value.trim().toLowerCase()
    list = list.filter((e) => {
      const nombre =
        `${e.perfiles?.nombres || ''} ${e.perfiles?.apellido_paterno || ''}`.toLowerCase()
      return nombre.includes(q)
    })
  }
  return list
})

function nombreAlumno(e) {
  const p = e.perfiles || {}
  return `${p.nombres || ''} ${p.apellido_paterno || ''}`.trim() || '—'
}

function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div
      :style="{
        padding: 'calc(var(--unit) * 2.5)',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
      }"
    >
      <p class="eyebrow">Entregas</p>
      <div :style="{ display: 'flex', gap: '8px', flexWrap: 'wrap' }">
        <input
          v-model="busqueda"
          type="text"
          placeholder="Buscar alumno…"
          :style="{
            padding: '6px 10px',
            border: '1px solid var(--line)',
            borderRadius: '4px',
            fontSize: '13px',
          }"
        />
        <select
          v-model="estadoFiltro"
          :style="{
            padding: '6px 10px',
            border: '1px solid var(--line)',
            borderRadius: '4px',
            fontSize: '13px',
            background: 'var(--paper)',
          }"
        >
          <option value="">Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="entregada">Entregada</option>
          <option value="calificada">Calificada</option>
          <option value="devuelta">Devuelta</option>
        </select>
      </div>
    </div>

    <table v-if="entregasFiltradas.length" class="admin-table admin-table-full">
      <thead>
        <tr>
          <th>Alumno</th>
          <th>Estado</th>
          <th>Versión</th>
          <th>Fecha</th>
          <th>Puntaje</th>
          <th>Días retraso</th>
          <th :style="{ textAlign: 'right' }">Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in entregasFiltradas" :key="e.id">
          <td>
            <span :style="{ fontWeight: '500' }">
              {{ nombreAlumno(e) }}
            </span>
          </td>
          <td>
            <span
              class="chip"
              :class="{
                'chip-primary': e.estado === 'entregada',
                'chip-verde': e.estado === 'calificada',
                'chip-accent': e.estado === 'devuelta',
              }"
              :style="{ fontSize: '10px' }"
            >
              {{ ESTADO_LABEL[e.estado] || e.estado }}
            </span>
          </td>
          <td class="mono">
            {{ e.version != null ? e.version : '—' }}
          </td>
          <td class="mono">
            {{ fmtFecha(e.creado_en || e.fecha_entrega) }}
          </td>
          <td class="mono">
            {{ e.puntaje != null ? e.puntaje : '—' }}
          </td>
          <td class="mono">
            {{ e.dias_retraso != null ? e.dias_retraso : '—' }}
          </td>
          <td :style="{ textAlign: 'right' }">
            <div :style="{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }">
              <button class="btn btn-sm btn-primary" @click="emit('calificar', e)">
                Calificar
              </button>
              <button class="btn btn-sm btn-ghost" @click="emit('ver', e)">Ver</button>
            </div>
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
      Sin entregas registradas.
    </p>
  </div>
</template>
