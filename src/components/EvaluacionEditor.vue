<!-- src/components/EvaluacionEditor.vue -->
<script setup>
/* eslint-disable vue/no-mutating-props */
const props = defineProps({
  preguntas: { type: Array, required: true },
})

const TIPOS = [
  { v: 'opcion_unica', label: 'Opción única' },
  { v: 'opcion_multiple', label: 'Opción múltiple' },
  { v: 'verdadero_falso', label: 'Verdadero / Falso' },
  { v: 'emparejamiento', label: 'Emparejamiento' },
  { v: 'rellenar_huecos', label: 'Rellenar huecos' },
  { v: 'ensayo', label: 'Ensayo' },
]

let seq = 0
const nuevoId = () => `new-${Date.now()}-${seq++}`

function addPregunta() {
  props.preguntas.push({
    id: nuevoId(),
    tipo: 'opcion_unica',
    enunciado: '',
    opciones: [
      { id: nuevoId(), texto: '', es_correcta: false },
      { id: nuevoId(), texto: '', es_correcta: false },
    ],
    config: {},
  })
}

function removePregunta(i) {
  props.preguntas.splice(i, 1)
}

function movePregunta(i, dir) {
  const j = i + dir
  if (j < 0 || j >= props.preguntas.length) return
  const [item] = props.preguntas.splice(i, 1)
  props.preguntas.splice(j, 0, item)
}

function onTipoChange(p) {
  if (!p.config) p.config = {}
  if (p.tipo === 'verdadero_falso') {
    p.opciones = [
      { id: nuevoId(), texto: 'Verdadero', es_correcta: false },
      { id: nuevoId(), texto: 'Falso', es_correcta: false },
    ]
  } else if (p.tipo === 'emparejamiento') {
    p.opciones = []
    p.config = { pares: [{ izq: '', der: '' }, { izq: '', der: '' }] }
  } else if (p.tipo === 'rellenar_huecos') {
    p.opciones = []
    p.config = { respuestas: [''] }
  } else if (p.tipo === 'ensayo') {
    p.opciones = []
    p.config = { max_caracteres: 2000, guia: '' }
  } else if (p.opciones.length < 2) {
    p.opciones = [
      { id: nuevoId(), texto: '', es_correcta: false },
      { id: nuevoId(), texto: '', es_correcta: false },
    ]
  }
}

/* ── Opciones (clásicas) ── */
function addOpcion(p) {
  p.opciones.push({ id: nuevoId(), texto: '', es_correcta: false })
}
function removeOpcion(p, oi) {
  if (p.opciones.length <= 2) return
  p.opciones.splice(oi, 1)
}
function marcarCorrecta(p, oi) {
  if (p.tipo === 'opcion_multiple') {
    p.opciones[oi].es_correcta = !p.opciones[oi].es_correcta
  } else {
    p.opciones.forEach((o, k) => {
      o.es_correcta = k === oi
    })
  }
}

/* ── Emparejamiento ── */
function addPar(p) {
  if (!p.config.pares) p.config.pares = []
  p.config.pares.push({ izq: '', der: '' })
}
function removePar(p, pi) {
  p.config.pares.splice(pi, 1)
}

/* ── Rellenar huecos ── */
function addHueco(p) {
  if (!p.config.respuestas) p.config.respuestas = []
  p.config.respuestas.push('')
}
function removeHueco(p, hi) {
  if (p.config.respuestas.length <= 1) return
  p.config.respuestas.splice(hi, 1)
}
</script>

<template>
  <div class="qe">
    <div
      v-for="(p, i) in preguntas"
      :key="p.id"
      class="qe-q card"
    >
      <div class="qe-q-head">
        <span
          class="mono"
          :style="{ color: 'var(--ink-4)' }"
        >Pregunta {{ i + 1 }}</span>
        <div :style="{ display: 'flex', gap: '4px' }">
          <button
            type="button"
            class="qe-icon"
            :disabled="i === 0"
            @click="movePregunta(i, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="qe-icon"
            :disabled="i === preguntas.length - 1"
            @click="movePregunta(i, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="qe-icon qe-icon-danger"
            @click="removePregunta(i)"
          >
            ×
          </button>
        </div>
      </div>

      <div class="field">
        <label>Tipo</label>
        <select
          v-model="p.tipo"
          @change="onTipoChange(p)"
        >
          <option
            v-for="t in TIPOS"
            :key="t.v"
            :value="t.v"
          >
            {{ t.label }}
          </option>
        </select>
      </div>

      <div class="field">
        <label>Enunciado</label>
        <textarea
          v-model="p.enunciado"
          rows="2"
          placeholder="Escribe la pregunta…"
          :style="{ resize: 'vertical' }"
        />
      </div>

      <!-- Opciones clásicas -->
      <template v-if="['opcion_unica','opcion_multiple','verdadero_falso'].includes(p.tipo)">
        <p
          class="eyebrow"
          :style="{ margin: 'calc(var(--unit) * 1) 0' }"
        >
          Opciones — marca la(s) correcta(s)
        </p>
        <div
          v-for="(o, oi) in p.opciones"
          :key="o.id"
          class="qe-opt"
        >
          <button
            type="button"
            class="qe-correct"
            :class="{ on: o.es_correcta }"
            :title="o.es_correcta ? 'Correcta' : 'Marcar como correcta'"
            @click="marcarCorrecta(p, oi)"
          >
            ✓
          </button>
          <input
            v-model="o.texto"
            type="text"
            :disabled="p.tipo === 'verdadero_falso'"
            placeholder="Texto de la opción"
          >
          <button
            v-if="p.tipo !== 'verdadero_falso'"
            type="button"
            class="qe-icon qe-icon-danger"
            :disabled="p.opciones.length <= 2"
            @click="removeOpcion(p, oi)"
          >
            ×
          </button>
        </div>
        <button
          v-if="p.tipo !== 'verdadero_falso'"
          type="button"
          class="btn btn-ghost btn-sm"
          @click="addOpcion(p)"
        >
          + Opción
        </button>
      </template>

      <!-- Emparejamiento -->
      <template v-if="p.tipo === 'emparejamiento'">
        <p
          class="eyebrow"
          :style="{ margin: 'calc(var(--unit) * 1) 0' }"
        >
          Pares — escribe el elemento izquierdo y su correspondiente derecho
        </p>
        <div
          v-for="(par, pi) in p.config.pares"
          :key="pi"
          class="qe-opt"
          :style="{ gap: '8px' }"
        >
          <input
            v-model="par.izq"
            type="text"
            placeholder="Izquierda"
            :style="{ flex: 1 }"
          >
          <span
            class="mono"
            :style="{ color: 'var(--ink-3)' }"
          >↔</span>
          <input
            v-model="par.der"
            type="text"
            placeholder="Derecha"
            :style="{ flex: 1 }"
          >
          <button
            type="button"
            class="qe-icon qe-icon-danger"
            :disabled="p.config.pares.length <= 2"
            @click="removePar(p, pi)"
          >
            ×
          </button>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="addPar(p)"
        >
          + Par
        </button>
      </template>

      <!-- Rellenar huecos -->
      <template v-if="p.tipo === 'rellenar_huecos'">
        <p
          class="eyebrow"
          :style="{ margin: 'calc(var(--unit) * 1) 0' }"
        >
          Respuestas — en orden de aparición en el enunciado (usa ____ para marcar huecos)
        </p>
        <div
          v-for="(resp, hi) in p.config.respuestas"
          :key="hi"
          class="qe-opt"
        >
          <span
            class="mono"
            :style="{ color: 'var(--ink-3)', width: '28px' }"
          >{{ hi + 1 }}</span>
          <input
            v-model="p.config.respuestas[hi]"
            type="text"
            placeholder="Respuesta correcta"
            :style="{ flex: 1 }"
          >
          <button
            type="button"
            class="qe-icon qe-icon-danger"
            :disabled="p.config.respuestas.length <= 1"
            @click="removeHueco(p, hi)"
          >
            ×
          </button>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="addHueco(p)"
        >
          + Hueco
        </button>
      </template>

      <!-- Ensayo -->
      <template v-if="p.tipo === 'ensayo'">
        <div class="field">
          <label>Máximo de caracteres</label>
          <input
            v-model.number="p.config.max_caracteres"
            type="number"
            min="100"
            max="10000"
            :style="{ width: '120px' }"
          >
        </div>
        <div class="field">
          <label>Guía de calificación (visible para el alumno)</label>
          <textarea
            v-model="p.config.guia"
            rows="3"
            placeholder="Describe los criterios de evaluación…"
            :style="{ resize: 'vertical' }"
          />
        </div>
      </template>
    </div>

    <button
      type="button"
      class="btn btn-secondary btn-sm"
      @click="addPregunta"
    >
      + Agregar pregunta
    </button>
  </div>
</template>

<style scoped>
.qe {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.qe-q {
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.qe-q-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.qe-opt {
  display: flex;
  align-items: center;
  gap: 8px;
}
.qe-opt input[type='text'] {
  flex: 1;
}
.qe-correct {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink-4);
  cursor: pointer;
}
.qe-correct.on {
  background: var(--brand-secondary, #2e7d32);
  color: #fff;
  border-color: var(--brand-secondary, #2e7d32);
}
.qe-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--paper);
  cursor: pointer;
}
.qe-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.qe-icon-danger:hover {
  color: var(--brand-primary);
}
</style>
