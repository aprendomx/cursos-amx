<script setup>
import { ref, onMounted } from 'vue'
import {
  listarFuncionarios,
  guardarFuncionario,
  darDeBajaFuncionario,
  subirFirma,
  urlFirma,
} from '@/services/constanciaDisenos.js'

const funcionarios = ref([])
const cargando = ref(true)
const error = ref('')
const aviso = ref('')
const guardando = ref(false)
const editando = ref(null)

function nuevo() {
  editando.value = { nombre: '', cargo: '', firma_path: null, activo: true }
}

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    funcionarios.value = await listarFuncionarios()
  } catch (e) {
    error.value = e?.message || 'No se pudieron cargar los funcionarios.'
  } finally {
    cargando.value = false
  }
}

async function onFirma(evento) {
  const archivo = evento.target.files?.[0]
  if (!archivo || !editando.value) return
  guardando.value = true
  error.value = ''
  try {
    editando.value.firma_path = await subirFirma(archivo)
    aviso.value = 'Firma cargada. Recuerda guardar.'
  } catch (e) {
    error.value = e?.message || 'No se pudo subir la firma.'
  } finally {
    guardando.value = false
  }
}

async function guardar() {
  if (!editando.value?.nombre?.trim() || !editando.value?.cargo?.trim()) {
    error.value = 'El nombre y el cargo son obligatorios: se imprimen en la constancia.'
    return
  }
  guardando.value = true
  error.value = ''
  try {
    await guardarFuncionario(editando.value)
    editando.value = null
    aviso.value = 'Guardado.'
    await cargar()
  } catch (e) {
    error.value = e?.message || 'No se pudo guardar.'
  } finally {
    guardando.value = false
  }
}

async function darDeBaja(f) {
  error.value = ''
  try {
    await darDeBajaFuncionario(f.id)
    aviso.value = `${f.nombre} ya no aparecerá para asignar. Las constancias emitidas no cambian.`
    await cargar()
  } catch (e) {
    error.value = e?.message || 'No se pudo dar de baja.'
  }
}

onMounted(cargar)
</script>

<template>
  <section class="adm-func">
    <header>
      <h2>Funcionarios que firman</h2>
      <p class="adm-func-intro">
        Nombre y cargo se imprimen en la constancia. Al emitirse, cada constancia
        <strong>guarda su propia copia</strong>: si después alguien cambia de cargo o se da de baja,
        los documentos ya expedidos no se alteran.
      </p>
    </header>

    <p v-if="error" class="adm-func-error" role="alert">
      {{ error }}
    </p>
    <p v-if="aviso" class="adm-func-aviso" role="status">
      {{ aviso }}
    </p>

    <button v-if="!editando" class="btn btn-primary btn-sm" type="button" @click="nuevo">
      Agregar funcionario
    </button>

    <div v-if="editando" class="adm-func-form">
      <label :for="`f-nombre`">Nombre completo</label>
      <input id="f-nombre" v-model="editando.nombre" type="text" autocomplete="off" />

      <label :for="`f-cargo`">Cargo</label>
      <input id="f-cargo" v-model="editando.cargo" type="text" autocomplete="off" />

      <label :for="`f-firma`">Firma escaneada</label>
      <input
        id="f-firma"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        :disabled="guardando"
        @change="onFirma"
      />
      <img
        v-if="editando.firma_path"
        :src="urlFirma(editando.firma_path)"
        alt="Vista previa de la firma"
        class="adm-func-firma-preview"
      />
      <p class="adm-func-hint">
        Conviene un PNG con fondo transparente: sobre el papel de la constancia, un fondo blanco se
        recorta como un rectángulo visible.
      </p>

      <div class="adm-func-acciones">
        <button class="btn btn-ghost btn-sm" type="button" @click="editando = null">
          Cancelar
        </button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="guardando" @click="guardar">
          {{ guardando ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </div>

    <p v-if="cargando">Cargando…</p>
    <table v-else-if="funcionarios.length" class="adm-func-tabla">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Cargo</th>
          <th>Firma</th>
          <th>Estado</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in funcionarios" :key="f.id" :class="{ 'es-baja': !f.activo }">
          <td>{{ f.nombre }}</td>
          <td>{{ f.cargo }}</td>
          <td>
            <img
              v-if="f.firma_path"
              :src="urlFirma(f.firma_path)"
              :alt="`Firma de ${f.nombre}`"
              class="adm-func-firma-mini"
            />
            <span v-else class="adm-func-sinfirma">sin firma</span>
          </td>
          <td>{{ f.activo ? 'Activo' : 'Baja' }}</td>
          <td class="adm-func-fila-acciones">
            <button class="btn btn-ghost btn-sm" type="button" @click="editando = { ...f }">
              Editar
            </button>
            <button
              v-if="f.activo"
              class="btn btn-ghost btn-sm"
              type="button"
              @click="darDeBaja(f)"
            >
              Dar de baja
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else>
      Todavía no hay funcionarios. Agrega al menos uno para que las constancias lleven firma.
    </p>
  </section>
</template>

<style scoped>
.adm-func-intro {
  color: var(--muted, #555);
  max-width: 62ch;
  margin-bottom: 1rem;
}
.adm-func-form {
  border: 1px solid var(--border, #ddd);
  border-radius: 0.5rem;
  padding: 1rem;
  margin: 1rem 0;
  max-width: 34rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.adm-func-form label {
  margin-top: 0.5rem;
  font-weight: 500;
}
.adm-func-hint {
  color: var(--muted, #666);
  font-size: 0.85em;
}
.adm-func-acciones {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}
.adm-func-tabla {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
.adm-func-tabla th,
.adm-func-tabla td {
  text-align: left;
  padding: 0.5rem;
  border-bottom: 1px solid var(--border-soft, #eee);
}
.adm-func-tabla tr.es-baja {
  opacity: 0.55;
}
.adm-func-firma-preview {
  max-height: 5rem;
  margin: 0.5rem 0;
  background: #fff;
}
.adm-func-firma-mini {
  max-height: 2rem;
  background: #fff;
}
.adm-func-sinfirma {
  color: var(--muted, #888);
  font-size: 0.85em;
}
.adm-func-fila-acciones {
  display: flex;
  gap: 0.35rem;
}
.adm-func-error {
  color: #b00020;
}
.adm-func-aviso {
  color: var(--brand-secondary, #0f766e);
}
</style>
