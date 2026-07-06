<script setup>
import { ref, watch } from 'vue'
import { crearRubrica, actualizarRubrica } from '@/services/rubricas.js'

const props = defineProps({
  rubrica: { type: Object, default: null },
})
const emit = defineEmits(['saved', 'cancel'])

const nombre = ref(props.rubrica?.nombre || '')
const descripcion = ref(props.rubrica?.descripcion || '')
const criterios = ref(
  props.rubrica?.criterios?.length
    ? JSON.parse(JSON.stringify(props.rubrica.criterios))
    : [
        {
          nombre: '',
          descripcion: '',
          niveles: [
            { puntaje: 0, descripcion: '' },
            { puntaje: 1, descripcion: '' },
            { puntaje: 2, descripcion: '' },
          ],
        },
      ]
)

const saving = ref(false)
const error = ref('')

watch(
  () => props.rubrica,
  (r) => {
    if (r) {
      nombre.value = r.nombre
      descripcion.value = r.descripcion
      criterios.value = JSON.parse(JSON.stringify(r.criterios))
    }
  },
  { immediate: true }
)

function addCriterio() {
  criterios.value.push({
    nombre: '',
    descripcion: '',
    niveles: [
      { puntaje: 0, descripcion: '' },
      { puntaje: 1, descripcion: '' },
      { puntaje: 2, descripcion: '' },
    ],
  })
}

function removeCriterio(idx) {
  criterios.value.splice(idx, 1)
}

function addNivel(cIdx) {
  const niveles = criterios.value[cIdx].niveles
  const last = niveles[niveles.length - 1]
  const nextPuntaje = last ? last.puntaje + 1 : 0
  niveles.push({ puntaje: nextPuntaje, descripcion: '' })
}

function removeNivel(cIdx, nIdx) {
  criterios.value[cIdx].niveles.splice(nIdx, 1)
}

async function onSave() {
  if (!nombre.value.trim()) {
    error.value = 'El nombre es obligatorio.'
    return
  }
  if (criterios.value.length === 0) {
    error.value = 'Agrega al menos un criterio.'
    return
  }
  for (const c of criterios.value) {
    if (!c.nombre.trim()) {
      error.value = 'Todos los criterios deben tener nombre.'
      return
    }
    if (c.niveles.length === 0) {
      error.value = `El criterio "${c.nombre}" debe tener al menos un nivel.`
      return
    }
  }

  saving.value = true
  error.value = ''
  const payload = {
    nombre: nombre.value.trim(),
    descripcion: descripcion.value.trim(),
    criterios: criterios.value,
  }
  try {
    if (props.rubrica?.id) {
      await actualizarRubrica(props.rubrica.id, payload)
    } else {
      await crearRubrica(payload)
    }
    emit('saved')
  } catch (e) {
    error.value = e?.message || 'Error al guardar la rúbrica.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="rubrica-editor">
    <h3>{{ rubrica?.id ? 'Editar rúbrica' : 'Nueva rúbrica' }}</h3>

    <div class="field">
      <label>Nombre</label>
      <input
        v-model="nombre"
        type="text"
        placeholder="Ej. Rúbrica de ensayo"
      >
    </div>

    <div class="field">
      <label>Descripción</label>
      <textarea
        v-model="descripcion"
        rows="2"
      />
    </div>

    <div class="criterios">
      <h4>Criterios</h4>
      <div
        v-for="(c, ci) in criterios"
        :key="ci"
        class="criterio-card"
      >
        <div class="criterio-header">
          <input
            v-model="c.nombre"
            type="text"
            placeholder="Nombre del criterio"
            class="criterio-name"
          >
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            @click="removeCriterio(ci)"
          >
            Eliminar
          </button>
        </div>
        <textarea
          v-model="c.descripcion"
          rows="1"
          placeholder="Descripción del criterio"
          class="criterio-desc"
        />

        <div class="niveles">
          <div
            v-for="(n, ni) in c.niveles"
            :key="ni"
            class="nivel-row"
          >
            <input
              v-model.number="n.puntaje"
              type="number"
              class="nivel-puntaje"
              placeholder="Pts"
            >
            <input
              v-model="n.descripcion"
              type="text"
              placeholder="Descripción del nivel"
              class="nivel-desc"
            >
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              @click="removeNivel(ci, ni)"
            >
              ×
            </button>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            @click="addNivel(ci)"
          >
            + Nivel
          </button>
        </div>
      </div>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        @click="addCriterio"
      >
        + Criterio
      </button>
    </div>

    <p
      v-if="error"
      class="alert alert-error"
    >
      {{ error }}
    </p>

    <div class="actions">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="saving"
        @click="onSave"
      >
        {{ saving ? 'Guardando…' : 'Guardar rúbrica' }}
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        @click="emit('cancel')"
      >
        Cancelar
      </button>
    </div>
  </div>
</template>

<style scoped>
.rubrica-editor {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.criterios {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.criterio-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
}
.criterio-header {
  display: flex;
  gap: calc(var(--unit) * 1);
  align-items: center;
}
.criterio-name {
  flex: 1;
}
.criterio-desc {
  width: 100%;
}
.niveles {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 0.5);
}
.nivel-row {
  display: flex;
  gap: calc(var(--unit) * 1);
  align-items: center;
}
.nivel-puntaje {
  width: 64px;
}
.nivel-desc {
  flex: 1;
}
.actions {
  display: flex;
  gap: calc(var(--unit) * 1);
}
.alert-error {
  color: var(--primary);
}
</style>
