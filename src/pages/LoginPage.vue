<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconSet from '@/components/IconSet.vue'
import { theme } from '@/lib/theme.js'

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
        <p class="eyebrow auth-aside-kicker">{{ theme.nav.title }} · {{ theme.app.name }}</p>
        <h2 class="auth-aside-quote">
          Formación oficial,
          <em>constancia verificable</em>, servicio público profesional.
        </h2>
        <p class="auth-aside-meta">
          {{ theme.org.name }}
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
              placeholder="correo@ejemplo.com"
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
          <a href="#" @click.prevent="router.push({ name: 'recuperar' })"
            >¿Olvidaste tu contraseña?</a
          >
        </p>

        <p class="auth-alt">
          ¿No tienes cuenta?
          <a href="#" @click.prevent="router.push({ name: 'registro' })">Crear cuenta</a>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Los estilos del armazón .auth-* son globales (main.css): los comparten
   acceso, recuperar y restablecer. Aquí solo iría lo exclusivo de esta página. */
</style>
