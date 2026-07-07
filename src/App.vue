<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import TopNav from '@/components/TopNav.vue'
import TweaksPanel from '@/components/TweaksPanel.vue'
import OfflineBanner from '@/components/OfflineBanner.vue'
import { supabase } from '@/lib/supabase.js'
import { storageKey } from '@/lib/theme.js'
import { featureEnabled } from '@/lib/featureFlags'
import { registerSW } from 'virtual:pwa-register'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const offlineEnabled = featureEnabled('pwa_offline')

onMounted(() => {
  auth.init()
  if (offlineEnabled) {
    registerSW({
      onNeedRefresh() {},
      onOfflineReady() {},
    })
  }
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
        registroError.value = authError.message
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

      auth.hasRegistered = true
      try {
        localStorage.setItem(storageKey('registered'), 'true')
      } catch {}

      router.push('/')
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
    router.push(typeof redirect === 'string' ? redirect : '/')
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
    <TopNav
      v-if="showNav(route.name)"
      :user="auth.user"
      :session="auth.session"
      @logout="onLogout"
    />

    <div v-if="auth.authLoading && route.meta?.requiresAuth" class="auth-hydrating">Cargando…</div>

    <template v-else>
      <OfflineBanner />
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
    </template>

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
