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
const examen = ref(null)
const seleccion = reactive({}) // preguntaId -> respuesta (formato depende del tipo)
const enviando = ref(false)
const resultado = ref(null)

async function cargar() {
  cargando.value = true
  error.value = ''
  resultado.value = null
  for (const k of Object.keys(seleccion)) delete seleccion[k]
  try {
    examen.value = await obtenerEvaluacion(props.leccionId)
    for (const p of examen.value.preguntas) {
      if (p.tipo === 'emparejamiento') {
        // Inicializar con array vacío o con pares desordenados para que el alumno los ordene
        seleccion[p.id] = []
      } else if (p.tipo === 'rellenar_huecos') {
        const count = (p.config?.respuestas?.length) || 1
        seleccion[p.id] = Array(count).fill('')
      } else if (p.tipo === 'ensayo') {
        seleccion[p.id] = ''
      } else {
        seleccion[p.id] = []
      }
    }
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)
watch(() => props.leccionId, cargar)

/* ── Opciones clásicas ── */
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

/* ── Emparejamiento ── */
function emparejar(preguntaId, izq, der) {
  const arr = seleccion[preguntaId]
  const existing = arr.find((pair) => pair.izq === izq)
  if (existing) {
    existing.der = der
  } else {
    arr.push({ izq, der })
  }
}
function emparejamientoDe(preguntaId, izq) {
  const pair = (seleccion[preguntaId] || []).find((x) => x.izq === izq)
  return pair?.der || ''
}

/* ── Validación de respuestas completas ── */
function estaRespondida(p) {
  const s = seleccion[p.id]
  if (p.tipo === 'opcion_unica' || p.tipo === 'opcion_multiple' || p.tipo === 'verdadero_falso') {
    return Array.isArray(s) && s.length > 0
  }
  if (p.tipo === 'emparejamiento') {
    const pares = p.config?.pares || []
    return Array.isArray(s) && s.length === pares.length && s.every((pair) => pair.der)
  }
  if (p.tipo === 'rellenar_huecos') {
    return Array.isArray(s) && s.every((h) => String(h).trim().length > 0)
  }
  if (p.tipo === 'ensayo') {
    return String(s || '').trim().length > 0
  }
  return false
}

const todasRespondidas = () =>
  !!examen.value && examen.value.preguntas.every(estaRespondida)

function detalleDe(preguntaId) {
  return resultado.value?.detalle?.find((d) => d.pregunta_id === preguntaId) || null
}

async function enviar() {
  if (!todasRespondidas() || enviando.value) return
  enviando.value = true
  error.value = ''
  try {
    const payload = {}
    for (const p of examen.value.preguntas) {
      payload[p.id] = seleccion[p.id]
    }
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
    <div
      v-if="cargando"
      class="eval-state"
    >
      Cargando evaluación…
    </div>
    <div
      v-else-if="error"
      class="eval-state eval-error"
    >
      {{ error }}
    </div>

    <template v-else-if="examen">
      <!-- Resultado -->
      <div
        v-if="resultado"
        class="eval-result"
      >
        <div
          class="eval-result-head"
          :class="resultado.aprobado ? 'is-ok' : 'is-fail'"
        >
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
        <p
          v-else-if="!resultado.aprobado"
          class="eval-state eval-error"
        >
          Sin intentos restantes.
        </p>
      </div>

      <!-- Sin intentos disponibles al cargar -->
      <div
        v-else-if="examen.intentos_restantes <= 0"
        class="eval-state eval-error"
      >
        Has agotado tus {{ examen.max_intentos }} intentos para esta evaluación.
      </div>

      <!-- Formulario -->
      <form
        v-else
        class="eval-form"
        @submit.prevent="enviar"
      >
        <p class="eval-meta eyebrow">
          {{ examen.preguntas.length }} preguntas · mínimo {{ examen.puntaje_minimo }}% · intento
          {{ examen.intentos_usados + 1 }} de {{ examen.max_intentos }}
        </p>

        <div
          v-for="(p, i) in examen.preguntas"
          :key="p.id"
          class="eval-q card"
        >
          <p class="eval-q-text">
            <span class="mono">{{ String(i + 1).padStart(2, '0') }}</span>
            {{ p.enunciado }}
            <span
              v-if="p.tipo === 'opcion_multiple'"
              class="eval-hint"
            >(varias respuestas)</span>
            <span
              v-if="p.tipo === 'ensayo'"
              class="eval-hint"
            >(respuesta libre)</span>
          </p>

          <!-- Opciones clásicas -->
          <template v-if="['opcion_unica','opcion_multiple','verdadero_falso'].includes(p.tipo)">
            <label
              v-for="o in p.opciones"
              :key="o.id"
              class="eval-opt"
            >
              <input
                v-if="p.tipo === 'opcion_multiple'"
                type="checkbox"
                :checked="estaSeleccionada(p.id, o.id)"
                @change="toggleMultiple(p.id, o.id)"
              >
              <input
                v-else
                type="radio"
                :name="'q-' + p.id"
                :checked="estaSeleccionada(p.id, o.id)"
                @change="toggleUnica(p.id, o.id)"
              >
              <span>{{ o.texto }}</span>
            </label>
          </template>

          <!-- Emparejamiento -->
          <template v-if="p.tipo === 'emparejamiento'">
            <div
              v-for="(par, pi) in p.config?.pares"
              :key="pi"
              class="eval-opt"
              :style="{ gap: '12px', padding: '8px 0' }"
            >
              <span :style="{ flex: 1, fontWeight: 500 }">{{ par.izq }}</span>
              <select
                :value="emparejamientoDe(p.id, par.izq)"
                @change="emparejar(p.id, par.izq, $event.target.value)"
              >
                <option value="">
                  Selecciona…
                </option>
                <option
                  v-for="opt in p.config.pares"
                  :key="opt.der"
                  :value="opt.der"
                >
                  {{ opt.der }}
                </option>
              </select>
            </div>
          </template>

          <!-- Rellenar huecos -->
          <template v-if="p.tipo === 'rellenar_huecos'">
            <div
              v-for="(h, hi) in p.config?.respuestas"
              :key="hi"
              class="eval-opt"
              :style="{ gap: '8px' }"
            >
              <span class="mono">{{ hi + 1 }}.</span>
              <input
                v-model="seleccion[p.id][hi]"
                type="text"
                placeholder="Tu respuesta"
                :style="{ flex: 1 }"
              >
            </div>
          </template>

          <!-- Ensayo -->
          <template v-if="p.tipo === 'ensayo'">
            <textarea
              v-model="seleccion[p.id]"
              rows="6"
              :maxlength="p.config?.max_caracteres || 2000"
              placeholder="Escribe tu respuesta…"
              :style="{ width: '100%', resize: 'vertical' }"
            />
            <p class="eval-hint">
              {{ (seleccion[p.id] || '').length }} / {{ p.config?.max_caracteres || 2000 }} caracteres
              <span v-if="p.config?.guia">· {{ p.config.guia }}</span>
            </p>
          </template>
        </div>

        <button
          class="btn btn-primary"
          type="submit"
          :disabled="!todasRespondidas() || enviando"
        >
          {{ enviando ? 'Calificando…' : 'Enviar respuestas' }}
        </button>
        <p
          v-if="!todasRespondidas()"
          class="eval-hint"
        >
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
  color: var(--brand-primary);
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
  color: var(--brand-secondary, #2e7d32);
}
.eval-result-head.is-fail .eval-verdict {
  color: var(--brand-primary);
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
  color: var(--brand-secondary, #2e7d32);
}
.eval-detalle li.is-fail {
  color: var(--brand-primary);
}
</style>
