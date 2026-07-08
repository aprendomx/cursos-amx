<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  entregas: { type: Array, default: () => [] },
})

const emit = defineEmits(['calificar', 'ver'])

const filtroEstado = ref('')
const busqueda = ref('')

const entregasFiltradas = computed(() => {
  let list = props.entregas
  if (filtroEstado.value) {
    list = list.filter((e) => e.estado === filtroEstado.value)
  }
  if (busqueda.value.trim()) {
    const q = busqueda.value.toLowerCase()
    list = list.filter(
      (e) =>
        (e.perfiles?.nombres?.toLowerCase() || '').includes(q) ||
        (e.perfiles?.apellido_paterno?.toLowerCase() || '').includes(q)
    )
  }
  return list
})

const estadoClass = (estado) =>
  ({
    pendiente: 'badge',
    entregada: 'badge badge-info',
    calificada: 'badge badge-success',
    devuelta: 'badge badge-warning',
  })[estado] || 'badge'

function fmtFecha(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('es-MX')
}
</script>

<template>
  <div class="entregas-table">
    <div class="filters">
      <input v-model="busqueda" type="text" placeholder="Buscar alumno..." class="input" />
      <select v-model="filtroEstado" class="select">
        <option value="">Todos los estados</option>
        <option value="pendiente">Pendiente</option>
        <option value="entregada">Entregada</option>
        <option value="calificada">Calificada</option>
        <option value="devuelta">Devuelta</option>
      </select>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>Alumno</th>
          <th>Estado</th>
          <th>Versión</th>
          <th>Fecha</th>
          <th>Puntaje</th>
          <th>Retraso</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in entregasFiltradas" :key="e.id">
          <td>{{ e.perfiles?.nombres }} {{ e.perfiles?.apellido_paterno }}</td>
          <td>
            <span :class="estadoClass(e.estado)">{{ e.estado }}</span>
          </td>
          <td>{{ e.version_actual }}</td>
          <td>{{ fmtFecha(e.entregado_en) }}</td>
          <td>{{ e.puntaje_final ?? '-' }}</td>
          <td>{{ e.dias_retraso ?? 0 }} días</td>
          <td>
            <button
              v-if="e.estado === 'entregada'"
              class="btn btn-primary btn-sm"
              @click="emit('calificar', e)"
            >
              Calificar
            </button>
            <button class="btn btn-ghost btn-sm" @click="emit('ver', e)">Ver</button>
          </td>
        </tr>
        <tr v-if="!entregasFiltradas.length">
          <td colspan="7" class="text-center text-muted">No hay entregas</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}
.filters input,
.filters select {
  padding: 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid var(--paper-3);
  background: var(--paper-1);
  color: var(--ink-1);
}
</style>
