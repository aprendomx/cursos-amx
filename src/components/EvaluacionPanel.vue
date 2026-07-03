<!-- src/components/EvaluacionPanel.vue -->
<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { obtenerEvaluacion, calificarEvaluacion } from '@/services/evaluaciones.js'

const props = defineProps({
  leccionId: { type: String, required: true },
})
const emit = defineEmits(['aprobada'])

const cargando = ref(true)
const error = ref('')
const examen = ref(null) // { puntaje_minimo, max_intentos, intentos_restantes, preguntas }
const seleccion = reactive({}) // preguntaId -> Set-like array de opcionId
const enviando = ref(false)
const resultado = ref(null) // { puntaje, aprobado, numero, intentos_restantes, detalle }

async function cargar() {
  cargando.value = true
  error.value = ''
  resultado.value = null
  for (const k of Object.keys(seleccion)) delete seleccion[k]
  try {
    examen.value = await obtenerEvaluacion(props.leccionId)
    for (const p of examen.value.preguntas) seleccion[p.id] = []
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)
watch(() => props.leccionId, cargar)

function toggleUnica(preguntaId, opcionId) {
  seleccion[preguntaId] = [opcionId]
}
function toggleMultiple(preguntaId, opcionId) {
  const arr = seleccion[preguntaId]
  const i = arr.indexOf(opcionId)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(opcionId)
}
function estaSeleccionada(preguntaId, opcionId) {
  return (seleccion[preguntaId] || []).includes(opcionId)
}

const todasRespondidas = () =>
  !!examen.value && examen.value.preguntas.every((p) => (seleccion[p.id] || []).length > 0)

function detalleDe(preguntaId) {
  return resultado.value?.detalle?.find((d) => d.pregunta_id === preguntaId) || null
}

async function enviar() {
  if (!todasRespondidas() || enviando.value) return
  enviando.value = true
  error.value = ''
  try {
    const payload = {}
    for (const p of examen.value.preguntas) payload[p.id] = seleccion[p.id]
    resultado.value = await calificarEvaluacion(props.leccionId, payload)
    if (resultado.value.aprobado) emit('aprobada')
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    enviando.value = false
  }
}

function reintentar() {
  cargar()
}
</script>

<template>
  <div class="eval-panel">
    <div v-if="cargando" class="eval-state">Cargando evaluación…</div>
    <div v-else-if="error" class="eval-state eval-error">
      {{ error }}
    </div>

    <template v-else-if="examen">
      <!-- Resultado -->
      <div v-if="resultado" class="eval-result">
        <div class="eval-result-head" :class="resultado.aprobado ? 'is-ok' : 'is-fail'">
          <span class="eval-score">{{ resultado.puntaje }}%</span>
          <span class="eval-verdict">{{ resultado.aprobado ? 'Aprobado' : 'No aprobado' }}</span>
        </div>
        <p class="eval-result-sub">
          Mínimo para aprobar: {{ examen.puntaje_minimo }}% · Intento {{ resultado.numero }} de
          {{ examen.max_intentos }}
        </p>
        <ul class="eval-detalle">
          <li
            v-for="(p, i) in examen.preguntas"
            :key="p.id"
            :class="detalleDe(p.id)?.correcta ? 'is-ok' : 'is-fail'"
          >
            {{ String(i + 1).padStart(2, '0') }} ·
            {{ detalleDe(p.id)?.correcta ? 'Correcta' : 'Incorrecta' }}
          </li>
        </ul>
        <button
          v-if="!resultado.aprobado && resultado.intentos_restantes > 0"
          class="btn btn-primary"
          @click="reintentar"
        >
          Reintentar ({{ resultado.intentos_restantes }} restantes)
        </button>
        <p v-else-if="!resultado.aprobado" class="eval-state eval-error">Sin intentos restantes.</p>
      </div>

      <!-- Sin intentos disponibles al cargar -->
      <div v-else-if="examen.intentos_restantes <= 0" class="eval-state eval-error">
        Has agotado tus {{ examen.max_intentos }} intentos para esta evaluación.
      </div>

      <!-- Formulario -->
      <form v-else class="eval-form" @submit.prevent="enviar">
        <p class="eval-meta eyebrow">
          {{ examen.preguntas.length }} preguntas · mínimo {{ examen.puntaje_minimo }}% · intento
          {{ examen.intentos_usados + 1 }} de {{ examen.max_intentos }}
        </p>

        <div v-for="(p, i) in examen.preguntas" :key="p.id" class="eval-q card">
          <p class="eval-q-text">
            <span class="mono">{{ String(i + 1).padStart(2, '0') }}</span>
            {{ p.enunciado }}
            <span v-if="p.tipo === 'opcion_multiple'" class="eval-hint">(varias respuestas)</span>
          </p>
          <label v-for="o in p.opciones" :key="o.id" class="eval-opt">
            <input
              v-if="p.tipo === 'opcion_multiple'"
              type="checkbox"
              :checked="estaSeleccionada(p.id, o.id)"
              @change="toggleMultiple(p.id, o.id)"
            />
            <input
              v-else
              type="radio"
              :name="'q-' + p.id"
              :checked="estaSeleccionada(p.id, o.id)"
              @change="toggleUnica(p.id, o.id)"
            />
            <span>{{ o.texto }}</span>
          </label>
        </div>

        <button class="btn btn-primary" type="submit" :disabled="!todasRespondidas() || enviando">
          {{ enviando ? 'Calificando…' : 'Enviar respuestas' }}
        </button>
        <p v-if="!todasRespondidas()" class="eval-hint">
          Responde todas las preguntas para enviar.
        </p>
      </form>
    </template>
  </div>
</template>

<style scoped>
.eval-panel {
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.eval-state {
  color: var(--ink-2);
  font-size: 14px;
}
.eval-error {
  color: var(--guinda);
}
.eval-meta {
  color: var(--ink-4);
}
.eval-q {
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
}
.eval-q-text {
  font-size: 15px;
  color: var(--ink);
  margin: 0 0 calc(var(--unit) * 1);
}
.eval-hint {
  color: var(--ink-4);
  font-size: 12px;
}
.eval-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
  font-size: 14px;
  color: var(--ink-2);
}
.eval-result-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.eval-result-head.is-ok .eval-verdict {
  color: var(--verde, #2e7d32);
}
.eval-result-head.is-fail .eval-verdict {
  color: var(--guinda);
}
.eval-score {
  font-size: 40px;
  font-weight: 600;
}
.eval-result-sub {
  color: var(--ink-3);
  font-size: 13px;
}
.eval-detalle {
  list-style: none;
  padding: 0;
  margin: calc(var(--unit) * 1) 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.eval-detalle li {
  font-size: 13px;
}
.eval-detalle li.is-ok {
  color: var(--verde, #2e7d32);
}
.eval-detalle li.is-fail {
  color: var(--guinda);
}
</style>
