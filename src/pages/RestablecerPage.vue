<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import IconSet from '@/components/IconSet.vue'
import CampoContrasena from '@/components/CampoContrasena.vue'
import { canjearEnlace } from '@/services/recuperacion.js'
import { contrasenaValida } from '@/lib/contrasena.js'
import { supabase } from '@/lib/supabase.js'
import { mapSupabaseError } from '@/lib/errors'
import { theme } from '@/lib/theme.js'

const router = useRouter()

// 'canjeando' → 'listo' (se puede elegir contraseña) | 'rechazado' | 'guardado'
const estado = ref('canjeando')
const fallo = ref(null)
const password = ref('')
const guardando = ref(false)
const errorGuardado = ref('')
const refAviso = ref(null)

async function enfocarAviso() {
  await new Promise((r) => setTimeout(r, 0))
  refAviso.value?.focus()
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const tokenHash = params.get('token_hash')

  if (!tokenHash) {
    fallo.value = {
      motivo: 'invalido',
      mensaje: 'Falta el enlace de restablecimiento. Ábrelo desde el correo que te enviamos.',
    }
    estado.value = 'rechazado'
    return enfocarAviso()
  }

  const r = await canjearEnlace(tokenHash)

  // El testigo sale de la URL en cuanto se canjea, tanto si funcionó como si
  // no: mientras siga ahí, viaja en el historial y en cualquier cosa que
  // alguien copie de la barra de direcciones.
  limpiarUrl()

  if (r.ok) {
    estado.value = 'listo'
  } else {
    fallo.value = r
    estado.value = 'rechazado'
    await enfocarAviso()
  }
})

function limpiarUrl() {
  const url = new URL(window.location.href)
  url.search = ''
  window.history.replaceState({}, '', url.toString())
}

async function guardar() {
  if (!contrasenaValida(password.value) || guardando.value) return
  guardando.value = true
  errorGuardado.value = ''
  const { error } = await supabase.auth.updateUser({ password: password.value })
  guardando.value = false
  if (error) {
    errorGuardado.value = mapSupabaseError(error).message
    return
  }
  // `verifyOtp` dejó la sesión abierta, así que no hay que volver a entrar.
  estado.value = 'guardado'
  await enfocarAviso()
}
</script>

<template>
  <div class="auth-shell">
    <aside class="auth-aside" aria-hidden="true">
      <div class="auth-aside-inner">
        <p class="eyebrow auth-aside-kicker">{{ theme.nav.title }} · {{ theme.app.name }}</p>
        <h2 class="auth-aside-quote">Elige tu <em>contraseña nueva</em>.</h2>
        <p class="auth-aside-meta">
          {{ theme.org.name }}
        </p>
      </div>
    </aside>

    <section class="auth-form-wrap fade-in" aria-labelledby="rest-titulo">
      <div class="auth-form">
        <header class="auth-header">
          <p class="eyebrow">Restablecer contraseña</p>
          <h1 id="rest-titulo" class="display">Elegir contraseña nueva</h1>
          <p v-if="estado === 'canjeando'" class="auth-subtitle">Comprobando el enlace…</p>
          <p v-else-if="estado === 'listo'" class="auth-subtitle">
            Es la contraseña con la que entrarás a partir de ahora.
          </p>
        </header>

        <template v-if="estado === 'rechazado'">
          <div ref="refAviso" class="auth-aviso auth-aviso-problema" role="alert" tabindex="-1">
            {{ fallo.mensaje }}
          </div>
          <p class="auth-alt">
            <a href="#" @click.prevent="router.push({ name: 'recuperar' })"
              >Pedir un enlace nuevo</a
            >
          </p>
          <p v-if="fallo.motivo === 'usado'" class="auth-alt">
            <a href="#" @click.prevent="router.push({ name: 'login' })">Iniciar sesión</a>
          </p>
        </template>

        <template v-else-if="estado === 'listo'">
          <div class="auth-fields">
            <CampoContrasena
              id="nueva-password"
              v-model="password"
              label="Contraseña nueva"
              :error="errorGuardado"
            />
          </div>
          <button
            class="btn btn-primary auth-submit"
            :disabled="!contrasenaValida(password) || guardando"
            type="button"
            @click="guardar"
          >
            <template v-if="guardando"> Guardando… </template>
            <template v-else> Guardar contraseña <IconSet name="arrow" /> </template>
          </button>
        </template>

        <template v-else-if="estado === 'guardado'">
          <div ref="refAviso" class="auth-aviso" role="alert" tabindex="-1">
            Tu contraseña quedó cambiada y tu sesión está iniciada.
          </div>
          <p class="auth-alt">
            <a href="#" @click.prevent="router.push({ name: 'home' })">Ir a la plataforma</a>
          </p>
        </template>
      </div>
    </section>
  </div>
</template>
