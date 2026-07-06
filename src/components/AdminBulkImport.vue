<script setup>
import { ref } from 'vue'
import { useCsvImport } from '@/composables/useCsvImport.js'
import { bulkInviteUsers } from '@/services/bulkImport.js'

const emit = defineEmits(['done'])

const fileInput = ref(null)
const loading = ref(false)
const result = ref(null)
const error = ref('')

const { rows, errors, validRows, invalidRows, parse, reset } = useCsvImport()

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => parse(ev.target.result)
  reader.readAsText(file)
}

function onDrop(e) {
  e.preventDefault()
  const file = e.dataTransfer.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => parse(ev.target.result)
  reader.readAsText(file)
}

async function onImport() {
  if (validRows.value.length === 0) return
  loading.value = true
  error.value = ''
  result.value = null

  const users = validRows.value.map((r) => ({
    email: r.data.email,
    nombres: r.data.nombres || r.data.nombre || '',
    apellido_paterno: r.data.apellido_paterno || r.data.apellido_p || '',
    apellido_materno: r.data.apellido_materno || r.data.apellido_m || '',
    telefono: r.data.telefono || '',
    dependencia_id: r.data.dependencia_id || null,
    cargo: r.data.cargo || '',
  }))

  try {
    result.value = await bulkInviteUsers(users)
    emit('done')
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    loading.value = false
  }
}

function onClear() {
  reset()
  result.value = null
  error.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <div class="bulk-import">
    <h3>Importación masiva de usuarios</h3>
    <p class="eyebrow">
      CSV con columnas: nombre, email, apellido_paterno, apellido_materno, telefono, cargo
    </p>

    <div
      v-if="rows.length === 0"
      class="dropzone"
      @dragover.prevent
      @drop="onDrop"
      @click="fileInput?.click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".csv"
        style="display: none"
        @change="onFileChange"
      />
      <p>Arrastra un archivo CSV aquí o haz clic para seleccionar</p>
    </div>

    <div v-else>
      <div class="preview-header">
        <span>{{ validRows.length }} válidas · {{ invalidRows.length }} con errores</span>
        <button type="button" class="btn btn-ghost btn-sm" @click="onClear">Limpiar</button>
      </div>

      <div v-if="errors.length" class="alert alert-warn">
        <p v-for="(err, i) in errors" :key="i">
          {{ err }}
        </p>
      </div>

      <table class="admin-table">
        <thead>
          <tr>
            <th>Línea</th>
            <th>Nombre</th>
            <th>Email</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows.slice(0, 10)" :key="r.line" :class="{ 'is-error': !r.valid }">
            <td>{{ r.line }}</td>
            <td>{{ r.data.nombre }}</td>
            <td>{{ r.data.email }}</td>
            <td>
              <span v-if="r.valid">OK</span>
              <span v-else :title="r.errors.join(', ')">Error: {{ r.errors.join(', ') }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="rows.length > 10" class="eyebrow">… y {{ rows.length - 10 }} filas más</p>

      <div class="actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="validRows.length === 0 || loading"
          @click="onImport"
        >
          {{ loading ? 'Importando…' : `Importar ${validRows.length} usuarios` }}
        </button>
      </div>

      <div v-if="error" class="alert alert-error">
        {{ error }}
      </div>

      <div v-if="result?.results" class="alert alert-ok">
        <p>
          {{ result.results.filter((r) => r.status === 'ok').length }} éxitos ·
          {{ result.results.filter((r) => r.status === 'error').length }} errores
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bulk-import {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.dropzone {
  border: 2px dashed var(--line);
  border-radius: 8px;
  padding: calc(var(--unit) * 4);
  text-align: center;
  cursor: pointer;
  color: var(--ink-3);
  transition: border-color 0.15s;
}
.dropzone:hover {
  border-color: var(--primary);
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.admin-table .is-error td {
  color: var(--brand-primary);
}
.actions {
  display: flex;
  gap: calc(var(--unit) * 1);
}
.alert {
  padding: calc(var(--unit) * 1.5);
  border-radius: 6px;
  font-size: 13px;
}
.alert-warn {
  background: rgba(234, 179, 8, 0.08);
  color: #a16207;
}
.alert-error {
  background: rgba(239, 68, 68, 0.08);
  color: var(--brand-primary);
}
.alert-ok {
  background: rgba(34, 197, 94, 0.08);
  color: var(--brand-secondary, #2e7d32);
}
</style>
