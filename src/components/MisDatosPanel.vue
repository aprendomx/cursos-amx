<script setup>
import { ref } from 'vue'
import { useErrorHandler } from '@/composables/useErrorHandler'
import {
  exportarMisDatos,
  eliminarMisDatos,
  descargarJson,
  CONFIRMACION_BAJA,
} from '@/services/datosPersonales.js'

const emit = defineEmits(['baja'])

// useErrorHandler traduce los errores crudos de Postgres a mensajes que una
// persona puede accionar (ver mapSupabaseError en src/lib/errors.ts).
const { error: errorApp, run } = useErrorHandler()

const exportando = ref(false)
const error = ref('')
const aviso = ref('')

const mostrarBaja = ref(false)
const confirmacion = ref('')
const eliminando = ref(false)

async function descargar() {
  exportando.value = true
  error.value = ''
  aviso.value = ''
  const datos = await run(() => exportarMisDatos())
  if (errorApp.value) {
    error.value = errorApp.value.message || 'No se pudieron obtener tus datos.'
  } else {
    const fecha = new Date().toISOString().slice(0, 10)
    descargarJson(datos, `mis-datos-${fecha}.json`)
    aviso.value = 'Descarga iniciada.'
  }
  exportando.value = false
}

function cancelarBaja() {
  mostrarBaja.value = false
  confirmacion.value = ''
}

async function eliminar() {
  eliminando.value = true
  error.value = ''
  aviso.value = ''
  const res = await run(() => eliminarMisDatos(confirmacion.value))
  if (errorApp.value) {
    error.value = errorApp.value.message || 'No se pudo completar la baja.'
  } else {
    aviso.value = res?.mensaje || 'Tus datos fueron eliminados.'
    mostrarBaja.value = false
    confirmacion.value = ''
    emit('baja', res)
  }
  eliminando.value = false
}
</script>

<template>
  <section class="mis-datos">
    <h3>Mis datos personales</h3>
    <p class="mis-datos-intro">
      Puedes obtener una copia de todo lo que guardamos sobre ti, o pedir que lo eliminemos.
      Consulta el aviso de privacidad para conocer los plazos y el canal de atención.
    </p>

    <p v-if="error" class="mis-datos-error" role="alert">
      {{ error }}
    </p>
    <p v-if="aviso" class="mis-datos-aviso" role="status">
      {{ aviso }}
    </p>

    <div class="mis-datos-acciones">
      <button class="btn btn-ghost btn-sm" type="button" :disabled="exportando" @click="descargar">
        {{ exportando ? 'Preparando…' : 'Descargar mis datos (JSON)' }}
      </button>

      <button
        v-if="!mostrarBaja"
        class="btn btn-ghost btn-sm mis-datos-peligro"
        type="button"
        @click="mostrarBaja = true"
      >
        Eliminar mis datos
      </button>
    </div>

    <div v-if="mostrarBaja" class="mis-datos-baja">
      <h4>Eliminar mis datos</h4>
      <p>
        Se borrará tu avance, tu tiempo de estudio, tus comentarios y tus mensajes, y tu perfil
        quedará anonimizado. <strong>Es irreversible.</strong>
      </p>
      <p>
        Las constancias que ya te hayamos emitido <strong>se conservan</strong>, para que sus folios
        sigan siendo verificables por quien las reciba; el nombre asociado queda anonimizado.
      </p>

      <label for="confirmacion-baja">
        Para continuar, escribe <code>{{ CONFIRMACION_BAJA }}</code
        >:
      </label>
      <input id="confirmacion-baja" v-model="confirmacion" type="text" autocomplete="off" />

      <div class="mis-datos-acciones">
        <button class="btn btn-ghost btn-sm" type="button" @click="cancelarBaja">Cancelar</button>
        <button
          class="btn btn-sm mis-datos-peligro"
          type="button"
          :disabled="confirmacion !== CONFIRMACION_BAJA || eliminando"
          @click="eliminar"
        >
          {{ eliminando ? 'Eliminando…' : 'Eliminar definitivamente' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mis-datos {
  border-top: 1px solid var(--border, #ddd);
  padding-top: 1.5rem;
  margin-top: 2rem;
}

.mis-datos-intro {
  color: var(--muted, #555);
  max-width: 60ch;
}

.mis-datos-acciones {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.mis-datos-peligro {
  color: #b00020;
  border-color: currentColor;
}

.mis-datos-baja {
  border: 1px solid #b00020;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-top: 1rem;
  max-width: 48rem;
}

.mis-datos-baja label {
  display: block;
  margin-top: 1rem;
  margin-bottom: 0.25rem;
}

.mis-datos-baja input {
  width: 100%;
  max-width: 24rem;
}

.mis-datos-error {
  color: #b00020;
}

.mis-datos-aviso {
  color: var(--brand-secondary, #0f766e);
}
</style>
