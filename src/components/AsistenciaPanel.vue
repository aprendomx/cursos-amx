<script setup>
import { ref, onMounted } from 'vue'
import { listarRSVP, marcarAsistencia } from '@/services/sesionesVirtuales.js'

const props = defineProps({
  sesionId: { type: String, required: true },
})

const rsvps = ref([])
const loading = ref(false)

async function cargar() {
  loading.value = true
  try {
    rsvps.value = await listarRSVP(props.sesionId)
  } finally {
    loading.value = false
  }
}

async function toggleAsistencia(userId, asistio) {
  await marcarAsistencia(props.sesionId, userId, asistio)
  await cargar()
}

onMounted(cargar)
</script>

<template>
  <div class="asistencia-panel">
    <h4>Asistencia</h4>
    <p v-if="loading">Cargando…</p>
    <table v-else class="asistencia-tabla">
      <thead>
        <tr>
          <th>Alumno</th>
          <th>Estado RSVP</th>
          <th>Asistió</th>
          <th>No asistió</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rsvps" :key="r.id">
          <td>{{ r.perfiles?.nombres || '' }} {{ r.perfiles?.apellido_paterno || '' }}</td>
          <td>
            <span class="badge" :class="`estado-${r.estado}`">{{ r.estado }}</span>
          </td>
          <td>
            <input
              type="checkbox"
              :checked="r.estado === 'asistio'"
              data-test="asistio-check"
              @change="toggleAsistencia(r.user_id, true)"
            />
          </td>
          <td>
            <input
              type="checkbox"
              :checked="r.estado === 'no_asistio'"
              data-test="no-asistio-check"
              @change="toggleAsistencia(r.user_id, false)"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rsvps.length && !loading">Sin confirmaciones aún.</p>
  </div>
</template>

<style scoped>
.asistencia-panel {
  margin-top: calc(var(--unit) * 2);
}
.asistencia-tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.asistencia-tabla th,
.asistencia-tabla td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--line);
}
.asistencia-tabla th {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-3);
}
.badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 3px;
}
.estado-confirmado {
  background: #e8f5e9;
  color: #2e7d32;
}
.estado-cancelado {
  background: #fce8e6;
  color: #c5221f;
}
.estado-asistio {
  background: #e8f5e9;
  color: #2e7d32;
}
.estado-no_asistio {
  background: #fce8e6;
  color: #c5221f;
}
</style>
