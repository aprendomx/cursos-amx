<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase.js'
import { costoTotalTranscripciones } from '@/services/transcripcion.js'

const grabaciones = ref([])
const transcripciones = ref([])
const loading = ref(false)
const costoTotal = ref(0)

async function cargar() {
  loading.value = true
  try {
    const { data: g } = await supabase
      .from('sesiones_grabaciones')
      .select('*, sesiones_virtuales(titulo, curso_id, cursos(titulo))')
      .order('creado_en', { ascending: false })
      .limit(100)
    grabaciones.value = g || []

    const { data: t } = await supabase
      .from('sesiones_transcripciones')
      .select('*, sesiones_virtuales(titulo)')
      .order('creado_en', { ascending: false })
      .limit(100)
    transcripciones.value = t || []

    costoTotal.value = await costoTotalTranscripciones()
  } finally {
    loading.value = false
  }
}

async function reintentarTranscripcion(tx) {
  try {
    const { error } = await supabase.functions.invoke('transcribir-sesion', {
      body: {
        sesion_id: tx.sesion_id,
        grabacion_id: tx.grabacion_id,
        audio_url: grabaciones.value.find((g) => g.id === tx.grabacion_id)?.url_grabacion,
      },
    })
    if (error) throw error
    await cargar()
  } catch (e) {
    alert(e?.message || 'Error al reintentar')
  }
}

const fmtFecha = (iso) =>
  new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

onMounted(cargar)
</script>

<template>
  <div class="admin-grabaciones">
    <h1>Grabaciones y Transcripciones</h1>

    <div class="stats">
      <div class="stat">
        <span class="stat-num">{{ grabaciones.length }}</span>
        <span class="stat-label">Grabaciones</span>
      </div>
      <div class="stat">
        <span class="stat-num">{{
          transcripciones.filter((t) => t.estado === 'completada').length
        }}</span>
        <span class="stat-label">Transcritas</span>
      </div>
      <div class="stat">
        <span class="stat-num">${{ costoTotal.toFixed(4) }}</span>
        <span class="stat-label">USD acumulado</span>
      </div>
    </div>

    <p v-if="loading">Cargando…</p>

    <table v-else class="tabla">
      <thead>
        <tr>
          <th>Sesión</th>
          <th>Curso</th>
          <th>Estado grabación</th>
          <th>Estado transcripción</th>
          <th>Costo</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="g in grabaciones" :key="g.id">
          <td>{{ g.sesiones_virtuales?.titulo || '—' }}</td>
          <td>{{ g.sesiones_virtuales?.cursos?.titulo || '—' }}</td>
          <td>
            <span class="badge" :class="`estado-${g.estado}`">{{ g.estado }}</span>
          </td>
          <td>
            <span
              v-if="transcripciones.find((t) => t.sesion_id === g.sesion_id)"
              class="badge"
              :class="`estado-${transcripciones.find((t) => t.sesion_id === g.sesion_id).estado}`"
            >
              {{ transcripciones.find((t) => t.sesion_id === g.sesion_id).estado }}
            </span>
            <span v-else class="badge estado-pendiente">pendiente</span>
          </td>
          <td>
            {{ transcripciones.find((t) => t.sesion_id === g.sesion_id)?.costo_usd || '—' }}
          </td>
          <td>
            <button
              v-if="transcripciones.find((t) => t.sesion_id === g.sesion_id)?.estado === 'error'"
              class="btn-sm"
              data-test="reintentar-btn"
              @click="
                reintentarTranscripcion(transcripciones.find((t) => t.sesion_id === g.sesion_id))
              "
            >
              Reintentar
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="!grabaciones.length && !loading" class="vacio">Sin grabaciones registradas.</p>
  </div>
</template>

<style scoped>
.admin-grabaciones {
  max-width: 1100px;
}
.admin-grabaciones h2 {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--ink);
  margin-bottom: calc(var(--unit) * 2);
}
.stats {
  display: flex;
  gap: calc(var(--unit) * 3);
  margin-bottom: calc(var(--unit) * 3);
}
.stat {
  display: flex;
  flex-direction: column;
}
.stat-num {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--ink);
}
.stat-label {
  font-size: var(--text-xs);
  color: var(--ink-4);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.tabla th,
.tabla td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--line);
}
.tabla th {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-3);
}
.badge {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}
.estado-lista {
  background: var(--success-soft);
  color: var(--success);
}
.estado-procesando,
.estado-pendiente {
  background: var(--warn-soft);
  color: var(--warn);
}
.estado-completada {
  background: var(--success-soft);
  color: var(--success);
}
.estado-error {
  background: var(--danger-soft);
  color: var(--danger);
}
.btn-sm {
  padding: 4px 10px;
  font-size: var(--text-xs);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--paper);
  cursor: pointer;
}
.vacio {
  color: var(--ink-4);
  font-size: var(--text-sm);
  margin-top: calc(var(--unit) * 2);
}
</style>
