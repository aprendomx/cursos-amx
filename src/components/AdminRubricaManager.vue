<script setup>
import { ref, onMounted } from 'vue'
import { listarRubricas, eliminarRubrica } from '@/services/rubricas'
import RubricaEditor from '@/components/RubricaEditor.vue'

const rubricas = ref([])
const loading = ref(false)
const error = ref('')
const editing = ref(null)
const showEditor = ref(false)

async function cargar() {
  loading.value = true
  error.value = ''
  try {
    rubricas.value = await listarRubricas()
  } catch (e) {
    error.value = e?.message || 'Error al cargar rúbricas.'
  } finally {
    loading.value = false
  }
}

function onNueva() {
  editing.value = null
  showEditor.value = true
}

function onEditar(r) {
  editing.value = r
  showEditor.value = true
}

async function onEliminar(id) {
  if (!confirm('¿Eliminar esta rúbrica?')) return
  try {
    await eliminarRubrica(id)
    await cargar()
  } catch (e) {
    error.value = e?.message || 'Error al eliminar.'
  }
}

function onSaved() {
  showEditor.value = false
  editing.value = null
  cargar()
}

function onCancel() {
  showEditor.value = false
  editing.value = null
}

onMounted(cargar)
</script>

<template>
  <div class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Evaluación</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
          Rúbricas
        </h1>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="onNueva">
        + Nueva rúbrica
      </button>
    </div>

    <p
      v-if="error"
      class="mono"
      :style="{ color: 'var(--primary)', marginBottom: 'calc(var(--unit) * 2)' }"
    >
      &#9888; {{ error }}
    </p>

    <RubricaEditor v-if="showEditor" :rubrica="editing" @saved="onSaved" @cancel="onCancel" />

    <div v-else class="card" :style="{ overflow: 'auto' }">
      <table class="admin-table admin-table-full">
        <thead>
          <tr>
            <th class="mono">Nombre</th>
            <th class="mono">Criterios</th>
            <th class="mono">Niveles (max)</th>
            <th class="mono" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rubricas" :key="r.id">
            <td>{{ r.nombre }}</td>
            <td>{{ r.criterios?.length || 0 }}</td>
            <td>
              {{ Math.max(0, ...(r.criterios || []).map((c) => c.niveles?.length || 0)) }}
            </td>
            <td :style="{ textAlign: 'right' }">
              <button type="button" class="btn btn-ghost btn-sm" @click="onEditar(r)">
                Editar
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :style="{ color: 'var(--primary)' }"
                @click="onEliminar(r.id)"
              >
                Eliminar
              </button>
            </td>
          </tr>
          <tr v-if="rubricas.length === 0 && !loading">
            <td
              colspan="4"
              class="mono"
              :style="{ color: 'var(--ink-3)', textAlign: 'center', padding: '24px' }"
            >
              No hay rúbricas registradas.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
