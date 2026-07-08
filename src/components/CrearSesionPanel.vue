<script setup>
import { ref } from 'vue'
import { crearSesion, crearSesionZoom } from '@/services/sesionesVirtuales.js'
import { crearReunionZoom } from '@/services/zoom.js'

const props = defineProps({
  cursoId: { type: String, required: true },
  moduloId: { type: String, default: null },
})

const emit = defineEmits(['saved', 'cancel'])

const titulo = ref('')
const descripcion = ref('')
const inicio = ref('')
const fin = ref('')
const plataforma = ref('jitsi')
const guardando = ref(false)

async function guardar() {
  if (!titulo.value.trim() || !inicio.value) return
  guardando.value = true
  try {
    let data
    if (plataforma.value === 'zoom') {
      const zoomData = await crearReunionZoom(
        titulo.value,
        new Date(inicio.value).toISOString(),
        fin.value ? new Date(fin.value).toISOString() : null,
        descripcion.value
      )
      data = await crearSesionZoom({
        cursoId: props.cursoId,
        titulo: titulo.value,
        programadaEn: new Date(inicio.value).toISOString(),
        fin: fin.value ? new Date(fin.value).toISOString() : null,
        descripcion: descripcion.value,
        moduloId: props.moduloId,
        zoomMeetingId: zoomData.meeting_id,
        zoomJoinUrl: zoomData.join_url,
      })
    } else {
      data = await crearSesion({
        cursoId: props.cursoId,
        titulo: titulo.value,
        programadaEn: new Date(inicio.value).toISOString(),
        fin: fin.value ? new Date(fin.value).toISOString() : null,
        descripcion: descripcion.value,
        plataforma: plataforma.value,
        moduloId: props.moduloId,
      })
    }
    emit('saved', data)
  } catch (e) {
    alert(e?.message || 'Error al crear sesión')
  } finally {
    guardando.value = false
  }
}

function cancelar() {
  emit('cancel')
}
</script>

<template>
  <div class="crear-sesion-panel">
    <div class="field-row">
      <label class="field-label">Título</label>
      <input v-model="titulo" type="text" data-test="titulo-input" />
    </div>

    <div class="field-row">
      <label class="field-label">Descripción</label>
      <textarea v-model="descripcion" rows="3" data-test="descripcion-textarea" />
    </div>

    <div class="field-row">
      <label class="field-label">Plataforma</label>
      <select v-model="plataforma" data-test="plataforma-select">
        <option value="jitsi">Jitsi (gratuito)</option>
        <option value="zoom">Zoom</option>
      </select>
    </div>

    <div class="field-row">
      <label class="field-label">Inicio</label>
      <input v-model="inicio" type="datetime-local" data-test="inicio-input" />
    </div>

    <div class="field-row">
      <label class="field-label">Fin (opcional)</label>
      <input v-model="fin" type="datetime-local" data-test="fin-input" />
    </div>

    <div class="actions">
      <button
        class="btn-primary"
        :disabled="guardando || !titulo.trim() || !inicio"
        data-test="guardar-btn"
        @click="guardar"
      >
        {{ guardando ? 'Guardando...' : 'Programar sesión' }}
      </button>
      <button class="btn-secondary" data-test="cancelar-btn" @click="cancelar">Cancelar</button>
    </div>
  </div>
</template>

<style scoped>
.crear-sesion-panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.field-row {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 0.5);
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
input,
textarea,
select {
  padding: calc(var(--unit)) calc(var(--unit) * 1.5);
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper);
  color: var(--ink);
  font-size: 13px;
  line-height: 1.4;
}
input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--primary);
}
.actions {
  display: flex;
  gap: calc(var(--unit) * 2);
  margin-top: calc(var(--unit) * 2);
}
.btn-primary {
  padding: calc(var(--unit)) calc(var(--unit) * 2);
  border-radius: 4px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-secondary {
  padding: calc(var(--unit)) calc(var(--unit) * 2);
  border-radius: 4px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
</style>
