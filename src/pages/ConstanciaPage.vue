<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { CURSOS, USER } from '@/data.js'
import { supabase } from '@/lib/supabase.js'
import IconSet from '@/components/IconSet.vue'
import html2pdf from 'html2pdf.js'
import QrcodeVue from 'qrcode.vue'
import { getConstanciaConfig, CONSTANCIA_DEFAULTS } from '@/services/constanciaConfig.js'

const props = defineProps({
  cursoId: { type: String, required: true },
  session: { type: Object, default: null },
})

const router = useRouter()

const realConstancia = ref(null)
const settings = ref({ ...CONSTANCIA_DEFAULTS })

const curso = computed(() => CURSOS.find((c) => c.id === props.cursoId) || CURSOS[1])

const folio = computed(() => {
  if (realConstancia.value?.folio) return realConstancia.value.folio
  return `CONASAMA-2026-${curso.value.id.toUpperCase()}-4721`
})

const fullName = computed(() => {
  if (realConstancia.value?.perfiles) {
    const p = realConstancia.value.perfiles
    return p.nombres_completos || `${p.nombres} ${p.apellido_paterno} ${p.apellido_materno}`.trim()
  }
  return `${USER.nombre} ${USER.apellidos}`
})

const cursoTitle = computed(() => {
  if (realConstancia.value?.cursos?.titulo) return realConstancia.value.cursos.titulo
  return curso.value.titulo
})

const cursoDuracion = computed(() => {
  if (realConstancia.value?.cursos?.duracion) return realConstancia.value.cursos.duracion
  return curso.value.duracion
})

const emissionDate = computed(() => {
  const d = realConstancia.value?.emitida_en
    ? new Date(realConstancia.value.emitida_en)
    : new Date()
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

  if (!props.session) return
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
  if (descargando.value) return
  descargando.value = true
  try {
    const el = document.querySelector('.cnst-doc')
    if (!el) throw new Error('No se encontró el documento.')
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
      <div class="cnst-topbar-actions">
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

    <!-- Documento (esto es lo que se exporta a PDF) -->
    <div class="cnst-wrap container">
      <div class="cnst-doc">
        <!-- Fondo decorativo -->
        <img src="/img/constancia-fondo.webp" class="cnst-fondo" alt="" aria-hidden="true" />
        <!-- Pleca superior -->
        <img
          src="/img/constancia-pleca.webp"
          class="cnst-pleca cnst-pleca-top"
          alt=""
          aria-hidden="true"
        />
        <!-- Pleca inferior -->
        <img
          src="/img/constancia-pleca.webp"
          class="cnst-pleca cnst-pleca-bottom"
          alt=""
          aria-hidden="true"
        />

        <!-- Contenido -->
        <div class="cnst-content">
          <!-- Logos institucionales -->
          <header class="cnst-head">
            <img
              src="/img/constancia-logos.webp"
              class="cnst-logos"
              alt="Gobierno de México · Salud · CONASAMA"
            />
          </header>

          <!-- Cuerpo -->
          <section class="cnst-body">
            <p class="cnst-pre">La Comisión Nacional de Salud Mental y Adicciones</p>
            <p class="cnst-pre cnst-pre-2">Otorga el presente</p>

            <h1 class="cnst-titulo">CONSTANCIA</h1>

            <p class="cnst-a">A</p>

            <p class="cnst-nombre">
              {{ fullName }}
            </p>

            <p class="cnst-descripcion">
              Por haber acreditado satisfactoriamente el curso de capacitación
              <em>{{ cursoTitle }}</em
              >, impartido por la Plataforma de Capacitación CONASAMA y dirigido a servidoras y
              servidores públicos del Gobierno de México.
            </p>

            <p class="cnst-duracion mono">{{ cursoDuracion || '—' }} · Folio {{ folio }}</p>
          </section>

          <!-- Firma titular -->
          <section class="cnst-firma">
            <div class="cnst-firma-linea" />
            <p class="cnst-titular-nombre">
              {{ settings.titular_nombre }}
            </p>
            <p class="cnst-titular-cargo">
              {{ settings.titular_cargo }}
            </p>
          </section>

          <!-- Pie: lugar/fecha + QR -->
          <footer class="cnst-foot">
            <div class="cnst-foot-lugar">
              <p class="cnst-lugar">{{ settings.lugar }}, {{ emissionDate }}</p>
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

/* Firma del titular */
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
