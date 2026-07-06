<script setup>
import { ref, onMounted, watch } from 'vue'
import { fetchAllCursosAdmin } from '@/services/cursos.js'
import {
  listarCohortes,
  crearCohorte,
  actualizarCohorte,
  eliminarCohorte,
  listarMiembros,
  agregarMiembro,
  quitarMiembro,
} from '@/services/cohortes.js'
import { listarUsuarios } from '@/services/usuarios.js'

const cursos = ref([])
const cursoId = ref('')
const cohortes = ref([])
const loading = ref(false)
const error = ref('')

const showForm = ref(false)
const editing = ref(null)
const form = ref({ nombre: '', descripcion: '', cupo_max: null, fecha_inicio: '', fecha_fin: '' })

const selectedCohorte = ref(null)
const miembros = ref([])
const usuarios = ref([])
const usuarioSearch = ref('')

async function cargarCursos() {
  try {
    cursos.value = await fetchAllCursosAdmin()
  } catch (e) {
    error.value = 'Error al cargar cursos.'
  }
}

async function cargarCohortes() {
  if (!cursoId.value) {
    cohortes.value = []
    return
  }
  loading.value = true
  error.value = ''
  try {
    cohortes.value = await listarCohortes(cursoId.value)
  } catch (e) {
    error.value = e?.message || 'Error al cargar cohortes.'
  } finally {
    loading.value = false
  }
}

function onNueva() {
  editing.value = null
  form.value = { nombre: '', descripcion: '', cupo_max: null, fecha_inicio: '', fecha_fin: '' }
  showForm.value = true
  selectedCohorte.value = null
}

function onEditar(c) {
  editing.value = c
  form.value = {
    nombre: c.nombre,
    descripcion: c.descripcion || '',
    cupo_max: c.cupo_max,
    fecha_inicio: c.fecha_inicio,
    fecha_fin: c.fecha_fin,
  }
  showForm.value = true
  selectedCohorte.value = null
}

async function onGuardar() {
  error.value = ''
  const payload = {
    curso_id: cursoId.value,
    nombre: form.value.nombre.trim(),
    descripcion: form.value.descripcion.trim() || null,
    cupo_max: form.value.cupo_max ? parseInt(form.value.cupo_max) : null,
    fecha_inicio: form.value.fecha_inicio || null,
    fecha_fin: form.value.fecha_fin || null,
  }
  try {
    if (editing.value) {
      await actualizarCohorte(editing.value.id, payload)
    } else {
      await crearCohorte(payload)
    }
    showForm.value = false
    await cargarCohortes()
  } catch (e) {
    error.value = e?.message || 'Error al guardar cohorte.'
  }
}

async function onEliminar(id) {
  if (!confirm('¿Eliminar este cohorte?')) return
  try {
    await eliminarCohorte(id)
    await cargarCohortes()
  } catch (e) {
    error.value = e?.message || 'Error al eliminar.'
  }
}

async function verMiembros(c) {
  selectedCohorte.value = c
  try {
    miembros.value = await listarMiembros(c.id)
    usuarios.value = []
  } catch (e) {
    error.value = e?.message || 'Error al cargar miembros.'
  }
}

async function buscarUsuarios() {
  if (!usuarioSearch.value.trim()) return
  try {
    const { rows } = await listarUsuarios({ q: usuarioSearch.value, page: 0 })
    usuarios.value = rows
  } catch (e) {
    error.value = e?.message || 'Error al buscar usuarios.'
  }
}

async function addMiembro(usuario) {
  if (!selectedCohorte.value) return
  try {
    await agregarMiembro(selectedCohorte.value.id, usuario.id)
    miembros.value = await listarMiembros(selectedCohorte.value.id)
  } catch (e) {
    error.value = e?.message || 'Error al agregar miembro.'
  }
}

async function removeMiembro(usuarioId) {
  if (!selectedCohorte.value) return
  try {
    await quitarMiembro(selectedCohorte.value.id, usuarioId)
    miembros.value = await listarMiembros(selectedCohorte.value.id)
  } catch (e) {
    error.value = e?.message || 'Error al quitar miembro.'
  }
}

watch(cursoId, cargarCohortes)
onMounted(cargarCursos)
</script>

<template>
  <div class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">
          Gesti&oacute;n
        </p>
        <h1
          class="display"
          :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
        >
          Cohortes
        </h1>
      </div>
      <button
        v-if="cursoId && !showForm"
        type="button"
        class="btn btn-secondary btn-sm"
        @click="onNueva"
      >
        + Nuevo cohorte
      </button>
    </div>

    <div
      class="field"
      :style="{ maxWidth: '400px', marginBottom: 'calc(var(--unit) * 3)' }"
    >
      <label>Curso</label>
      <select v-model="cursoId">
        <option value="">
          Selecciona un curso
        </option>
        <option
          v-for="c in cursos"
          :key="c.id"
          :value="c.id"
        >
          {{ c.titulo }}
        </option>
      </select>
    </div>

    <p
      v-if="error"
      class="mono"
      :style="{ color: 'var(--primary)', marginBottom: 'calc(var(--unit) * 2)' }"
    >
      &#9888; {{ error }}
    </p>

    <div
      v-if="showForm"
      class="card"
      :style="{ maxWidth: '640px', marginBottom: 'calc(var(--unit) * 3)' }"
    >
      <h3>{{ editing ? 'Editar cohorte' : 'Nuevo cohorte' }}</h3>
      <div class="field">
        <label>Nombre</label>
        <input
          v-model="form.nombre"
          type="text"
        >
      </div>
      <div class="field">
        <label>Descripci&oacute;n</label>
        <textarea
          v-model="form.descripcion"
          rows="2"
        />
      </div>
      <div class="field">
        <label>Cupo m&aacute;ximo</label>
        <input
          v-model.number="form.cupo_max"
          type="number"
        >
      </div>
      <div
        class="field-row"
        :style="{ display: 'flex', gap: 'calc(var(--unit) * 2)' }"
      >
        <div
          class="field"
          style="flex: 1"
        >
          <label>Fecha inicio</label>
          <input
            v-model="form.fecha_inicio"
            type="date"
          >
        </div>
        <div
          class="field"
          style="flex: 1"
        >
          <label>Fecha fin</label>
          <input
            v-model="form.fecha_fin"
            type="date"
          >
        </div>
      </div>
      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          @click="onGuardar"
        >
          Guardar
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          @click="showForm = false"
        >
          Cancelar
        </button>
      </div>
    </div>

    <div
      v-else-if="cursoId"
      class="layout-cols"
      :style="{
        display: 'grid',
        gridTemplateColumns: selectedCohorte ? '1fr 1fr' : '1fr',
        gap: 'calc(var(--unit) * 2)',
      }"
    >
      <div
        class="card"
        :style="{ overflow: 'auto' }"
      >
        <table class="admin-table admin-table-full">
          <thead>
            <tr>
              <th class="mono">
                Nombre
              </th>
              <th class="mono">
                Miembros
              </th>
              <th class="mono">
                Cupo
              </th>
              <th class="mono" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in cohortes"
              :key="c.id"
              :class="{ active: selectedCohorte?.id === c.id }"
              @click="verMiembros(c)"
            >
              <td>{{ c.nombre }}</td>
              <td>-</td>
              <td>{{ c.cupo_max ?? '—' }}</td>
              <td :style="{ textAlign: 'right' }">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  @click.stop="onEditar(c)"
                >
                  Editar
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :style="{ color: 'var(--primary)' }"
                  @click.stop="onEliminar(c.id)"
                >
                  Eliminar
                </button>
              </td>
            </tr>
            <tr v-if="cohortes.length === 0 && !loading">
              <td
                colspan="4"
                class="mono"
                :style="{ color: 'var(--ink-3)', textAlign: 'center', padding: '24px' }"
              >
                No hay cohortes.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="selectedCohorte"
        class="card"
      >
        <h4>{{ selectedCohorte.nombre }} — Miembros</h4>
        <div
          class="field"
          :style="{ display: 'flex', gap: 'calc(var(--unit) * 1)' }"
        >
          <input
            v-model="usuarioSearch"
            type="text"
            placeholder="Buscar usuario..."
            @keyup.enter="buscarUsuarios"
          >
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            @click="buscarUsuarios"
          >
            Buscar
          </button>
        </div>
        <ul
          v-if="usuarios.length"
          class="user-suggestions"
        >
          <li
            v-for="u in usuarios"
            :key="u.id"
          >
            {{ u.nombres }} {{ u.apellido_paterno }} ({{ u.email }})
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              @click="addMiembro(u)"
            >
              Agregar
            </button>
          </li>
        </ul>
        <table class="admin-table admin-table-full">
          <tbody>
            <tr
              v-for="m in miembros"
              :key="m.id"
            >
              <td>{{ m.usuario?.nombres }} {{ m.usuario?.apellido_paterno }}</td>
              <td
                class="mono"
                :style="{ textTransform: 'capitalize' }"
              >
                {{ m.rol }}
              </td>
              <td :style="{ textAlign: 'right' }">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  :style="{ color: 'var(--primary)' }"
                  @click="removeMiembro(m.usuario_id)"
                >
                  Quitar
                </button>
              </td>
            </tr>
            <tr v-if="miembros.length === 0">
              <td
                colspan="3"
                class="mono"
                :style="{ color: 'var(--ink-3)', textAlign: 'center', padding: '16px' }"
              >
                Sin miembros.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout-cols {
  align-items: start;
}
.actions {
  display: flex;
  gap: calc(var(--unit) * 1);
  margin-top: calc(var(--unit) * 1);
}
.user-suggestions {
  list-style: none;
  padding: 0;
  margin: 0 0 calc(var(--unit) * 2);
  border: 1px solid var(--line);
  border-radius: 6px;
  max-height: 160px;
  overflow: auto;
}
.user-suggestions li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(var(--unit) * 1);
  border-bottom: 1px solid var(--line);
}
.user-suggestions li:last-child {
  border-bottom: none;
}
tr.active td {
  background: rgba(46, 125, 50, 0.06);
}
</style>
