<script setup>
import { ref } from 'vue'
import RubricaEditor from './RubricaEditor.vue'
import { crearTarea } from '@/services/entregas'
import { crearRubrica } from '@/services/rubricas'

const props = defineProps({
  cursoId: { type: String, required: true },
  moduloId: { type: String, default: null },
})

const emit = defineEmits(['saved', 'cancel'])

const titulo = ref('')
const instrucciones = ref('')
const fecha_apertura = ref('')
const fecha_limite = ref('')
const maximo_archivos = ref(5)
const peso_maximo_mb = ref(10)
const permitir_retraso = ref(false)
const penalizacion_retraso_pct = ref(0)
const usar_rubrica = ref(false)
const rubrica = ref({
  tipo: 'niveles',
  titulo: '',
  puntaje_maximo: 100,
  criterios: [],
  niveles: [],
})

const guardando = ref(false)

async function guardar() {
  guardando.value = true
  try {
    const tarea = {
      curso_id: props.cursoId,
      modulo_id: props.moduloId,
      titulo: titulo.value,
      instrucciones: instrucciones.value,
      fecha_apertura: fecha_apertura.value,
      fecha_limite: fecha_limite.value,
      maximo_archivos: Number(maximo_archivos.value),
      peso_maximo_mb: Number(peso_maximo_mb.value),
      permitir_retraso: permitir_retraso.value,
      penalizacion_retraso_pct: permitir_retraso.value
        ? Number(penalizacion_retraso_pct.value)
        : null,
    }

    const creada = await crearTarea(tarea)

    if (usar_rubrica.value && rubrica.value.criterios.length > 0) {
      await crearRubrica(creada.id, rubrica.value)
    }

    emit('saved', creada)
  } finally {
    guardando.value = false
  }
}

function cancelar() {
  emit('cancel')
}
</script>

<template>
  <div class="crear-tarea-panel">
    <div class="field-row">
      <label class="field-label">Título</label>
      <input v-model="titulo" type="text" data-test="titulo-input" />
    </div>

    <div class="field-row">
      <label class="field-label">Instrucciones</label>
      <textarea v-model="instrucciones" rows="6" data-test="instrucciones-textarea" />
    </div>

    <div class="field-row">
      <label class="field-label">Fecha de apertura</label>
      <input v-model="fecha_apertura" type="datetime-local" data-test="fecha-apertura" />
    </div>

    <div class="field-row">
      <label class="field-label">Fecha límite</label>
      <input v-model="fecha_limite" type="datetime-local" data-test="fecha-limite" />
    </div>

    <div class="field-row">
      <label class="field-label">Máximo de archivos</label>
      <input v-model="maximo_archivos" type="number" min="1" data-test="maximo-archivos" />
    </div>

    <div class="field-row">
      <label class="field-label">Peso máximo por archivo (MB)</label>
      <input v-model="peso_maximo_mb" type="number" min="1" data-test="peso-maximo-mb" />
    </div>

    <div class="field-row inline">
      <label class="field-label">Permitir retraso</label>
      <input v-model="permitir_retraso" type="checkbox" data-test="permitir-retraso" />
    </div>

    <div v-if="permitir_retraso" class="field-row">
      <label class="field-label">Penalización por retraso (%)</label>
      <input
        v-model="penalizacion_retraso_pct"
        type="number"
        min="0"
        max="100"
        data-test="penalizacion-retraso-pct"
      />
    </div>

    <div class="field-row inline">
      <label class="field-label">Usar rúbrica</label>
      <input v-model="usar_rubrica" type="checkbox" data-test="usar-rubrica" />
    </div>

    <RubricaEditor v-if="usar_rubrica" v-model="rubrica" />

    <div class="actions">
      <button class="btn-primary" :disabled="guardando" data-test="guardar-btn" @click="guardar">
        Guardar
      </button>
      <button class="btn-secondary" data-test="cancelar-btn" @click="cancelar">Cancelar</button>
    </div>
  </div>
</template>

<style scoped>
.crear-tarea-panel {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.field-row {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 0.5);
}
.field-row.inline {
  flex-direction: row;
  align-items: center;
  gap: calc(var(--unit));
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
