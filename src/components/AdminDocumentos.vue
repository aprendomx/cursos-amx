<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import DocumentoContenido from '@/components/DocumentoContenido.vue'
import {
  DOCUMENTOS,
  SLUGS,
  getVigente,
  getBorrador,
  getHistorial,
  guardarBorrador,
  publicar,
  estadoConsentimiento,
  estaVacio,
} from '@/services/documentosInstitucionales.js'

// El editor va por importación asíncrona: arrastra Tiptap y no tiene por qué
// cargarse al abrir cualquier otra sección del panel.
const LessonRichTextEditor = defineAsyncComponent(
  () => import('@/components/LessonRichTextEditor.vue')
)

const slugActivo = ref(SLUGS.AVISO)
const borrador = ref(null)
const vigente = ref(null)
const historial = ref([])
const consentimiento = ref(null)
const cargando = ref(true)
const guardando = ref(false)
const mensaje = ref(null)
const verHistorial = ref(false)
const versionAbierta = ref(null)
const exigeReaceptacion = ref(false)

const docActivo = computed(() => DOCUMENTOS.find((d) => d.slug === slugActivo.value))
const esAviso = computed(() => slugActivo.value === SLUGS.AVISO)
const hayCambiosSinPublicar = computed(
  () => !!borrador.value && !estaVacio(borrador.value.contenido)
)

function estadoDe(doc) {
  if (doc.slug !== slugActivo.value) return ''
  if (!vigente.value) return 'sin publicar'
  return borrador.value ? 'publicado · borrador pendiente' : 'publicado'
}

async function cargar() {
  cargando.value = true
  mensaje.value = null
  try {
    const [v, b, h] = await Promise.all([
      getVigente(slugActivo.value),
      getBorrador(slugActivo.value),
      getHistorial(slugActivo.value),
    ])
    vigente.value = v
    borrador.value = b
    historial.value = h
    if (esAviso.value) consentimiento.value = await estadoConsentimiento()
  } catch (e) {
    mensaje.value = { tipo: 'error', texto: e?.message || 'No se pudo cargar el documento.' }
  } finally {
    cargando.value = false
  }
}

function cambiarDocumento(slug) {
  slugActivo.value = slug
  verHistorial.value = false
  versionAbierta.value = null
  exigeReaceptacion.value = false
  cargar()
}

function alEditar(json) {
  borrador.value = { ...(borrador.value || {}), contenido: json }
}

async function onGuardar() {
  if (!borrador.value?.contenido) return
  guardando.value = true
  mensaje.value = null
  try {
    await guardarBorrador(slugActivo.value, borrador.value.contenido)
    // El mensaje se pone DESPUÉS de recargar: cargar() lo limpia al empezar,
    // así que ponerlo antes lo borraba de inmediato y nadie llegaba a verlo.
    await cargar()
    mensaje.value = {
      tipo: 'ok',
      texto: 'Borrador guardado. Lo que ven las personas no ha cambiado.',
    }
  } catch (e) {
    mensaje.value = { tipo: 'error', texto: e?.message || 'No se pudo guardar.' }
  } finally {
    guardando.value = false
  }
}

async function onPublicar() {
  const aviso = esAviso.value
    ? '\n\nSi marcaste que exige volver a aceptar, se le pedirá a todas las personas ya registradas.'
    : ''
  const seguro = window.confirm(
    `Publicar es irreversible: esta versión no se podrá modificar ni borrar.${aviso}\n\n¿Publicar «${docActivo.value.titulo}»?`
  )
  if (!seguro) return

  guardando.value = true
  mensaje.value = null
  try {
    const v = await publicar(slugActivo.value, { requiereReaceptacion: exigeReaceptacion.value })
    exigeReaceptacion.value = false
    await cargar()
    mensaje.value = { tipo: 'ok', texto: `Versión ${v} publicada.` }
  } catch (e) {
    mensaje.value = { tipo: 'error', texto: e?.message || 'No se pudo publicar.' }
  } finally {
    guardando.value = false
  }
}

function fecha(iso) {
  return iso ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : ''
}

onMounted(cargar)
</script>

<template>
  <section class="admin-documentos">
    <header class="ad-header">
      <h2>Documentos</h2>
      <p :style="{ color: 'var(--ink-2)' }">
        Aviso de privacidad, términos de uso y contacto. Publicar crea una versión nueva y conserva
        las anteriores.
      </p>
    </header>

    <nav class="ad-tabs">
      <button
        v-for="doc in DOCUMENTOS"
        :key="doc.slug"
        class="ad-tab"
        :class="{ active: doc.slug === slugActivo }"
        :data-test="`tab-${doc.slug}`"
        @click="cambiarDocumento(doc.slug)"
      >
        {{ doc.titulo }}
        <small v-if="estadoDe(doc)">{{ estadoDe(doc) }}</small>
      </button>
    </nav>

    <p v-if="mensaje" class="ad-mensaje" :class="mensaje.tipo" data-test="ad-mensaje">
      {{ mensaje.texto }}
    </p>

    <div v-if="cargando" class="mono" :style="{ color: 'var(--ink-3)' }">Cargando&hellip;</div>

    <template v-else>
      <!-- Estado del consentimiento: solo tiene sentido para el aviso. -->
      <div v-if="esAviso && consentimiento" class="ad-consentimiento" data-test="ad-consentimiento">
        <template v-if="consentimiento.vigente">
          <span
            ><strong>{{ consentimiento.alDia }}</strong> al día con la versión
            {{ consentimiento.vigente }}</span
          >
          <span
            ><strong>{{ consentimiento.pendientes }}</strong> pendientes de renovar</span
          >
        </template>
        <span v-else>Sin publicar: el registro de nuevas cuentas está bloqueado.</span>
      </div>

      <div class="ad-editor">
        <LessonRichTextEditor
          :model-value="borrador?.contenido || vigente?.contenido || null"
          data-test="ad-editor"
          @update:model-value="alEditar"
        />
      </div>

      <div class="ad-acciones">
        <button
          class="btn btn-ghost btn-sm"
          :disabled="guardando"
          data-test="ad-guardar"
          @click="onGuardar"
        >
          Guardar borrador
        </button>

        <label v-if="esAviso" class="ad-check">
          <input v-model="exigeReaceptacion" type="checkbox" data-test="ad-exige-reaceptacion" />
          <span>Esta versión exige volver a aceptar</span>
        </label>

        <button
          class="btn btn-sm"
          :disabled="guardando || !hayCambiosSinPublicar"
          data-test="ad-publicar"
          @click="onPublicar"
        >
          Publicar
        </button>
      </div>

      <!-- La vista previa usa el MISMO componente que la página pública: si
           fueran dos, lo previsualizado podría dejar de ser lo que se publica. -->
      <details class="ad-bloque">
        <summary>Vista previa</summary>
        <div class="ad-previa">
          <DocumentoContenido :contenido="borrador?.contenido || vigente?.contenido || null" />
        </div>
      </details>

      <details class="ad-bloque" :open="verHistorial" data-test="ad-historial">
        <summary>Historial ({{ historial.length }} publicadas)</summary>
        <ul class="ad-historial">
          <li v-for="h in historial" :key="h.version">
            <button
              class="ad-version"
              @click="versionAbierta = versionAbierta === h.version ? null : h.version"
            >
              Versión {{ h.version }} · {{ fecha(h.publicado_en) }}
              <span v-if="h.requiere_reaceptacion"> · exigió volver a aceptar</span>
            </button>
            <div v-if="versionAbierta === h.version" class="ad-previa">
              <DocumentoContenido :contenido="h.contenido" />
            </div>
          </li>
          <li v-if="!historial.length" :style="{ color: 'var(--ink-3)' }">
            Todavía no se ha publicado ninguna versión.
          </li>
        </ul>
      </details>
    </template>
  </section>
</template>

<style scoped>
.admin-documentos {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.ad-tabs {
  display: flex;
  gap: calc(var(--unit) * 1);
  flex-wrap: wrap;
}
.ad-tab {
  background: none;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: calc(var(--unit) * 1) calc(var(--unit) * 2);
  cursor: pointer;
  color: var(--ink-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.ad-tab.active {
  border-color: var(--primary);
  color: var(--ink);
}
.ad-tab small {
  color: var(--ink-3);
  font-size: 0.75rem;
}
.ad-mensaje {
  border-radius: 8px;
  padding: calc(var(--unit) * 1.5);
  border-left: 3px solid var(--line);
}
.ad-mensaje.ok {
  border-left-color: var(--primary);
  color: var(--ink-2);
}
.ad-mensaje.error {
  border-left-color: var(--danger);
  color: var(--danger);
}
.ad-consentimiento {
  display: flex;
  gap: calc(var(--unit) * 3);
  flex-wrap: wrap;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: calc(var(--unit) * 1.5);
}
.ad-acciones {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 2);
  flex-wrap: wrap;
}
.ad-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--ink-2);
}
.ad-bloque {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: calc(var(--unit) * 1.5);
}
.ad-previa {
  margin-top: calc(var(--unit) * 2);
  padding-top: calc(var(--unit) * 2);
  border-top: 1px solid var(--line);
}
.ad-historial {
  list-style: none;
  padding: 0;
  margin: calc(var(--unit) * 1) 0 0;
}
.ad-version {
  background: none;
  border: none;
  padding: calc(var(--unit) * 0.5) 0;
  color: var(--primary);
  cursor: pointer;
  text-align: left;
}
</style>
