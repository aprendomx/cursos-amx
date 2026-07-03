<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { DEPENDENCIAS } from '@/data.js'
import { supabase } from '@/lib/supabase.js'
import IconSet from '@/components/IconSet.vue'

const props = defineProps({
  nextPage: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
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
      return !!(nombres.value.trim() && apellido_p.value.trim()) && password.value.length >= 8
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

function prev() {
  if (step.value > 0) step.value--
}

function next() {
  if (!canAdvance.value || props.loading) return
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
            Tu información se usa exclusivamente para emitir constancias de CONASAMA. No compartimos
            tus datos con terceros.
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
            <div class="field">
              <label for="r-password">Contraseña</label>
              <input
                id="r-password"
                v-model="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
          </div>

          <!-- Step 1: Contacto -->
          <div v-else-if="step === 1" key="fields-1" class="registro-fields fade-in">
            <div class="field">
              <label for="r-correo">Correo institucional</label>
              <input
                id="r-correo"
                v-model="correo"
                type="email"
                placeholder="nombre@dependencia.gob.mx"
              />
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
                <a href="#" style="text-decoration: underline">aviso de privacidad</a>
                de CONASAMA.
              </span>
            </label>
          </div>
        </div>

        <!-- Bottom navigation -->
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
            :style="{ opacity: canAdvance && !loading ? 1 : 0.4 }"
            :disabled="!canAdvance || loading"
            @click="next"
          >
            <template v-if="loading"> Creando cuenta... </template>
            <template v-else>
              {{ step < 3 ? 'Siguiente' : 'Crear cuenta' }}
            </template>
            <IconSet v-if="!loading" name="arrow" />
          </button>
        </footer>

        <div
          v-if="error"
          :style="{
            marginTop: '16px',
            padding: '14px 18px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            color: 'var(--danger)',
            fontSize: '13px',
            lineHeight: '1.5',
          }"
        >
          {{ error }}
        </div>
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
  color: var(--paper);
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
  color: var(--paper);
}

.registro-privacy {
  font-size: 14px;
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
  font-size: 13px;
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
  font-size: 14px;
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
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.registro-summary-value {
  font-family: var(--display);
  font-size: 18px;
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
  font-size: 14px;
  color: var(--ink-2);
  line-height: 1.5;
  cursor: pointer;
}

.registro-accept input[type='checkbox'] {
  margin-top: 3px;
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
  flex-shrink: 0;
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
  font-size: 12px;
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
