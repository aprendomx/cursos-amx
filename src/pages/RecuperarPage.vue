<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconSet from '@/components/IconSet.vue'
import { solicitarRestablecimiento } from '@/services/recuperacion.js'
import { theme } from '@/lib/theme.js'

const router = useRouter()
const correo = ref('')
const enviando = ref(false)
const resultado = ref(null)
const refAviso = ref(null)

async function enviar() {
  if (!correo.value.trim() || enviando.value) return
  enviando.value = true
  resultado.value = null
  resultado.value = await solicitarRestablecimiento(correo.value)
  enviando.value = false
  // `role="alert"` lo anuncia, pero no lleva a nadie hasta él.
  await new Promise((r) => setTimeout(r, 0))
  refAviso.value?.focus()
}
</script>

<template>
  <div class="auth-shell">
    <aside class="auth-aside" aria-hidden="true">
      <div class="auth-aside-inner">
        <p class="eyebrow auth-aside-kicker">{{ theme.nav.title }} · {{ theme.app.name }}</p>
        <h2 class="auth-aside-quote">Recupera tu acceso <em>en dos pasos</em>.</h2>
        <p class="auth-aside-meta">
          {{ theme.org.name }}
        </p>
      </div>
    </aside>

    <section class="auth-form-wrap fade-in" aria-labelledby="rec-titulo">
      <div class="auth-form">
        <header class="auth-header">
          <p class="eyebrow">Recuperar contraseña</p>
          <h1 id="rec-titulo" class="display">¿Olvidaste tu contraseña?</h1>
          <p class="auth-subtitle">
            Escribe tu correo institucional y te enviamos un enlace para elegir una nueva.
          </p>
        </header>

        <div class="auth-fields">
          <div class="field">
            <label for="rec-correo">Correo institucional</label>
            <input
              id="rec-correo"
              v-model="correo"
              type="email"
              autocomplete="email"
              placeholder="correo@ejemplo.com"
              @keydown.enter="enviar"
            />
          </div>
        </div>

        <div
          v-if="resultado"
          ref="refAviso"
          class="auth-aviso"
          :class="{ 'auth-aviso-problema': resultado.sinCorreo }"
          role="alert"
          tabindex="-1"
        >
          {{ resultado.mensaje }}
        </div>

        <button
          class="btn btn-primary auth-submit"
          :disabled="!correo.trim() || enviando"
          type="button"
          @click="enviar"
        >
          <template v-if="enviando"> Enviando… </template>
          <template v-else> Enviar enlace <IconSet name="arrow" /> </template>
        </button>

        <p class="auth-alt">
          <a href="#" @click.prevent="router.push({ name: 'login' })">Volver al inicio de sesión</a>
        </p>
      </div>
    </section>
  </div>
</template>
