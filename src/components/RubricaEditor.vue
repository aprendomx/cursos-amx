<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      tipo: 'niveles',
      titulo: '',
      puntaje_maximo: 100,
      criterios: [],
      niveles: [],
    }),
  },
})

const emit = defineEmits(['update:modelValue'])

const rubrica = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

function updateField(field, value) {
  rubrica.value = { ...rubrica.value, [field]: value }
}

function addCriterio() {
  const criterios = [...(rubrica.value.criterios || [])]
  criterios.push({
    titulo: '',
    descripcion: '',
    peso: 1.0,
    puntaje_maximo: rubrica.value.tipo === 'puntaje_libre' ? 0 : undefined,
  })
  updateField('criterios', criterios)
}

function removeCriterio(index) {
  const criterios = [...(rubrica.value.criterios || [])]
  criterios.splice(index, 1)
  updateField('criterios', criterios)
}

function updateCriterio(index, field, value) {
  const criterios = [...(rubrica.value.criterios || [])]
  criterios[index] = { ...criterios[index], [field]: value }
  updateField('criterios', criterios)
}

function addNivel() {
  const niveles = [...(rubrica.value.niveles || [])]
  niveles.push({ etiqueta: '', puntaje: 0 })
  updateField('niveles', niveles)
}

function removeNivel(index) {
  const niveles = [...(rubrica.value.niveles || [])]
  niveles.splice(index, 1)
  updateField('niveles', niveles)
}

function updateNivel(index, field, value) {
  const niveles = [...(rubrica.value.niveles || [])]
  niveles[index] = { ...niveles[index], [field]: value }
  updateField('niveles', niveles)
}
</script>

<template>
  <div class="rubrica-editor">
    <div class="field-row">
      <label class="field-label">Tipo</label>
      <select
        :value="rubrica.tipo"
        data-test="tipo-select"
        @change="updateField('tipo', $event.target.value)"
      >
        <option value="niveles">Niveles</option>
        <option value="puntaje_libre">Puntaje libre</option>
      </select>
    </div>

    <div class="field-row">
      <label class="field-label">Título</label>
      <input
        :value="rubrica.titulo"
        type="text"
        data-test="titulo-input"
        @input="updateField('titulo', $event.target.value)"
      />
    </div>

    <div class="field-row">
      <label class="field-label">Puntaje máximo</label>
      <input
        :value="rubrica.puntaje_maximo"
        type="number"
        data-test="puntaje-max-input"
        @input="updateField('puntaje_maximo', Number($event.target.value))"
      />
    </div>

    <div class="section">
      <div class="section-header">
        <h4 class="section-title">Criterios</h4>
        <button class="btn-add" data-test="add-criterio-btn" @click="addCriterio">+ Agregar</button>
      </div>

      <div
        v-for="(c, i) in rubrica.criterios"
        :key="i"
        class="criterio-card"
        data-test="criterio-card"
      >
        <div class="criterio-fields">
          <input
            :value="c.titulo"
            type="text"
            placeholder="Título del criterio"
            data-test="criterio-titulo"
            @input="updateCriterio(i, 'titulo', $event.target.value)"
          />
          <input
            :value="c.descripcion"
            type="text"
            placeholder="Descripción"
            data-test="criterio-descripcion"
            @input="updateCriterio(i, 'descripcion', $event.target.value)"
          />
          <div class="row-inline">
            <label>Peso</label>
            <input
              :value="c.peso"
              type="number"
              step="0.1"
              data-test="criterio-peso"
              @input="updateCriterio(i, 'peso', Number($event.target.value))"
            />
            <label v-if="rubrica.tipo === 'puntaje_libre'" class="pl-label">Puntaje máx.</label>
            <input
              v-if="rubrica.tipo === 'puntaje_libre'"
              :value="c.puntaje_maximo"
              type="number"
              data-test="criterio-puntaje-max"
              @input="updateCriterio(i, 'puntaje_maximo', Number($event.target.value))"
            />
          </div>
        </div>
        <button class="btn-remove" data-test="remove-criterio-btn" @click="removeCriterio(i)">
          ×
        </button>
      </div>

      <p v-if="!rubrica.criterios?.length" class="empty" data-test="empty-criterios">
        Sin criterios
      </p>
    </div>

    <div v-if="rubrica.tipo === 'niveles'" class="section">
      <div class="section-header">
        <h4 class="section-title">Niveles</h4>
        <button class="btn-add" data-test="add-nivel-btn" @click="addNivel">+ Agregar</button>
      </div>

      <div v-for="(n, i) in rubrica.niveles" :key="i" class="nivel-row" data-test="nivel-row">
        <input
          :value="n.etiqueta"
          type="text"
          placeholder="Etiqueta"
          data-test="nivel-etiqueta"
          @input="updateNivel(i, 'etiqueta', $event.target.value)"
        />
        <input
          :value="n.puntaje"
          type="number"
          placeholder="Puntaje"
          data-test="nivel-puntaje"
          @input="updateNivel(i, 'puntaje', Number($event.target.value))"
        />
        <button class="btn-remove" data-test="remove-nivel-btn" @click="removeNivel(i)">×</button>
      </div>

      <p v-if="!rubrica.niveles?.length" class="empty" data-test="empty-niveles">Sin niveles</p>
    </div>
  </div>
</template>

<style scoped>
.rubrica-editor {
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
select:focus {
  outline: none;
  border-color: var(--primary);
}
.section {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: calc(var(--unit) * 2);
  background: var(--paper);
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(var(--unit) * 1.5);
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  margin: 0;
}
.btn-add {
  padding: calc(var(--unit) * 0.5) calc(var(--unit) * 1.5);
  border-radius: 4px;
  border: 1px solid var(--primary);
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 160ms var(--ease),
    color 160ms var(--ease);
}
.btn-add:hover {
  background: var(--primary);
  color: #fff;
}
.criterio-card {
  display: flex;
  gap: calc(var(--unit));
  padding: calc(var(--unit) * 1.5);
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper-2);
  margin-bottom: calc(var(--unit));
}
.criterio-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit));
}
.row-inline {
  display: flex;
  align-items: center;
  gap: calc(var(--unit));
}
.row-inline label {
  font-size: 12px;
  color: var(--ink-2);
  white-space: nowrap;
}
.row-inline input {
  width: 80px;
}
.pl-label {
  margin-left: calc(var(--unit));
}
.btn-remove {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--ink-3);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  transition:
    color 160ms var(--ease),
    background 160ms var(--ease);
}
.btn-remove:hover {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
}
.empty {
  font-size: 13px;
  color: var(--ink-3);
  margin: 0;
}
.nivel-row {
  display: flex;
  align-items: center;
  gap: calc(var(--unit));
  margin-bottom: calc(var(--unit));
}
.nivel-row input:first-child {
  flex: 1;
}
.nivel-row input:nth-child(2) {
  width: 100px;
}
</style>
