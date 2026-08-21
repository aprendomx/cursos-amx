<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DocumentoContenido from '@/components/DocumentoContenido.vue'
import { getVigente, tituloDe } from '@/services/documentosInstitucionales.js'

// Página pública de un documento institucional. Accesible SIN sesión a
// propósito: quien todavía no se registra necesita leer el aviso antes de
// aceptarlo.
const props = defineProps({
  slug: { type: String, required: true },
})

const router = useRouter()
const cargando = ref(true)
const errorCarga = ref(false)
const documento = ref(null)

const titulo = computed(() => tituloDe(props.slug))
const publicado = computed(() => {
  const fecha = documento.value?.publicado_en
  if (!fecha) return ''
  return new Date(fecha).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})

async function cargar() {
  cargando.value = true
  errorCarga.value = false
  documento.value = null
  try {
    documento.value = await getVigente(props.slug)
  } catch {
    errorCarga.value = true
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)
watch(() => props.slug, cargar)

function irAlInicio() {
  router.push('/')
}
</script>

<template>
  <div class="documento-page">
    <header class="documento-header container">
      <button class="btn btn-ghost btn-sm" @click="irAlInicio">&larr; Inicio</button>
      <h1 class="documento-titulo">
        {{ titulo }}
      </h1>
    </header>

    <main class="documento-main container">
      <div v-if="cargando" class="documento-estado" data-test="documento-cargando">
        <span class="mono" :style="{ color: 'var(--ink-3)' }">Cargando&hellip;</span>
      </div>

      <div v-else-if="errorCarga" class="documento-estado" data-test="documento-error">
        <p class="eyebrow" :style="{ color: 'var(--danger)' }">Error de conexión</p>
        <p :style="{ marginTop: '8px', color: 'var(--ink-2)' }">
          No se pudo cargar el documento. Revisa tu conexión e inténtalo de nuevo.
        </p>
      </div>

      <!-- Sin versión vigente NO se muestra el borrador: lo que no se ha
           publicado no es el documento de la institución. -->
      <div v-else-if="!documento" class="documento-estado" data-test="documento-sin-publicar">
        <p class="eyebrow" :style="{ color: 'var(--ink-3)' }">Sin publicar</p>
        <p :style="{ marginTop: '8px', color: 'var(--ink-2)' }">
          Esta instalación todavía no ha publicado su {{ titulo.toLowerCase() }}.
        </p>
      </div>

      <article v-else>
        <DocumentoContenido :contenido="documento.contenido" />

        <!-- La versión y su fecha son lo que da valor probatorio a la página:
             permiten comprobar qué decía el documento en un momento dado. -->
        <footer class="documento-pie" data-test="documento-pie">
          <span class="mono">Versión {{ documento.version }}</span>
          <span v-if="publicado" class="mono">Publicada el {{ publicado }}</span>
        </footer>
      </article>
    </main>
  </div>
</template>

<style scoped>
.documento-page {
  min-height: 100vh;
  background: var(--paper);
}
.documento-header {
  padding: calc(var(--unit) * 3) 0 0;
}
.documento-titulo {
  font-family: var(--display);
  color: var(--ink);
  margin: calc(var(--unit) * 2) 0 0;
}
.documento-main {
  padding: calc(var(--unit) * 2) 0 calc(var(--unit) * 8);
}
.documento-estado {
  padding: calc(var(--unit) * 6) 0;
}
.documento-pie {
  margin-top: calc(var(--unit) * 5);
  padding-top: calc(var(--unit) * 2);
  border-top: 1px solid var(--line);
  display: flex;
  gap: calc(var(--unit) * 3);
  flex-wrap: wrap;
  color: var(--ink-3);
  font-size: 0.875rem;
}
</style>
