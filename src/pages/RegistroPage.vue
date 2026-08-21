<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { DEPENDENCIAS } from '@/data.js'
import { supabase } from '@/lib/supabase.js'
import IconSet from '@/components/IconSet.vue'
import { registrarEventoPortada } from '@/composables/useEventosPortada.js'
import { theme } from '@/lib/theme.js'
import { resolverEnlace } from '@/lib/enlacesInstitucionales.js'
import { contrasenaValida } from '@/lib/contrasena.js'
import CampoContrasena from '@/components/CampoContrasena.vue'

// El enlace de la casilla apuntaba a '#'. Se recababa el consentimiento contra
// un documento que no existía; ahora lleva al aviso que se está aceptando,
// respetando la URL externa del tema si la instalación la define.
const enlaceAvisoTema = (theme.footer?.columns || [])
  .flatMap((c) => c.links || [])
  .find((l) => l.doc === 'aviso-privacidad' || /aviso de privacidad/i.test(l.label || ''))
const hrefAviso = resolverEnlace(enlaceAvisoTema || { doc: 'aviso-privacidad' }).href

// Los nombres importan y no eran los correctos. App.vue pasa por router-view
// `:loading`/`:error` con el estado del LOGIN y `:registro-loading`/
// `:registro-error` con el del alta. Esta página declaraba `loading` y
// `error`, así que recibía el estado del login —siempre vacío mientras uno se
// registra— y el del alta se quedaba fuera como atributo suelto.
//
// Consecuencia: un registro fallido no mostraba NADA. Ni carga, ni error. El
// usuario pulsaba «Crear cuenta» y la página se quedaba quieta.
const props = defineProps({
  nextPage: { type: Object, default: null },
  registroLoading: { type: Boolean, default: false },
  registroError: { type: String, default: '' },
})

const emit = defineEmits(['complete'])

const router = useRouter()

const step = ref(0)

const nombres = ref('')
const apellido_p = ref('')
const apellido_s = ref('')
const correo = ref('')
const telefono = ref('')
const dependencia = ref('')
const cargo = ref('')
const acepta = ref(false)
const password = ref('')
const dependenciasLista = ref([...DEPENDENCIAS])

onMounted(async () => {
  registrarEventoPortada('registro_iniciado', { seccion: 'registro' })
  try {
    const { data } = await supabase
      .from('dependencias')
      .select('nombre')
      .eq('activa', true)
      .order('nombre')
    if (data?.length) dependenciasLista.value = data.map((d) => d.nombre)
  } catch {}
})

const steps = [
  { label: 'Identidad', title: '¿Cómo debemos nombrarte en tu constancia?' },
  { label: 'Contacto', title: '¿Cómo te localizamos?' },
  { label: 'Dependencia', title: '¿Dónde te desempeñas actualmente?' },
  { label: 'Confirmar', title: 'Verifica tus datos' },
]

const canAdvance = computed(() => {
  switch (step.value) {
    case 0:
      return !!(nombres.value.trim() && apellido_p.value.trim()) && contrasenaValida(password.value)
    case 1:
      return correo.value.includes('@') && telefono.value.length >= 10
    case 2:
      return !!(dependencia.value && cargo.value.trim())
    case 3:
      return acepta.value
    default:
      return false
  }
})

const formData = computed(() => ({
  nombres: nombres.value,
  apellido_p: apellido_p.value,
  apellido_s: apellido_s.value,
  correo: correo.value,
  telefono: telefono.value,
  dependencia: dependencia.value,
  cargo: cargo.value,
  password: password.value,
  acepta: acepta.value,
}))

// El error de alta —correo ya registrado, contraseña rechazada por el
// servidor— aparecía al pie, DEBAJO de la botonera. Quien navega con teclado o
// con lector de pantalla se quedaba en el botón sin saber que había pasado
// algo: `role="alert"` lo anuncia, pero no lleva a ninguna parte. Ahora el
// foco va al mensaje, que es lo accionable.
const refError = ref(null)

// `flush: 'post'` en lugar de esperar un nextTick a mano: los observadores
// corren ANTES de que el DOM se actualice, así que la versión con `await
// nextTick()` dejaba el foco colgando de una carrera —el elemento podía no
// existir todavía cuando le tocaba recibirlo—. Con 'post' el observador corre
// después del render, y el nodo está garantizado.
watch(
  () => props.registroError,
  (nuevo) => {
    if (!nuevo) return
    refError.value?.focus()
  },
  { flush: 'post' }
)

function prev() {
  if (step.value > 0) step.value--
}

function next() {
  if (!canAdvance.value || props.registroLoading) return
  if (step.value < 3) {
    step.value++
  } else {
    emit('complete', formData.value)
  }
}

const summaryRows = computed(() => [
  { label: 'Nombre(s)', value: nombres.value },
  { label: 'Primer apellido', value: apellido_p.value },
  { label: 'Segundo apellido', value: apellido_s.value || '—' },
  { label: 'Contraseña', value: '••••••••' },
  { label: 'Correo institucional', value: correo.value },
  { label: 'Teléfono móvil', value: telefono.value },
  { label: 'Dependencia', value: dependencia.value },
  { label: 'Cargo / puesto', value: cargo.value },
])
</script>

<template>
  <div class="registro">
    <!-- LEFT PANEL -->
    <aside class="registro-left">
      <div class="registro-left-content">
        <div class="registro-left-top">
          <p class="eyebrow" style="color: var(--brand-accent-soft)">Paso {{ step + 1 }} de 4</p>
          <h1 class="display registro-headline">
            Tu cuenta,<br />
            <em class="display-italic" style="color: var(--brand-accent-soft)">tu constancia.</em>
          </h1>
          <p class="registro-privacy">
            Tu información se usa exclusivamente para emitir constancias de
            {{ theme.constancia.emisor }}. No compartimos tus datos con terceros.
          </p>
        </div>

        <nav class="registro-steps">
          <div
            v-for="(s, i) in steps"
            :key="i"
            class="registro-step-item"
            :class="{ completed: i < step, current: i === step, future: i > step }"
          >
            <span class="registro-step-circle">
              <template v-if="i < step">
                <IconSet name="check" />
              </template>
              <template v-else>
                {{ i + 1 }}
              </template>
            </span>
            <span class="registro-step-label">{{ s.label }}</span>
          </div>
        </nav>
      </div>
    </aside>

    <!-- RIGHT PANEL -->
    <main class="registro-right">
      <div class="registro-right-inner">
        <div class="registro-form-area">
          <p class="eyebrow">
            {{ steps[step].label }}
          </p>
          <h2 :key="step" class="display registro-form-title">
            {{ steps[step].title }}
          </h2>

          <!-- Step 0: Identidad -->
          <div v-if="step === 0" key="fields-0" class="registro-fields fade-in">
            <div class="field">
              <label for="r-nombres">Nombre(s)</label>
              <input
                id="r-nombres"
                v-model="nombres"
                type="text"
                placeholder="Ej. María Fernanda"
              />
            </div>
            <div class="field">
              <label for="r-ap1">Primer apellido</label>
              <input id="r-ap1" v-model="apellido_p" type="text" placeholder="Ej. Escalante" />
            </div>
            <div class="field">
              <label for="r-ap2">Segundo apellido</label>
              <input id="r-ap2" v-model="apellido_s" type="text" placeholder="Opcional" />
            </div>
            <CampoContrasena id="r-password" v-model="password" label="Contraseña" />
          </div>

          <!-- Step 1: Contacto -->
          <div v-else-if="step === 1" key="fields-1" class="registro-fields fade-in">
            <div class="field">
              <label for="r-correo">Correo institucional</label>
              <input id="r-correo" v-model="correo" type="email" placeholder="correo@ejemplo.com" />
            </div>
            <div class="field">
              <label for="r-tel">Teléfono móvil</label>
              <input id="r-tel" v-model="telefono" type="tel" placeholder="55 1234 5678" />
            </div>
          </div>

          <!-- Step 2: Dependencia -->
          <div v-else-if="step === 2" key="fields-2" class="registro-fields fade-in">
            <div class="field">
              <label for="r-dep">Dependencia</label>
              <select id="r-dep" v-model="dependencia">
                <option value="" disabled>Selecciona tu dependencia</option>
                <option v-for="d in dependenciasLista" :key="d" :value="d">
                  {{ d }}
                </option>
              </select>
            </div>
            <div class="field">
              <label for="r-cargo">Cargo / puesto</label>
              <input
                id="r-cargo"
                v-model="cargo"
                type="text"
                placeholder="Ej. Subdirector(a) de Capacitación"
              />
            </div>
          </div>

          <!-- Step 3: Confirmar -->
          <div v-else key="fields-3" class="registro-fields fade-in">
            <div class="registro-summary card">
              <div v-for="(row, i) in summaryRows" :key="row.label" class="registro-summary-row">
                <span class="registro-summary-label mono">{{ row.label }}</span>
                <span class="registro-summary-value display">{{ row.value }}</span>
                <hr v-if="i < summaryRows.length - 1" class="hairline" />
              </div>
            </div>

            <label class="registro-accept">
              <input v-model="acepta" type="checkbox" />
              <span>
                He leído y acepto el
                <a
                  :href="hrefAviso"
                  target="_blank"
                  rel="noopener"
                  style="text-decoration: underline"
                  >aviso de privacidad</a
                >
                de {{ theme.constancia.emisor }}.
              </span>
            </label>
          </div>
        </div>

        <!-- Bottom navigation -->
        <div
          v-if="registroError"
          ref="refError"
          class="registro-error"
          role="alert"
          aria-live="assertive"
          tabindex="-1"
        >
          {{ registroError }}
        </div>

        <footer class="registro-nav">
          <button v-if="step > 0" class="btn btn-ghost btn-sm" @click="prev">
            <IconSet name="arrowLeft" />
            Anterior
          </button>
          <button v-else class="btn btn-ghost btn-sm" @click="router.push({ name: 'home' })">
            Cancelar
          </button>

          <span class="registro-nav-counter mono">{{ step + 1 }} / 4</span>

          <button
            class="btn btn-primary btn-sm"
            :style="{ opacity: canAdvance && !registroLoading ? 1 : 0.4 }"
            :disabled="!canAdvance || registroLoading"
            @click="next"
          >
            <template v-if="registroLoading"> Creando cuenta... </template>
            <template v-else>
              {{ step < 3 ? 'Siguiente' : 'Crear cuenta' }}
            </template>
            <IconSet v-if="!registroLoading" name="arrow" />
          </button>
        </footer>
      </div>
    </main>
  </div>
</template>

<style scoped>
.registro {
  display: grid;
  grid-template-columns: 5fr 7fr;
  min-height: 100vh;
}

/* ---- LEFT PANEL ---- */
.registro-left {
  position: relative;
  color: var(--sobre-primary-dark);
  display: flex;
  flex-direction: column;
  background: var(--brand-primary-dark);
  overflow: hidden;
}
.registro-left::before {
  content: '';
  position: absolute;
  inset: auto -20% -30% auto;
  width: 60%;
  height: 60%;
  background: var(--brand-accent-soft);
  opacity: 0.16;
  transform: rotate(-14deg);
}
.registro-left::after {
  /* línea oro vertical V1.24 */
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 3px;
  background: var(--brand-accent);
}

.registro-left-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: calc(var(--unit) * 6);
}

.registro-left-top {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
}

.registro-headline {
  font-size: clamp(36px, 4vw, 52px);
  color: var(--sobre-primary-dark);
}

.registro-privacy {
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--ink-4);
  max-width: 360px;
}

/* Steps indicator */
.registro-steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.registro-step-item {
  display: flex;
  align-items: center;
  gap: 14px;
  transition: opacity 220ms var(--ease);
}

.registro-step-item.future {
  opacity: 0.3;
}

.registro-step-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: var(--text-sm);
  font-weight: 600;
  flex-shrink: 0;
  transition: all 220ms var(--ease);
}

.registro-step-item.completed .registro-step-circle {
  background: var(--brand-accent-soft);
  color: var(--brand-primary-dark);
}

.registro-step-item.current .registro-step-circle {
  background: transparent;
  border: 2px solid var(--brand-accent-soft);
  color: var(--brand-accent-soft);
}

.registro-step-item.future .registro-step-circle {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.4);
}

.registro-step-label {
  font-size: var(--text-sm);
  font-weight: 500;
}

/* ---- RIGHT PANEL ---- */
.registro-right {
  display: flex;
  flex-direction: column;
  background: var(--paper);
}

.registro-right-inner {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: calc(var(--unit) * 6);
  max-width: 560px;
}

.registro-form-area {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
}

.registro-form-title {
  font-size: clamp(26px, 2.6vw, 36px);
  color: var(--ink);
  animation: fadeIn 320ms var(--ease) both;
}

.registro-fields {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
  margin-top: calc(var(--unit) * 2);
}

/* Summary card */
.registro-summary {
  padding: calc(var(--unit) * 3);
}

.registro-summary-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: calc(var(--unit) * 1.5) 0;
}

.registro-summary-label {
  font-family: var(--mono);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.registro-summary-value {
  font-family: var(--display);
  font-size: var(--text-lg);
  color: var(--ink);
}

.registro-summary-row .hairline {
  margin-top: calc(var(--unit) * 1.5);
}

/* Accept checkbox */
.registro-accept {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: var(--text-sm);
  color: var(--ink-2);
  line-height: 1.5;
  cursor: pointer;
  /* El objetivo táctil es la ETIQUETA entera, no el cuadrito: pinchar el texto
     también alterna la casilla. Medía 464 x 21 px — el ancho sobraba, pero la
     altura quedaba por debajo de los 24 px de WCAG 2.5.8, y muy lejos de los
     44 recomendados. El relleno vertical es lo que la levanta; min-height
     cubre el caso de que el texto quepa en menos.
     Es la casilla del consentimiento del aviso de privacidad, en el paso 4 del
     alta: fallarla es fallar el camino crítico de registro. */
  min-height: 44px;
  padding: 11px 0;
}

.registro-accept input[type='checkbox'] {
  /* 18 px era pequeño para apuntar. 24 es el mínimo de WCAG 2.5.8, y aquí es
     además la señal visual de que hay algo que marcar. */
  width: 24px;
  height: 24px;
  accent-color: var(--primary-fg);
  flex-shrink: 0;
}

/* Error de alta. Va ENCIMA de la botonera: al pie quedaba debajo de los
   botones, lejos de lo que hay que corregir. */
.registro-error {
  margin-bottom: calc(var(--unit) * 2);
  padding: 14px 18px;
  background: var(--danger-soft);
  border: 1px solid var(--danger-line);
  color: var(--danger);
  font-size: var(--text-sm);
  line-height: 1.5;
}

/* Bottom navigation */
.registro-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: calc(var(--unit) * 4);
  border-top: 1px solid var(--line);
  margin-top: calc(var(--unit) * 6);
}

.registro-nav-counter {
  font-family: var(--mono);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  color: var(--ink-3);
}

@media (max-width: 880px) {
  .registro {
    grid-template-columns: 1fr;
    min-height: auto;
  }
  .registro-left {
    padding-bottom: calc(var(--unit) * 2);
  }
  .registro-left-content {
    padding: calc(var(--unit) * 4);
    height: auto;
  }
  .registro-left-top {
    gap: calc(var(--unit) * 2);
  }
  .registro-headline {
    font-size: clamp(28px, 8vw, 40px);
  }
  .registro-steps {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: calc(var(--unit) * 2);
  }
  .registro-step-label {
    display: none;
  }
  .registro-right-inner {
    padding: calc(var(--unit) * 4);
    max-width: 100%;
  }
  .registro-form-title {
    font-size: clamp(22px, 6vw, 28px);
  }
}
</style>
