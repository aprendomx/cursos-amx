<script setup>
import { ref } from 'vue'

const emit = defineEmits(['guardado'])

const nombre = ref('')
const tipoReporte = ref('')
const frecuencia = ref('')

const tipos = [
  { key: 'inscripciones', label: 'Inscripciones' },
  { key: 'avance', label: 'Avance de curso' },
  { key: 'constancias', label: 'Constancias' },
  { key: 'evaluaciones', label: 'Evaluaciones' },
  { key: 'financiero', label: 'Financiero' },
]

const frecuencias = [
  { key: 'diaria', label: 'Diaria' },
  { key: 'semanal', label: 'Semanal' },
  { key: 'mensual', label: 'Mensual' },
  { key: 'trimestral', label: 'Trimestral' },
]

function guardar() {
  if (!nombre.value.trim() || !tipoReporte.value || !frecuencia.value) return
  emit('guardado', {
    nombre: nombre.value.trim(),
    tipo_reporte: tipoReporte.value,
    frecuencia: frecuencia.value,
  })
  nombre.value = ''
  tipoReporte.value = ''
  frecuencia.value = ''
}
</script>

<template>
  <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
    <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">Programar reporte</p>

    <div :style="{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--unit) * 2)' }">
      <div class="field">
        <label for="rp-nombre">Nombre</label>
        <input id="rp-nombre" v-model="nombre" type="text" placeholder="Ej. Reporte mensual" />
      </div>

      <div class="field">
        <label for="rp-tipo">Tipo de reporte</label>
        <select id="rp-tipo" v-model="tipoReporte">
          <option value="">— Seleccionar —</option>
          <option v-for="t in tipos" :key="t.key" :value="t.key">
            {{ t.label }}
          </option>
        </select>
      </div>

      <div class="field">
        <label for="rp-frecuencia">Frecuencia</label>
        <select id="rp-frecuencia" v-model="frecuencia">
          <option value="">— Seleccionar —</option>
          <option v-for="f in frecuencias" :key="f.key" :value="f.key">
            {{ f.label }}
          </option>
        </select>
      </div>

      <button class="btn btn-primary btn-sm" @click="guardar">Guardar</button>
    </div>
  </div>
</template>
