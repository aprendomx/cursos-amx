<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconSet from '@/components/IconSet.vue'

const props = defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['login'])

const router = useRouter()

const correo = ref('')
const password = ref('')

const canSubmit = () => correo.value.includes('@') && password.value.length >= 6

function submit() {
  if (!canSubmit() || props.loading) return
  emit('login', { correo: correo.value, password: password.value })
}
</script>

<template>
  <div class="auth-shell">
    <!-- Lado izquierdo: panel institucional -->
    <aside class="auth-aside" aria-hidden="true">
      <div class="auth-aside-inner">
        <p class="eyebrow auth-aside-kicker">Plataforma de Capacitación · CONASAMA</p>
        <h2 class="auth-aside-quote">
          Formación oficial,
          <em>constancia verificable</em>, servicio público profesional.
        </h2>
        <p class="auth-aside-meta">
          Gobierno de México · Secretaría de Salud · Comisión Nacional contra las Adicciones
        </p>
      </div>
    </aside>

    <!-- Lado derecho: formulario -->
    <section class="auth-form-wrap fade-in" aria-labelledby="login-titulo">
      <div class="auth-form">
        <header class="auth-header">
          <p class="eyebrow">Inicio de sesión</p>
          <h1 id="login-titulo" class="display">Accede a tu plataforma</h1>
          <p class="auth-subtitle">Para servidoras y servidores públicos registrados.</p>
        </header>

        <div class="auth-fields">
          <div class="field">
            <label for="login-correo">Correo institucional</label>
            <input
              id="login-correo"
              v-model="correo"
              type="email"
              placeholder="nombre@gob.mx"
              autocomplete="email"
              autofocus
              @keydown.enter="submit"
            />
          </div>

          <div class="field">
            <label for="login-pass">Contraseña</label>
            <input
              id="login-pass"
              v-model="password"
              type="password"
              placeholder="••••••••"
              autocomplete="current-password"
              @keydown.enter="submit"
            />
          </div>
        </div>

        <div v-if="error" class="auth-error" role="alert">
          {{ error }}
        </div>

        <button
          class="btn btn-primary auth-submit"
          :disabled="!canSubmit() || loading"
          type="button"
          @click="submit"
        >
          <template v-if="loading"> Iniciando sesión… </template>
          <template v-else> Entrar <IconSet name="arrow" /> </template>
        </button>

        <p class="auth-alt">
          ¿No tienes cuenta?
          <a href="#" @click.prevent="router.push({ name: 'registro' })">Crear cuenta</a>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.auth-shell {
  min-height: calc(100vh - 78px);
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--paper);
}

.auth-aside {
  background: var(--brand-primary);
  color: var(--paper);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
}
.auth-aside::before {
  /* franja arena diagonal */
  content: '';
  position: absolute;
  inset: -20% auto auto -20%;
  width: 70%;
  height: 50%;
  background: var(--brand-accent-soft);
  opacity: 0.18;
  transform: rotate(-18deg);
}
.auth-aside::after {
  /* línea oro vertical en el borde — recordatorio APF */
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 4px;
  background: var(--brand-accent);
}
.auth-aside-inner {
  position: relative;
  z-index: 1;
  padding: calc(var(--unit) * 10) calc(var(--unit) * 7);
  max-width: 560px;
  margin: 0 auto;
}
.auth-aside-kicker {
  color: var(--brand-accent-soft);
  margin-bottom: calc(var(--unit) * 3);
}
.auth-aside-quote {
  font-family: var(--display);
  font-weight: 500;
  font-variation-settings:
    'opsz' 144,
    'wght' 500;
  font-size: clamp(34px, 4vw, 52px);
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin-bottom: calc(var(--unit) * 3);
}
.auth-aside-quote em {
  font-style: italic;
  font-variation-settings:
    'opsz' 144,
    'wght' 400;
  color: var(--brand-accent-soft);
}
.auth-aside-meta {
  font-size: 12px;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.7);
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  padding-top: calc(var(--unit) * 2);
  max-width: 32ch;
}

.auth-form-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--unit) * 6) calc(var(--unit) * 4);
}
.auth-form {
  width: 100%;
  max-width: 460px;
}
.auth-header {
  margin-bottom: calc(var(--unit) * 5);
}
.auth-header .eyebrow {
  color: var(--brand-primary);
  margin-bottom: 14px;
}
.auth-header h1 {
  font-size: clamp(36px, 4vw, 52px);
  margin-bottom: 14px;
}
.auth-subtitle {
  color: var(--gris-70);
  font-size: 15px;
  max-width: 36ch;
}

.auth-fields {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3.5);
  margin-bottom: calc(var(--unit) * 3);
}

.auth-error {
  margin-top: calc(var(--unit) * 1);
  padding: 12px 14px;
  background: #fdecec;
  border-left: 3px solid var(--danger);
  color: var(--danger);
  font-size: 13.5px;
  line-height: 1.45;
}

.auth-submit {
  width: 100%;
  justify-content: center;
  margin-top: calc(var(--unit) * 2);
}
.auth-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.auth-alt {
  margin-top: calc(var(--unit) * 3);
  font-size: 13.5px;
  color: var(--gris-70);
  text-align: center;
}
.auth-alt a {
  color: var(--brand-primary);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: var(--brand-accent);
  text-underline-offset: 3px;
  cursor: pointer;
}
.auth-alt a:hover {
  color: var(--brand-primary-dark);
}

@media (max-width: 880px) {
  .auth-shell {
    grid-template-columns: 1fr;
  }
  .auth-aside {
    display: none;
  }
  .auth-form-wrap {
    padding: calc(var(--unit) * 4) calc(var(--unit) * 3);
  }
}
</style>
