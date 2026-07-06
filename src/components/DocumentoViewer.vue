<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { getDocumentoUrl } from '@/services/documentos.js'

const props = defineProps({
  leccionId: { type: String, required: true },
})
const emit = defineEmits(['fin-de-lectura'])

// Tiempo mínimo de visualización de un PDF en segundos antes de
// habilitar el botón "Marcar como leída". El viewer nativo del browser
// scrollea internamente (sandbox de iframe) y no expone scroll events,
// así que en lugar de adivinar por scroll usamos un timer.
const PDF_MIN_VIEW_SECONDS = 10

const signedUrl = ref(null) // URL del Edge Function (firmada)
const blobUrl = ref(null) // blob:… local — bypasea X-Frame-Options
const docTipo = ref(null)
const error = ref('')
const llegoAlFinal = ref(false)

const containerEl = ref(null)
const sentinelEl = ref(null)
let observer = null
let pdfTimer = null

// Hash fragment con preferencias del viewer nativo Chrome/Edge.
const pdfSrc = computed(() => {
  if (!blobUrl.value) return ''
  return `${blobUrl.value}#view=FitH&toolbar=1&navpanes=0`
})

function revokeBlob() {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = null
  }
}

async function loadDoc() {
  error.value = ''
  signedUrl.value = null
  docTipo.value = null
  revokeBlob()
  try {
    const data = await getDocumentoUrl(props.leccionId)
    signedUrl.value = data.signed_url
    docTipo.value = data.documento_tipo
    // Para PDFs, descargar como blob para servirlo en iframe same-origin
    // (Supabase Storage manda X-Frame-Options: SAMEORIGIN que bloquea
    // el embed cross-origin). Para imágenes, <img> no tiene ese problema.
    if (docTipo.value === 'pdf') {
      const res = await fetch(signedUrl.value)
      if (!res.ok) throw new Error(`pdf fetch ${res.status}`)
      const raw = await res.blob()
      // Storage a veces sirve el objeto como application/octet-stream
      // (el contentType no siempre se preserva al subir vía tus). Un blob
      // octet-stream embebido en <iframe> FUERZA descarga en lugar de
      // renderizar. Forzamos el MIME a application/pdf para que el viewer
      // nativo lo despliegue en pantalla.
      const blob =
        raw.type === 'application/pdf' ? raw : new Blob([raw], { type: 'application/pdf' })
      blobUrl.value = URL.createObjectURL(blob)
    }
  } catch (e) {
    error.value = String(e.message || e)
  }
}

function clearPdfTimer() {
  if (pdfTimer) {
    clearTimeout(pdfTimer)
    pdfTimer = null
  }
}

function markRead() {
  if (llegoAlFinal.value) return
  llegoAlFinal.value = true
  emit('fin-de-lectura')
}

function setupObserver() {
  // IntersectionObserver para imágenes (scroll vive en el contenedor).
  if (observer) observer.disconnect()
  if (!sentinelEl.value || docTipo.value !== 'imagen') return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) markRead()
    },
    { root: containerEl.value, threshold: 0.5 }
  )
  observer.observe(sentinelEl.value)
}

function setupPdfTimer() {
  clearPdfTimer()
  if (docTipo.value !== 'pdf') return
  pdfTimer = setTimeout(markRead, PDF_MIN_VIEW_SECONDS * 1000)
}

function onLoaded() {
  // Disparado tras cargar la URL y conocer el tipo.
  setTimeout(() => {
    if (docTipo.value === 'pdf') setupPdfTimer()
    else if (docTipo.value === 'imagen') setupObserver()
  }, 100)
}

onMounted(() => {
  loadDoc().then(onLoaded)
})

onBeforeUnmount(() => {
  if (observer) observer.disconnect()
  clearPdfTimer()
  revokeBlob()
})

watch(
  () => props.leccionId,
  () => {
    llegoAlFinal.value = false
    if (observer) observer.disconnect()
    clearPdfTimer()
    revokeBlob()
    loadDoc().then(onLoaded)
  }
)
</script>

<template>
  <div
    ref="containerEl"
    class="doc-viewer"
  >
    <div
      v-if="error"
      class="doc-error"
    >
      No se pudo cargar: {{ error }}
    </div>

    <!-- PDF cargado como blob: URL.createObjectURL del Blob bajado por
         fetch. Resuelve dos cosas a la vez:
         (a) Supabase Storage manda X-Frame-Options: SAMEORIGIN que
             rechaza iframes cross-origin (api.aprendo.mx ≠ frontend).
         (b) <object> caía en CSP object-src en producción.
         La blob URL es same-origin con el frontend y X-Frame-Options
         no aplica. -->
    <iframe
      v-else-if="docTipo === 'pdf' && blobUrl"
      :src="pdfSrc"
      class="doc-pdf"
      title="Documento de la lección"
      loading="lazy"
    />

    <img
      v-else-if="docTipo === 'imagen' && signedUrl"
      :src="signedUrl"
      alt="documento de lección"
      class="doc-img"
    >

    <div
      v-if="signedUrl && docTipo === 'pdf'"
      class="doc-fallback"
    >
      Si el documento no se muestra,
      <a
        :href="signedUrl"
        target="_blank"
        rel="noopener"
      >ábrelo en otra pestaña</a>.
    </div>

    <div
      ref="sentinelEl"
      class="doc-sentinel"
    />
  </div>
</template>

<style scoped>
.doc-viewer {
  position: relative;
  height: 100%;
  width: 100%;
  overflow-y: auto;
  background: #1a1a1a;
}
.doc-pdf {
  width: 100%;
  height: 100%;
  min-height: 80vh;
  display: block;
  border: 0;
  background: #ffffff;
}
.doc-img {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: block;
}
.doc-error {
  padding: 24px;
  color: #ff8080;
  text-align: center;
  font-family: monospace;
}
.doc-fallback {
  padding: 8px 16px;
  font-size: 12px;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.4);
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1;
}
.doc-fallback a {
  color: var(--brand-accent-soft, #e6d194);
  text-decoration: underline;
}
.doc-sentinel {
  height: 1px;
  width: 100%;
}
</style>
