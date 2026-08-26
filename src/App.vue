<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import TopNav from '@/components/TopNav.vue'
import TweaksPanel from '@/components/TweaksPanel.vue'
import OfflineBanner from '@/components/OfflineBanner.vue'
import AvisoReaceptacion from '@/components/AvisoReaceptacion.vue'

// Con enrutado por hash, un `href="#contenido-principal"` cambiaría la RUTA en
// vez de saltar al ancla. Se mueve el foco a mano, que además es lo que hace
// falta: sin foco, el lector de pantalla seguiría leyendo desde la navegación.
function enfocarContenido(e) {
  e.preventDefault()
  document.getElementById('contenido-principal')?.focus()
}
import { supabase } from '@/lib/supabase.js'
import { mapSupabaseError } from '@/lib/errors'
import { storageKey } from '@/lib/theme.js'
import { featureEnabled } from '@/lib/featureFlags'
import { useAppUpdate } from '@/composables/useAppUpdate.js'
import { registrarEventoPortada } from '@/composables/useEventosPortada.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const offlineEnabled = featureEnabled('pwa_offline')

// Avisa cuando hay una versión nueva desplegada y permite aplicarla sin que
// el usuario tenga que descubrir por su cuenta que debe recargar.
const { nuevaVersionDisponible, actualizarAhora } = useAppUpdate({ enabled: offlineEnabled })

onMounted(() => {
  auth.init()
})

const registroLoading = ref(false)
const registroError = ref('')

async function onRegistroComplete(form) {
  registroLoading.value = true
  registroError.value = ''

  if (form?.correo && form?.password) {
    try {
      let dependenciaId = null
      if (form.dependencia) {
        const { data: dep } = await supabase
          .from('dependencias')
          .select('id')
          .eq('nombre', form.dependencia)
          .single()
        dependenciaId = dep?.id || null
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.correo,
        password: form.password,
        options: {
          data: {
            nombres: form.nombres || '',
            apellido_paterno: form.apellido_p || '',
            apellido_materno: form.apellido_s || '',
            telefono_movil: form.telefono || '',
            dependencia_id: dependenciaId != null ? String(dependenciaId) : '',
            cargo: form.cargo || '',
            aviso_privacidad: form.acepta ? 'true' : 'false',
          },
        },
      })
      if (authError) {
        // El mensaje crudo de la librería llega en inglés y en su jerga
        // («Failed to fetch», «User already registered»). mapSupabaseError
        // traduce los casos que este repositorio produce —incluido el de una
        // instalación sin aviso de privacidad publicado, que es el que se
        // encuentra quien intenta registrarse antes de que un administrador lo
        // publique.
        registroError.value = mapSupabaseError(authError).message
        registroLoading.value = false
        return
      }

      const userId = authData.user?.id
      if (!userId) {
        registroError.value = 'No se pudo crear la cuenta. Intenta de nuevo.'
        registroLoading.value = false
        return
      }

      if (authData.session) {
        await auth.fetchPerfil(userId)
      }

      // El único punto donde el alta REALMENTE prosperó: signUp aceptado y
      // perfil en marcha. Cierra el embudo que abre `registro_iniciado`.
      registrarEventoPortada('registro_completado', { seccion: 'registro' })

      auth.hasRegistered = true
      try {
        localStorage.setItem(storageKey('registered'), 'true')
      } catch {}

      // Con sesión viva el alta aterriza en «Hoy»; sin sesión (confirmación
      // por correo pendiente) la portada, porque /hoy rebotaría al login.
      router.push(authData.session ? { name: 'hoy' } : '/')
    } catch (e) {
      console.error('Registro error:', e)
      registroError.value = 'Error inesperado: ' + (e?.message || String(e))
    }
  } else {
    auth.hasRegistered = true
    try {
      localStorage.setItem(storageKey('registered'), 'true')
    } catch {}
    router.push('/')
  }
  registroLoading.value = false
}

const loginLoading = ref(false)
const loginError = ref('')

async function onLogin({ correo, password }) {
  loginLoading.value = true
  loginError.value = ''
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo,
      password,
    })
    if (error) {
      loginError.value =
        error.message === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos'
          : error.message
      loginLoading.value = false
      return
    }
    await auth.fetchPerfil(data.user.id)
    auth.hasRegistered = true
    try {
      localStorage.setItem(storageKey('registered'), 'true')
    } catch {}
    const redirect = route.query.redirect
    // Sin destino pendiente, el login cae en «Hoy»: la pantalla que responde
    // dónde seguir, no el catálogo.
    router.push(typeof redirect === 'string' ? redirect : { name: 'hoy' })
  } catch (e) {
    loginError.value = 'Error inesperado: ' + e.message
  }
  loginLoading.value = false
}

async function onLogout() {
  await auth.logout()
  router.push('/')
}

const showNav = (name) => name !== 'registro' && name !== 'verificar'
</script>

<template>
  <div class="app">
    <!-- Primer elemento enfocable de toda la aplicación. Sin él, quien navega
         con teclado tabula por la navegación entera en CADA página antes de
         llegar al contenido. Se ve solo al recibir el foco. -->
    <a class="salto-contenido" href="#contenido-principal" @click="enfocarContenido">
      Saltar al contenido
    </a>

    <TopNav
      v-if="showNav(route.name)"
      :user="auth.user"
      :session="auth.session"
      @logout="onLogout"
    />

    <div v-if="auth.authLoading && route.meta?.requiresAuth" class="auth-hydrating">Cargando…</div>

    <template v-else>
      <OfflineBanner />
      <div v-if="nuevaVersionDisponible" class="update-banner" role="status" aria-live="polite">
        <span>Hay una nueva versión de la plataforma.</span>
        <button class="update-banner-btn" @click="actualizarAhora">Actualizar</button>
      </div>
      <main id="contenido-principal" tabindex="-1">
        <router-view
          :session="auth.session"
          :tweaks="ui.tweaks"
          :has-registered="auth.hasRegistered"
          :loading="loginLoading"
          :error="loginError"
          :registro-loading="registroLoading"
          :registro-error="registroError"
          @login="onLogin"
          @complete="onRegistroComplete"
          @update:tweaks="ui.updateTweaks"
        />
      </main>
    </template>

    <!-- El aviso cambió y exige volver a aceptarlo. No bloquea el acceso. -->
    <AvisoReaceptacion :session="auth.session" />

    <!-- Floating tweaks FAB -->
    <button v-if="!ui.tweaksOpen" class="tweaks-fab" title="Abrir Tweaks" @click="ui.openTweaks">
      TWK
    </button>

    <TweaksPanel
      :tweaks="ui.tweaks"
      :theme="ui.theme"
      :visible="ui.tweaksOpen"
      @update:tweaks="ui.updateTweaks"
      @update:theme="ui.updateTheme"
      @close="ui.closeTweaks"
    />
  </div>
</template>

<style scoped>
.update-banner {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--ink, #1a1a1a);
  color: var(--paper, #fff);
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}
.update-banner-btn {
  background: var(--paper, #fff);
  color: var(--ink, #1a1a1a);
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
}
.auth-hydrating {
  min-height: 60vh;
  display: grid;
  place-items: center;
  color: var(--muted, #777);
  font-family: var(--mono, monospace);
  font-size: 0.85rem;
  letter-spacing: 0.05em;
}
.tweaks-fab {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 90;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--paper);
  display: grid;
  place-items: center;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.14em;
  cursor: pointer;
  border: none;
}
</style>
