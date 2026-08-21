<script setup>
import { ref, watch, defineAsyncComponent } from 'vue'

// Carga diferida, y no por elegancia: App.vue monta este componente siempre,
// así que un import estático encadenaba App → DocumentoContenido →
// LessonRichTextEditor → Tiptap, y metía 112 kB de editor en la descarga
// inicial de cualquiera que abriera la portada. Lo detectó
// scripts/check-bundle.js. El diálogo solo se muestra a quien tiene el
// consentimiento pendiente, así que el editor solo se descarga entonces.
const DocumentoContenido = defineAsyncComponent(() => import('@/components/DocumentoContenido.vue'))
import {
  SLUGS,
  getVigente,
  requiereReaceptacion,
  aceptarAviso,
} from '@/services/documentosInstitucionales.js'

// Se muestra cuando se publicó una versión del aviso marcada como «exige
// volver a aceptar» posterior a la que esta persona aceptó.
//
// NO bloquea el acceso a propósito: quien no acepta conserva registrada su
// versión anterior y puede seguir usando la plataforma. Bloquear convertiría
// la aceptación en un trámite forzado, y un consentimiento arrancado así vale
// menos como consentimiento.
const props = defineProps({
  session: { type: Object, default: null },
})

const visible = ref(false)
const documento = ref(null)
const enviando = ref(false)
const error = ref(null)
const pospuesto = ref(false)

async function comprobar() {
  if (!props.session?.user || pospuesto.value) {
    visible.value = false
    return
  }
  try {
    if (!(await requiereReaceptacion())) {
      visible.value = false
      return
    }
    documento.value = await getVigente(SLUGS.AVISO)
    visible.value = !!documento.value
  } catch {
    // Un fallo al comprobar no debe entrometerse en el uso normal.
    visible.value = false
  }
}

async function aceptar() {
  enviando.value = true
  error.value = null
  try {
    await aceptarAviso()
    visible.value = false
  } catch (e) {
    error.value = e?.message || 'No se pudo registrar tu aceptación.'
  } finally {
    enviando.value = false
  }
}

function despues() {
  // Se recuerda solo en esta sesión de navegación: la próxima vez se vuelve a
  // pedir, porque la obligación sigue ahí.
  pospuesto.value = true
  visible.value = false
}

watch(() => props.session?.user?.id, comprobar, { immediate: true })
</script>

<template>
  <div
    v-if="visible"
    class="reaceptacion"
    role="dialog"
    aria-modal="true"
    aria-labelledby="reaceptacion-titulo"
    data-test="aviso-reaceptacion"
  >
    <div class="reaceptacion-panel">
      <h2 id="reaceptacion-titulo">El aviso de privacidad cambió</h2>
      <p :style="{ color: 'var(--ink-2)' }">
        Se publicó una versión nueva (versión {{ documento?.version }}) y necesitamos que la
        revises. Puedes seguir usando la plataforma mientras tanto.
      </p>

      <div class="reaceptacion-texto">
        <DocumentoContenido :contenido="documento?.contenido" />
      </div>

      <p v-if="error" class="reaceptacion-error" data-test="reaceptacion-error">
        {{ error }}
      </p>

      <div class="reaceptacion-acciones">
        <button class="btn btn-ghost btn-sm" data-test="reaceptacion-despues" @click="despues">
          Más tarde
        </button>
        <button
          class="btn btn-sm"
          :disabled="enviando"
          data-test="reaceptacion-aceptar"
          @click="aceptar"
        >
          He leído y acepto
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reaceptacion {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 55%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--unit) * 2);
  z-index: 1000;
}
.reaceptacion-panel {
  background: var(--paper);
  border-radius: 12px;
  padding: calc(var(--unit) * 3);
  max-width: 720px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
}
.reaceptacion-texto {
  margin: calc(var(--unit) * 2) 0;
  padding: calc(var(--unit) * 2);
  border: 1px solid var(--line);
  border-radius: 8px;
  max-height: 45vh;
  overflow-y: auto;
}
.reaceptacion-error {
  color: var(--danger);
}
.reaceptacion-acciones {
  display: flex;
  gap: calc(var(--unit) * 2);
  justify-content: flex-end;
}
</style>
