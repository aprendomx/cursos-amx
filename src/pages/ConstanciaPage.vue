<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase.js'
import IconSet from '@/components/IconSet.vue'
import QrcodeVue from 'qrcode.vue'
import { getConstanciaConfig, CONSTANCIA_DEFAULTS } from '@/services/constanciaConfig.js'
import { configDeConstancia, aplicarMarcadores } from '@/lib/constanciaTextos.js'
import { urlFirma, urlAsset } from '@/services/constanciaDisenos.js'
import { theme } from '@/lib/theme.js'

const props = defineProps({
  cursoId: { type: String, required: true },
  session: { type: Object, default: null },
})

const router = useRouter()

const realConstancia = ref(null)
const settings = ref({ ...CONSTANCIA_DEFAULTS })
const cargando = ref(true)

// Una constancia SOLO se pinta si existe en la base. Antes, cuando no había
// fila real, esta página rellenaba con datos demo (CURSOS/USER de data.js) y
// un folio inventado terminado en «-4721», y seguía ofreciendo el botón de
// descarga: cualquiera podía bajarse un PDF con pinta de constancia
// institucional, a nombre de otra persona, con un QR que no verifica nada.
const hayConstancia = computed(() => !!realConstancia.value?.folio)

const folio = computed(() => realConstancia.value?.folio || '')

const fullName = computed(() => {
  const p = realConstancia.value?.perfiles
  if (!p) return ''
  return (
    p.nombres_completos ||
    `${p.nombres || ''} ${p.apellido_paterno || ''} ${p.apellido_materno || ''}`.trim()
  )
})

const cursoTitle = computed(() => realConstancia.value?.cursos?.titulo || '')

const cursoDuracion = computed(() => realConstancia.value?.cursos?.duracion || '')

// Configuración de la constancia. Se lee SIEMPRE de lo congelado en la fila:
// firmantes, diseño y textos se copiaron al emitirse (migración 070). El
// respaldo con `settings` solo cubre constancias emitidas antes de esa
// migración, que no tienen congelado.
const cfg = computed(() => configDeConstancia(realConstancia.value, settings.value))

const firmantes = computed(() => cfg.value.firmantes)

const textos = computed(() => {
  const valores = {
    nombre: fullName.value,
    curso: cursoTitle.value,
    duracion: cursoDuracion.value,
    fecha: emissionDate.value,
    folio: folio.value,
  }
  return {
    pre: aplicarMarcadores(cfg.value.textoPre, valores),
    titulo: aplicarMarcadores(cfg.value.textoTitulo, valores),
    cuerpo: aplicarMarcadores(cfg.value.textoCuerpo, valores),
  }
})

const fondoUrl = computed(
  () => urlAsset(cfg.value.diseno?.fondo_path) || '/theme/constancia-fondo.webp'
)
const plecaUrl = computed(
  () => urlAsset(cfg.value.diseno?.pleca_path) || '/theme/constancia-pleca.webp'
)

const emissionDate = computed(() => {
  if (!realConstancia.value?.emitida_en) return ''
  const d = new Date(realConstancia.value.emitida_en)
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`
})

const verificationUrlReal = computed(
  () => `${window.location.origin}${window.location.pathname}#/verificar/${folio.value}`
)

onMounted(async () => {
  // Settings global del firmante en paralelo con la constancia.
  getConstanciaConfig()
    .then((s) => {
      settings.value = s
    })
    .catch(() => {})

  if (!props.session) {
    cargando.value = false
    return
  }
  try {
    const { data } = await supabase
      .from('constancias')
      .select(
        '*, cursos(*), perfiles(nombres, apellido_paterno, apellido_materno, nombres_completos)'
      )
      .eq('user_id', props.session.user.id)
      .eq('curso_id', props.cursoId)
      .single()
    if (data) realConstancia.value = data
  } catch (err) {
    console.error('Error fetching constancia:', err)
  } finally {
    cargando.value = false
  }
})

const compartido = ref(false)
const descargando = ref(false)

async function compartir() {
  try {
    await navigator.clipboard.writeText(verificationUrlReal.value)
    compartido.value = true
    setTimeout(() => {
      compartido.value = false
    }, 2500)
  } catch {
    prompt('Copia este enlace:', verificationUrlReal.value)
  }
}

async function descargarPdf() {
  if (descargando.value || !hayConstancia.value) return
  descargando.value = true
  try {
    const el = document.querySelector('.cnst-doc')
    if (!el) throw new Error('No se encontró el documento.')
    // html2pdf arrastra html2canvas y jsPDF: ~1 MB. Se carga al pulsar
    // descargar, no al abrir la página — la mayoría de las visitas solo
    // consultan la constancia en pantalla.
    const { default: html2pdf } = await import('html2pdf.js')
    await html2pdf()
      .set({
        margin: 0,
        filename: `constancia-${folio.value}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(el)
      .save()
  } catch (err) {
    console.error('Error generando PDF:', err)
    alert('No se pudo generar el PDF. Intenta de nuevo.')
  } finally {
    descargando.value = false
  }
}

function goBack() {
  router.push({ name: 'perfil' })
}
</script>

<template>
  <div class="cnst-page">
    <!-- Top bar (no se exporta al PDF) -->
    <div class="cnst-topbar container">
      <button class="btn btn-ghost btn-sm" type="button" @click="goBack">
        <IconSet name="arrowLeft" />
        Mis constancias
      </button>
      <div v-if="hayConstancia" class="cnst-topbar-actions">
        <button class="btn btn-ghost btn-sm" type="button" @click="compartir">
          <template v-if="compartido"> ✓ Enlace copiado </template>
          <template v-else> Compartir </template>
        </button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="descargando"
          type="button"
          @click="descargarPdf"
        >
          <template v-if="descargando"> Generando PDF… </template>
          <template v-else>
            Descargar PDF
            <IconSet name="arrow" />
          </template>
        </button>
      </div>
    </div>

    <!-- Sin constancia: no se pinta ningún documento. Ver nota en <script>. -->
    <div v-if="cargando" class="cnst-wrap container cnst-estado">
      <p>Buscando tu constancia…</p>
    </div>

    <div v-else-if="!hayConstancia" class="cnst-wrap container cnst-estado">
      <h2>Aún no tienes constancia de este curso</h2>
      <p>
        La constancia se emite automáticamente al completar todas las lecciones del curso. Cuando
        eso ocurra, aparecerá aquí con su folio y su código de verificación.
      </p>
      <button class="btn btn-primary btn-sm" type="button" @click="goBack">
        Volver a mis constancias
      </button>
    </div>

    <!-- Documento (esto es lo que se exporta a PDF) -->
    <div v-else class="cnst-wrap container">
      <div class="cnst-doc">
        <!-- Fondo decorativo -->
        <img src="/theme/constancia-fondo.webp" class="cnst-fondo" alt="" aria-hidden="true" />
        <!-- Pleca superior -->
        <img :src="plecaUrl" class="cnst-pleca cnst-pleca-top" alt="" aria-hidden="true" />
        <!-- Pleca inferior -->
        <img :src="plecaUrl" class="cnst-pleca cnst-pleca-bottom" alt="" aria-hidden="true" />

        <!-- Contenido -->
        <div class="cnst-content">
          <!-- Logos institucionales -->
          <header class="cnst-head">
            <img :src="theme.logos.constancia" class="cnst-logos" :alt="theme.constancia.emisor" />
          </header>

          <!-- Cuerpo -->
          <section class="cnst-body">
            <p class="cnst-pre">
              {{ theme.constancia.emisor }}
            </p>
            <p class="cnst-pre cnst-pre-2">
              {{ textos.pre }}
            </p>

            <h1 class="cnst-titulo">
              {{ textos.titulo }}
            </h1>

            <p class="cnst-a">A</p>

            <p class="cnst-nombre">
              {{ fullName }}
            </p>

            <!-- El cuerpo es configurable por curso y sus marcadores ya
                 vienen sustituidos. Si está vacío se usa la redacción de
                 siempre, para no dejar la constancia sin explicación. -->
            <p v-if="textos.cuerpo" class="cnst-descripcion">
              {{ textos.cuerpo }}
            </p>
            <p v-else class="cnst-descripcion">
              Por haber acreditado satisfactoriamente el curso de capacitación
              <em>{{ cursoTitle }}</em
              >, impartido a través de {{ theme.app.name }}.
            </p>

            <p class="cnst-duracion mono">{{ cursoDuracion || '—' }} · Folio {{ folio }}</p>
          </section>

          <!-- Firmantes. Salen de lo congelado al emitir, no del catálogo
               actual: un documento impreso no cambia de firmante. -->
          <section
            v-if="firmantes.length"
            class="cnst-firmas"
            :class="{ 'es-multiple': firmantes.length > 1 }"
          >
            <div v-for="(f, i) in firmantes" :key="i" class="cnst-firma">
              <img
                v-if="f.firma_path"
                :src="urlFirma(f.firma_path)"
                alt=""
                aria-hidden="true"
                class="cnst-firma-img"
              />
              <div class="cnst-firma-linea" />
              <p class="cnst-titular-nombre">
                {{ f.nombre }}
              </p>
              <p class="cnst-titular-cargo">
                {{ f.cargo }}
              </p>
            </div>
          </section>

          <!-- Constancias anteriores a la migración 070: firmante único. -->
          <section v-else-if="settings.titular_nombre" class="cnst-firmas">
            <div class="cnst-firma">
              <div class="cnst-firma-linea" />
              <p class="cnst-titular-nombre">
                {{ settings.titular_nombre }}
              </p>
              <p class="cnst-titular-cargo">
                {{ settings.titular_cargo }}
              </p>
            </div>
          </section>

          <!-- Pie: lugar/fecha + QR -->
          <footer class="cnst-foot">
            <div class="cnst-foot-lugar">
              <p class="cnst-lugar">{{ cfg.lugar || settings.lugar }}, {{ emissionDate }}</p>
            </div>
            <div class="cnst-foot-qr" aria-label="Código de verificación">
              <QrcodeVue
                :value="verificationUrlReal"
                :size="92"
                level="M"
                :background="'#ffffff'"
                :foreground="'#161a1d'"
              />
              <span class="mono cnst-qr-label">Verificar</span>
            </div>
          </footer>
        </div>
      </div>
    </div>

    <!-- Verification bar -->
    <div class="cnst-verify container">
      <span class="mono cnst-verify-url">{{ verificationUrlReal }}</span>
      <span class="chip chip-verde">
        <IconSet name="check" />
        Válida · firmada electrónicamente
      </span>
    </div>
  </div>
</template>

<style scoped>
.cnst-page {
  padding-bottom: calc(var(--unit) * 10);
  background: var(--paper-2);
}

/* === Top bar === */
.cnst-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: calc(var(--unit) * 4);
  padding-bottom: calc(var(--unit) * 4);
  margin-bottom: calc(var(--unit) * 6);
}
.cnst-topbar-actions {
  display: flex;
  gap: calc(var(--unit) * 1.5);
}

/* === Documento A4 === */
.cnst-wrap {
  display: flex;
  justify-content: center;
}
.cnst-doc {
  position: relative;
  width: 100%;
  max-width: 900px;
  aspect-ratio: 1 / 1.414; /* A4 */
  background: var(--paper);
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  isolation: isolate;
}

/* Fondo decorativo full-bleed bajo el contenido */
.cnst-fondo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.85;
  z-index: 0;
  pointer-events: none;
  user-select: none;
}
/* Plecas del color primario arriba y abajo */
.cnst-pleca {
  position: absolute;
  left: 0;
  width: 100%;
  height: auto;
  z-index: 2;
  pointer-events: none;
  user-select: none;
}
.cnst-pleca-top {
  top: 0;
}
.cnst-pleca-bottom {
  bottom: 0;
  transform: scaleY(-1);
}

/* Contenido en grilla vertical */
.cnst-content {
  position: relative;
  z-index: 3;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  height: 100%;
  padding: 8% 9% 6%;
  gap: 2%;
}

/* Logos institucionales */
.cnst-head {
  display: flex;
  justify-content: center;
  align-items: center;
}
.cnst-logos {
  width: 78%;
  max-width: 620px;
  height: auto;
  display: block;
}

/* Cuerpo */
.cnst-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.8rem;
  padding: 1% 0;
}
.cnst-pre {
  font-family: var(--ui);
  font-size: 18px;
  color: var(--brand-ink);
  margin: 0;
}
.cnst-pre-2 {
  font-style: italic;
  font-family: var(--display);
}
.cnst-titulo {
  font-family: var(--display);
  font-weight: 700;
  font-variation-settings:
    'opsz' 144,
    'wght' 700;
  font-size: clamp(48px, 7vw, 78px);
  letter-spacing: 0.04em;
  color: var(--brand-accent);
  margin: 0.4rem 0 0.4rem;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
}
.cnst-a {
  font-family: var(--display);
  font-style: italic;
  font-size: 22px;
  color: var(--brand-ink);
}
.cnst-nombre {
  font-family: var(--display);
  font-weight: 700;
  font-variation-settings:
    'opsz' 144,
    'wght' 700;
  font-size: clamp(28px, 4vw, 44px);
  color: var(--brand-ink);
  margin: 0.4rem 0 1.2rem;
}
.cnst-descripcion {
  font-family: var(--ui);
  font-size: 15px;
  line-height: 1.6;
  color: var(--gris-70);
  max-width: 70ch;
  margin: 0.4rem auto;
}
.cnst-descripcion em {
  font-style: italic;
  font-family: var(--display);
  font-weight: 600;
  color: var(--brand-primary);
}
.cnst-duracion {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: var(--gris-70);
  text-transform: uppercase;
  margin-top: 0.4rem;
}

/* Firmantes: uno centrado, varios en fila. */
.cnst-firmas {
  display: flex;
  justify-content: center;
  gap: 48px;
  flex-wrap: wrap;
}
.cnst-firma-img {
  max-height: 56px;
  max-width: 220px;
  object-fit: contain;
  margin-bottom: -6px;
}
.cnst-firma {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.cnst-firma-linea {
  width: 240px;
  height: 1px;
  background: var(--brand-ink);
  margin-bottom: 8px;
}
.cnst-titular-nombre {
  font-family: var(--ui);
  font-weight: 700;
  font-size: 16px;
  color: var(--brand-ink);
}
.cnst-titular-cargo {
  font-family: var(--ui);
  font-size: 13px;
  color: var(--gris-70);
}

/* Pie */
.cnst-foot {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  gap: 1rem;
}
.cnst-foot-lugar {
  padding-bottom: 4px;
}
.cnst-lugar {
  font-family: var(--ui);
  font-size: 13px;
  color: var(--brand-ink);
}
.cnst-estado {
  text-align: center;
  padding: 3rem 1rem;
  max-width: 40rem;
}

.cnst-estado h2 {
  margin-bottom: 0.75rem;
}

.cnst-estado p {
  margin-bottom: 1.5rem;
  color: var(--muted, #555);
}

.cnst-foot-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--paper);
  padding: 6px;
  border: 1px solid var(--gris-20);
}
.cnst-qr-label {
  font-size: 9.5px;
  letter-spacing: 0.18em;
  color: var(--gris-70);
}

/* Verify bar fuera del documento */
.cnst-verify {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: calc(var(--unit) * 3);
  padding-top: calc(var(--unit) * 4);
  margin-top: calc(var(--unit) * 4);
  flex-wrap: wrap;
}
.cnst-verify-url {
  color: var(--ink-3);
  font-size: 11.5px;
  letter-spacing: 0.06em;
}

@media (max-width: 720px) {
  .cnst-content {
    padding: 9% 6% 6%;
  }
  .cnst-firma-linea {
    width: 60vw;
    max-width: 240px;
  }
  .cnst-foot {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }
}
</style>
