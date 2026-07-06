<script setup>
import { ref, onMounted } from 'vue'
import {
  listarBadges,
  crearBadge,
  actualizarBadge,
  eliminarBadge,
} from '@/services/gamificacion.js'

const badges = ref([])
const loading = ref(false)
const error = ref('')
const saving = ref(false)
const showForm = ref(false)
const editingId = ref(null)

const form = ref({
  nombre: '',
  descripcion: '',
  criterio_tipo: 'primer_login',
  criterio_config: '{}',
  puntos_otorga: 0,
})

const CRITERIO_TIPOS = [
  { value: 'completar_curso', label: 'Completar curso' },
  { value: 'calificacion_minima', label: 'Calificaci\u00f3n m\u00ednima' },
  { value: 'entregar_tiempo', label: 'Entregar a tiempo' },
  { value: 'participar_foros', label: 'Participar en foros' },
  { value: 'streak_dias', label: 'Racha de d\u00edas' },
  { value: 'completar_modulo', label: 'Completar m\u00f3dulo' },
  { value: 'primer_login', label: 'Primer login' },
]

function resetForm() {
  form.value = {
    nombre: '',
    descripcion: '',
    criterio_tipo: 'primer_login',
    criterio_config: '{}',
    puntos_otorga: 0,
  }
  editingId.value = null
}

async function cargar() {
  loading.value = true
  error.value = ''
  try {
    badges.value = await listarBadges()
  } catch (e) {
    error.value = e?.message || 'Error al cargar badges.'
  } finally {
    loading.value = false
  }
}

function onNueva() {
  resetForm()
  showForm.value = true
}

function onEditar(b) {
  editingId.value = b.id
  form.value = {
    nombre: b.nombre,
    descripcion: b.descripcion || '',
    criterio_tipo: b.criterio_tipo,
    criterio_config: JSON.stringify(b.criterio_config || {}, null, 2),
    puntos_otorga: b.puntos_otorga,
  }
  showForm.value = true
}

async function onGuardar() {
  saving.value = true
  error.value = ''
  try {
    let config
    try {
      config = JSON.parse(form.value.criterio_config)
    } catch {
      error.value = 'El campo Configuraci\u00f3n no contiene JSON v\u00e1lido.'
      saving.value = false
      return
    }
    const payload = {
      nombre: form.value.nombre.trim(),
      descripcion: form.value.descripcion.trim(),
      criterio_tipo: form.value.criterio_tipo,
      criterio_config: config,
      puntos_otorga: Number(form.value.puntos_otorga),
    }
    if (editingId.value) {
      await actualizarBadge(editingId.value, payload)
    } else {
      await crearBadge(payload)
    }
    showForm.value = false
    resetForm()
    await cargar()
  } catch (e) {
    error.value = e?.message || 'Error al guardar el badge.'
  } finally {
    saving.value = false
  }
}

function onCancelar() {
  showForm.value = false
  resetForm()
  error.value = ''
}

async function onEliminar(id) {
  if (!confirm('\u00bfEliminar este badge?')) return
  try {
    await eliminarBadge(id)
    await cargar()
  } catch (e) {
    error.value = e?.message || 'Error al eliminar.'
  }
}

onMounted(cargar)
</script>

<template>
  <div class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Gamificaci\u00f3n</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
          Badges
        </h1>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="onNueva">+ Nuevo badge</button>
    </div>

    <p
      v-if="error"
      class="mono"
      :style="{ color: 'var(--primary)', marginBottom: 'calc(var(--unit) * 2)' }"
    >
      &#9888; {{ error }}
    </p>

    <!-- Formulario inline -->
    <div v-if="showForm" class="card" :style="{ marginBottom: 'calc(var(--unit) * 3)' }">
      <h3 :style="{ marginBottom: 'calc(var(--unit) * 2)', color: 'var(--ink)' }">
        {{ editingId ? 'Editar badge' : 'Nuevo badge' }}
      </h3>
      <div class="field">
        <label>Nombre</label>
        <input v-model="form.nombre" type="text" placeholder="Nombre del badge" />
      </div>
      <div class="field">
        <label>Descripci\u00f3n</label>
        <input v-model="form.descripcion" type="text" placeholder="Descripci\u00f3n breve" />
      </div>
      <div class="field">
        <label>Criterio</label>
        <select v-model="form.criterio_tipo">
          <option v-for="opt in CRITERIO_TIPOS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>Configuraci\u00f3n (JSON)</label>
        <textarea v-model="form.criterio_config" rows="4" placeholder='{ "clave": "valor" }' />
      </div>
      <div class="field">
        <label>Puntos otorga</label>
        <input v-model="form.puntos_otorga" type="number" min="0" />
      </div>
      <div
        :style="{
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end',
          marginTop: 'calc(var(--unit) * 2)',
        }"
      >
        <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="onCancelar">
          Cancelar
        </button>
        <button type="button" class="btn btn-sm" :disabled="saving" @click="onGuardar">
          {{ saving ? 'Guardando\u2026' : editingId ? 'Actualizar' : 'Crear' }}
        </button>
      </div>
    </div>

    <!-- Tabla -->
    <div v-else class="card" :style="{ overflow: 'auto' }">
      <table class="admin-table admin-table-full">
        <thead>
          <tr>
            <th class="mono">Nombre</th>
            <th class="mono">Criterio</th>
            <th class="mono">Puntos</th>
            <th class="mono" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td
              colspan="4"
              class="mono"
              :style="{ textAlign: 'center', color: 'var(--ink-4)', padding: '24px' }"
            >
              Cargando&hellip;
            </td>
          </tr>
          <tr v-else-if="!badges.length">
            <td
              colspan="4"
              class="mono"
              :style="{ textAlign: 'center', color: 'var(--ink-3)', padding: '24px' }"
            >
              No hay badges registrados.
            </td>
          </tr>
          <tr v-for="b in badges" :key="b.id">
            <td :style="{ fontWeight: '500' }">
              {{ b.nombre }}
            </td>
            <td class="mono" :style="{ color: 'var(--ink-3)' }">
              {{
                CRITERIO_TIPOS.find((o) => o.value === b.criterio_tipo)?.label || b.criterio_tipo
              }}
            </td>
            <td class="mono" :style="{ color: 'var(--ink-4)' }">
              {{ b.puntos_otorga }}
            </td>
            <td :style="{ textAlign: 'right' }">
              <button type="button" class="btn btn-ghost btn-sm" @click="onEditar(b)">
                Editar
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :style="{ color: 'var(--primary)' }"
                @click="onEliminar(b.id)"
              >
                Eliminar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
