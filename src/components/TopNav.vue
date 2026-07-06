<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { featureEnabled } from '@/lib/featureFlags.js'
import { theme } from '@/lib/theme.js'

const props = defineProps({
  user: { type: Object, default: () => ({}) },
  session: { type: Object, default: null },
})

const emit = defineEmits(['logout'])

const route = useRoute()
const router = useRouter()

const navLinks = [
  { name: 'home', label: 'Cursos' },
  { name: 'perfil', label: 'Mi aprendizaje' },
  { name: 'instructor', label: 'Instructor' },
  { name: 'admin', label: 'Admin' },
]

function linkVisible(link) {
  if (link.name === 'admin') return props.user?.es_admin === true
  if (link.name === 'instructor') {
    return (
      featureEnabled('instructor') &&
      (props.user?.es_instructor === true || props.user?.es_admin === true)
    )
  }
  return true
}

const drawerOpen = ref(false)

function isActive(linkName) {
  if (linkName === 'home') return ['home', 'curso', 'player'].includes(route.name)
  return route.name === linkName
}

function go(link) {
  router.push({ name: link.name })
  drawerOpen.value = false
}

watch(
  () => route.name,
  () => {
    drawerOpen.value = false
  }
)
</script>

<template>
  <header
    class="nav"
    :class="{ 'is-open': drawerOpen }"
  >
    <div class="nav-inner">
      <a
        class="nav-brand"
        href="#"
        :aria-label="`Inicio ${theme.app.name}`"
        @click.prevent="go({ name: 'home' })"
      >
        <img
          class="nav-brand-logo"
          :src="theme.logos.nav"
          :alt="theme.app.name"
        >
        <span
          class="nav-brand-divider"
          aria-hidden="true"
        />
        <span class="nav-brand-text">
          <strong>{{ theme.nav.title }}</strong>
          <span>{{ theme.nav.subtitle }}</span>
        </span>
      </a>

      <nav
        class="nav-links"
        aria-label="Principal"
      >
        <a
          v-for="link in navLinks"
          v-show="linkVisible(link)"
          :key="link.name"
          :class="{ active: isActive(link.name) }"
          href="#"
          @click.prevent="go(link)"
        >{{ link.label }}</a>
      </nav>

      <div class="nav-actions">
        <template v-if="session">
          <div
            class="nav-avatar"
            :title="user.nombre || ''"
            role="button"
            tabindex="0"
            @click="router.push({ name: 'perfil' })"
          >
            {{ user.iniciales || '?' }}
          </div>
          <button
            class="nav-logout-link"
            type="button"
            @click="emit('logout')"
          >
            Salir
          </button>
        </template>
        <template v-else>
          <button
            class="btn btn-sm btn-ghost"
            type="button"
            @click="router.push({ name: 'login' })"
          >
            Iniciar sesión
          </button>
          <button
            class="btn btn-sm btn-primary"
            type="button"
            @click="router.push({ name: 'registro' })"
          >
            Registro
          </button>
        </template>

        <button
          class="nav-toggle"
          :aria-expanded="drawerOpen"
          aria-controls="nav-drawer"
          aria-label="Abrir menú"
          type="button"
          @click="drawerOpen = !drawerOpen"
        >
          <span aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Drawer móvil -->
    <div
      v-if="drawerOpen"
      id="nav-drawer"
      class="nav-drawer"
      role="dialog"
      aria-label="Navegación principal"
    >
      <a
        v-for="link in navLinks"
        v-show="linkVisible(link)"
        :key="link.name"
        :class="{ active: isActive(link.name) }"
        href="#"
        @click.prevent="go(link)"
      >{{ link.label }}</a>

      <div class="nav-drawer-actions">
        <template v-if="session">
          <button
            class="btn btn-ghost"
            type="button"
            @click="
              () => {
                router.push({ name: 'perfil' })
                drawerOpen = false
              }
            "
          >
            Mi perfil
          </button>
          <button
            class="btn btn-primary"
            type="button"
            @click="
              () => {
                emit('logout')
                drawerOpen = false
              }
            "
          >
            Cerrar sesión
          </button>
        </template>
        <template v-else>
          <button
            class="btn btn-ghost"
            type="button"
            @click="
              () => {
                router.push({ name: 'login' })
                drawerOpen = false
              }
            "
          >
            Iniciar sesión
          </button>
          <button
            class="btn btn-primary"
            type="button"
            @click="
              () => {
                router.push({ name: 'registro' })
                drawerOpen = false
              }
            "
          >
            Registro
          </button>
        </template>
      </div>
    </div>
  </header>
</template>

<style scoped>
.nav-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.nav-logout-link {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  background: transparent;
  border: none;
  font-family: var(--mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 6px 8px;
}
.nav-logout-link:hover {
  color: var(--paper);
}

.nav-avatar {
  display: grid;
  place-items: center;
  cursor: pointer;
  user-select: none;
  outline: none;
}
.nav-avatar:focus-visible {
  box-shadow:
    inset 0 -3px 0 var(--brand-accent),
    0 0 0 2px var(--brand-accent);
}
</style>
