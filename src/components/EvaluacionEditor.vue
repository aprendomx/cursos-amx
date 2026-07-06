<!-- src/components/EvaluacionEditor.vue -->
<script setup>
/* eslint-disable vue/no-mutating-props */
// Este componente muta preguntas in-place (mismo patrón que módulos/lecciones
// en AdminPage). Si se refactoriza a emits, hay que actualizar AdminPage.
const props = defineProps({
  // Array reactivo de preguntas, mutado en sitio (igual que módulos/lecciones).
  preguntas: { type: Array, required: true },
})

const TIPOS = [
  { v: 'opcion_unica', label: 'Opción única' },
  { v: 'opcion_multiple', label: 'Opción múltiple' },
  { v: 'verdadero_falso', label: 'Verdadero / Falso' },
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
  if (p.tipo === 'verdadero_falso') {
    p.opciones = [
      { id: nuevoId(), texto: 'Verdadero', es_correcta: false },
      { id: nuevoId(), texto: 'Falso', es_correcta: false },
    ]
  } else if (p.opciones.length < 2) {
    p.opciones = [
      { id: nuevoId(), texto: '', es_correcta: false },
      { id: nuevoId(), texto: '', es_correcta: false },
    ]
  }
}

function addOpcion(p) {
  p.opciones.push({ id: nuevoId(), texto: '', es_correcta: false })
}
function removeOpcion(p, oi) {
  if (p.opciones.length <= 2) return
  p.opciones.splice(oi, 1)
}

// Única/V-F: correcta exclusiva. Múltiple: toggle libre.
function marcarCorrecta(p, oi) {
  if (p.tipo === 'opcion_multiple') {
    p.opciones[oi].es_correcta = !p.opciones[oi].es_correcta
  } else {
    p.opciones.forEach((o, k) => {
      o.es_correcta = k === oi
    })
  }
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
