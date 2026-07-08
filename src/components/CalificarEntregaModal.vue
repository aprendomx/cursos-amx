<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  entrega: { type: Object, required: true },
  rubrica: { type: Object, default: null },
})

const emit = defineEmits(['calificar', 'devolver', 'close'])

const versionSeleccionada = ref(null)
const comentario = ref('')
const puntajes = ref({})
const nivelIds = ref({})

watch(
  () => props.entrega,
  (nueva) => {
    if (nueva?.versiones?.length) {
      versionSeleccionada.value = [...nueva.versiones].sort(
        (a, b) => b.numero_version - a.numero_version
      )[0]
    }
    if (nueva?.calificaciones?.length) {
      nueva.calificaciones.forEach((c) => {
        puntajes.value[c.criterio_id] = c.puntaje
        nivelIds.value[c.criterio_id] = c.nivel_id
      })
    }
  },
  { immediate: true }
)

watch(
  () => props.rubrica,
  (r) => {
    if (r?.criterios) {
      r.criterios.forEach((c) => {
        if (!(c.id in puntajes.value)) {
          puntajes.value[c.id] = null
          nivelIds.value[c.id] = null
        }
      })
    }
  },
  { immediate: true }
)

const versionesOrdenadas = computed(() => {
  return [...(props.entrega?.versiones || [])].sort((a, b) => b.numero_version - a.numero_version)
})

const puntajeTotal = computed(() => {
  if (!props.rubrica?.criterios) {
    return puntajes.value.simple || 0
  }
  let total = 0
  for (const c of props.rubrica.criterios) {
    const p = puntajes.value[c.id]
    if (p != null) {
      total += p * (c.peso || 1)
    }
  }
  return Math.round(total)
})

function onNivelChange(criterioId, nivelId, puntaje) {
  puntajes.value[criterioId] = puntaje
  nivelIds.value[criterioId] = nivelId
}

function onPuntajeLibreChange(criterioId, puntaje) {
  puntajes.value[criterioId] = Number(puntaje)
  nivelIds.value[criterioId] = null
}

function buildPayload(publicar) {
  const calificaciones = Object.entries(puntajes.value)
    .filter(([_, p]) => p != null)
    .map(([criterio_id, puntaje]) => ({
      criterio_id,
      puntaje,
      nivel_id: nivelIds.value[criterio_id] || null,
    }))

  return {
    calificaciones,
    comentario: comentario.value,
    puntajeFinal: puntajeTotal.value,
    publicar,
  }
}

function guardarBorrador() {
  emit('calificar', buildPayload(false))
}

function publicarCalificacion() {
  emit('calificar', buildPayload(true))
}

function devolver() {
  emit('devolver', comentario.value)
}

function cerrar() {
  emit('close')
}
</script>

<template>
  <div class="modal-overlay" data-test="calificar-modal" @click.self="cerrar">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Calificar entrega</h3>
        <button class="btn-close" data-test="close-btn" @click="cerrar">×</button>
      </div>

      <div class="modal-body">
        <div class="field-row">
          <label class="field-label">Versión</label>
          <select v-model="versionSeleccionada" data-test="version-select">
            <option v-for="v in versionesOrdenadas" :key="v.numero_version" :value="v">
              Versión {{ v.numero_version }}
            </option>
          </select>
        </div>

        <div v-if="versionSeleccionada" class="version-content">
          <p class="text-content" data-test="version-texto">
            {{ versionSeleccionada.texto }}
          </p>
          <ul v-if="versionSeleccionada.archivos?.length">
            <li v-for="(a, i) in versionSeleccionada.archivos" :key="i" data-test="version-archivo">
              {{ a }}
            </li>
          </ul>
        </div>

        <div v-if="rubrica" class="rubrica-section">
          <div
            v-for="(c, i) in rubrica.criterios"
            :key="c.id"
            class="criterio-item"
            data-test="criterio-item"
          >
            <div class="criterio-header">
              <h4 :data-test="`criterio-titulo-${i}`">
                {{ c.titulo }}
              </h4>
              <span v-if="c.peso !== 1" class="peso-badge">Peso {{ c.peso }}</span>
            </div>
            <p :data-test="`criterio-descripcion-${i}`" class="criterio-desc">
              {{ c.descripcion }}
            </p>

            <div v-if="rubrica.tipo === 'niveles'" class="niveles-group">
              <label v-for="n in rubrica.niveles" :key="n.id" class="nivel-option">
                <input
                  type="radio"
                  :name="`criterio-${c.id}`"
                  :value="n.puntaje"
                  :checked="puntajes[c.id] === n.puntaje"
                  :data-test="`nivel-radio-${c.id}`"
                  @change="onNivelChange(c.id, n.id, n.puntaje)"
                />
                <span>{{ n.etiqueta }} ({{ n.puntaje }})</span>
              </label>
            </div>

            <div v-else class="puntaje-libre">
              <input
                :value="puntajes[c.id] || 0"
                type="number"
                min="0"
                :max="c.puntaje_maximo"
                data-test="puntaje-libre-input"
                @input="onPuntajeLibreChange(c.id, $event.target.value)"
              />
              <span>/ {{ c.puntaje_maximo }}</span>
            </div>
          </div>

          <div class="puntaje-row">
            <span class="puntaje-label">Total:</span>
            <span class="puntaje-valor" data-test="puntaje-total">{{ puntajeTotal }}</span>
          </div>
        </div>

        <div v-else class="simple-score">
          <div class="field-row">
            <label class="field-label">Puntaje (0-100)</label>
            <input
              :value="puntajes.simple || 0"
              type="number"
              min="0"
              max="100"
              data-test="puntaje-simple"
              @input="onPuntajeLibreChange('simple', $event.target.value)"
            />
          </div>
        </div>

        <div class="field-row">
          <label class="field-label">Comentario del instructor</label>
          <textarea v-model="comentario" rows="4" data-test="comentario-textarea" />
        </div>

        <div class="puntaje-final-row">
          <span class="puntaje-final-label">Puntaje final:</span>
          <span class="puntaje-final-valor" data-test="puntaje-final">{{ puntajeTotal }}</span>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" data-test="guardar-borrador-btn" @click="guardarBorrador">
          Guardar borrador
        </button>
        <button class="btn-primary" data-test="publicar-btn" @click="publicarCalificacion">
          Publicar calificación
        </button>
        <button class="btn-danger" data-test="devolver-btn" @click="devolver">
          Devolver para corrección
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-content {
  background: var(--paper);
  border-radius: 8px;
  width: 90%;
  max-width: 700px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(var(--unit) * 2);
  border-bottom: 1px solid var(--line);
}
.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.btn-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--ink-2);
}
.modal-body {
  padding: calc(var(--unit) * 2);
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
.text-content {
  margin: 0;
  padding: calc(var(--unit));
  background: var(--paper-2);
  border-radius: 4px;
  font-size: 13px;
}
.rubrica-section {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: calc(var(--unit) * 2);
}
.criterio-item {
  margin-bottom: calc(var(--unit) * 2);
  padding-bottom: calc(var(--unit) * 2);
  border-bottom: 1px solid var(--line);
}
.criterio-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}
.criterio-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.criterio-header h4 {
  margin: 0;
  font-size: 14px;
}
.peso-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--paper-2);
  color: var(--ink-2);
}
.criterio-desc {
  margin: calc(var(--unit) * 0.5) 0;
  font-size: 13px;
  color: var(--ink-2);
}
.niveles-group {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit));
}
.nivel-option {
  display: flex;
  align-items: center;
  gap: calc(var(--unit));
  font-size: 13px;
  cursor: pointer;
}
.puntaje-libre {
  display: flex;
  align-items: center;
  gap: calc(var(--unit));
}
.puntaje-libre input {
  width: 80px;
}
.puntaje-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: calc(var(--unit) * 2);
  border-top: 1px solid var(--line);
  font-size: 16px;
  font-weight: 600;
}
.puntaje-final-row {
  display: flex;
  align-items: center;
  gap: calc(var(--unit));
  padding: calc(var(--unit) * 1.5);
  background: var(--paper-2);
  border-radius: 6px;
}
.puntaje-final-label {
  font-size: 14px;
  font-weight: 600;
}
.puntaje-final-valor {
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}
.modal-actions {
  display: flex;
  gap: calc(var(--unit));
  padding: calc(var(--unit) * 2);
  border-top: 1px solid var(--line);
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
.btn-danger {
  padding: calc(var(--unit)) calc(var(--unit) * 2);
  border-radius: 4px;
  border: none;
  background: #dc2626;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
</style>
