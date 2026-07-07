<script setup>
import { ref } from 'vue'
import { useAiQuizGenerator } from '@/composables/useAiQuizGenerator.js'

const props = defineProps({
  preguntas: { type: Array, required: true },
})

const emit = defineEmits(['add-preguntas'])

const visible = ref(false)
const tema = ref('')
const nivel = ref('intermedio')
const cantidad = ref(5)

const ai = useAiQuizGenerator()

const NIVELES = [
  { value: 'basico', label: 'Básico' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
]

function abrir() {
  visible.value = true
  ai.limpiar()
  tema.value = ''
  nivel.value = 'intermedio'
  cantidad.value = 5
}

function cerrar() {
  visible.value = false
  ai.limpiar()
}

async function onGenerar() {
  if (!tema.value.trim()) return
  await ai.generar(tema.value.trim(), nivel.value, cantidad.value)
}

function onUsar() {
  emit('add-preguntas', ai.preguntas.value)
  cerrar()
}

function onDescartar() {
  ai.limpiar()
}
</script>

<template>
  <div>
    <button
      type="button"
      class="btn btn-secondary"
      :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
      @click="abrir"
    >
      ✨ Generar con IA
    </button>

    <div v-if="visible" class="modal-overlay" @click.self="cerrar">
      <div class="modal-content card" :style="{ maxWidth: '640px', width: '100%' }">
        <div class="modal-header">
          <h3 class="h4">Generar preguntas con IA</h3>
          <button type="button" class="qe-icon" @click="cerrar">×</button>
        </div>

        <div class="field">
          <label>Tema del quiz</label>
          <input v-model="tema" type="text" placeholder="Ej. Introducción a la programación" />
        </div>

        <div class="field">
          <label>Nivel</label>
          <select v-model="nivel">
            <option v-for="n in NIVELES" :key="n.value" :value="n.value">
              {{ n.label }}
            </option>
          </select>
        </div>

        <div class="field">
          <label>Cantidad de preguntas</label>
          <input v-model.number="cantidad" type="number" min="1" max="20" />
        </div>

        <div :style="{ display: 'flex', gap: '8px', marginTop: 'calc(var(--unit) * 2)' }">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="ai.loading.value || !tema.trim()"
            @click="onGenerar"
          >
            {{ ai.loading.value ? 'Generando…' : 'Generar' }}
          </button>
          <button type="button" class="btn btn-secondary" @click="cerrar">Cancelar</button>
        </div>

        <div
          v-if="ai.error.value"
          class="alert alert-error"
          :style="{ marginTop: 'calc(var(--unit) * 2)' }"
        >
          {{ ai.error.value }}
        </div>

        <div
          v-if="ai.preguntas.value.length"
          class="ai-preview"
          :style="{ marginTop: 'calc(var(--unit) * 3)' }"
        >
          <h4 class="eyebrow">Vista previa ({{ ai.preguntas.value.length }} preguntas)</h4>

          <div
            v-for="(p, i) in ai.preguntas.value"
            :key="i"
            class="card"
            :style="{ marginTop: 'calc(var(--unit) * 2)', padding: 'calc(var(--unit) * 2)' }"
          >
            <p class="mono" :style="{ color: 'var(--ink-4)', marginBottom: '4px' }">
              Pregunta {{ i + 1 }}
            </p>
            <p :style="{ fontWeight: 600, marginBottom: '8px' }">
              {{ p.enunciado }}
            </p>
            <ul :style="{ paddingLeft: '20px', marginBottom: '8px' }">
              <li
                v-for="(op, j) in p.opciones"
                :key="j"
                :style="{ color: j === p.respuesta_correcta ? 'var(--success)' : 'inherit' }"
              >
                {{ op }} {{ j === p.respuesta_correcta ? '✓' : '' }}
              </li>
            </ul>
            <p v-if="p.explicacion" class="caption" :style="{ color: 'var(--ink-4)' }">
              {{ p.explicacion }}
            </p>
          </div>

          <div :style="{ display: 'flex', gap: '8px', marginTop: 'calc(var(--unit) * 2)' }">
            <button type="button" class="btn btn-primary" @click="onUsar">
              Usar estas preguntas
            </button>
            <button type="button" class="btn btn-secondary" @click="onDescartar">Descartar</button>
          </div>
        </div>
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
  padding: calc(var(--unit) * 3);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(var(--unit) * 3);
}
.ai-preview {
  max-height: 400px;
  overflow-y: auto;
}
</style>
