<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconSet from '@/components/IconSet.vue'
import { solicitarRestablecimiento } from '@/services/recuperacion.js'

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
  <div class="auth">
    <section class="auth-panel">
      <div class="auth-box">
        <h1 class="auth-title">Recuperar contraseña</h1>
        <p class="auth-subtitle">
          Escribe tu correo institucional y te enviamos un enlace para elegir una contraseña nueva.
        </p>

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

<style scoped>
.auth-aviso {
  margin-top: calc(var(--unit) * 2);
  padding: 14px 18px;
  background: var(--success-soft);
  border: 1px solid var(--line);
  color: var(--ink);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

/* La instalación sin correo no es un éxito con otro texto: es otro estado. */
.auth-aviso-problema {
  background: var(--danger-soft);
  border-color: var(--danger-line);
  color: var(--danger);
}
</style>
