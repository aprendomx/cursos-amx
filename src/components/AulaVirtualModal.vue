<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { crearSalaJitsi } from '@/composables/useJitsi.js'
import { featureEnabled } from '@/lib/featureFlags.js'
import ChatPanel from '@/components/ChatPanel.vue'

const props = defineProps({
  sesion: { type: Object, required: true }, // fila de sesiones_virtuales con jitsi_room_id
  session: { type: Object, default: null }, // sesión de auth (para el chat)
  perfil: { type: Object, default: null },
  esInstructor: { type: Boolean, default: false },
})

// Chat contextual del aula (módulo 5) activo durante la sesión
const chatActivo = featureEnabled('chat')
const chatVisible = ref(true)

const emit = defineEmits(['close', 'terminar'])

const jitsiContainer = ref(null)
const cargando = ref(true)
const error = ref('')
let api = null

onMounted(async () => {
  if (!props.sesion?.jitsi_room_id) {
    error.value = 'La sesión no tiene sala asignada todavía.'
    cargando.value = false
    return
  }
  try {
    api = await crearSalaJitsi({
      roomName: props.sesion.jitsi_room_id,
      parentNode: jitsiContainer.value,
      displayName: props.perfil
        ? `${props.perfil.nombres || ''} ${props.perfil.apellido_paterno || ''}`.trim()
        : '',
      email: props.perfil?.correo || '',
    })
    api.on('readyToClose', () => emit('close'))
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    cargando.value = false
  }
})

onBeforeUnmount(() => {
  if (api) {
    api.dispose()
    api = null
  }
})

function onTerminar() {
  if (!confirm('¿Terminar la sesión para todos los participantes?')) return
  emit('terminar')
}
</script>

<template>
  <div
    class="aula-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="sesion.titulo"
  >
    <div class="aula-modal">
      <header class="aula-header">
        <div class="aula-title">
          <span class="aula-live mono"><span class="aula-dot" /> EN VIVO</span>
          <h2>{{ sesion.titulo }}</h2>
        </div>
        <div class="aula-actions">
          <button
            v-if="chatActivo && session"
            class="btn btn-ghost btn-sm aula-cerrar"
            @click="chatVisible = !chatVisible"
          >
            {{ chatVisible ? 'Ocultar chat' : 'Mostrar chat' }}
          </button>
          <button
            v-if="esInstructor"
            class="btn btn-primary btn-sm"
            @click="onTerminar"
          >
            Terminar sesión
          </button>
          <button
            class="btn btn-ghost btn-sm aula-cerrar"
            @click="emit('close')"
          >
            Salir
          </button>
        </div>
      </header>

      <div class="aula-body">
        <div class="aula-video">
          <p
            v-if="cargando"
            class="aula-estado mono"
          >
            Conectando al aula…
          </p>
          <p
            v-else-if="error"
            class="aula-estado aula-error mono"
          >
            ⚠ {{ error }}
          </p>
          <div
            ref="jitsiContainer"
            class="aula-jitsi"
          />
        </div>
        <aside
          v-if="chatActivo && session && chatVisible"
          class="aula-chat"
        >
          <ChatPanel
            :curso-id="sesion.curso_id"
            :sesion-id="sesion.id"
            :session="session"
            :perfil="perfil"
            tema="oscuro"
            titulo="Chat del aula"
          />
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.aula-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(22, 26, 29, 0.92);
  display: grid;
  place-items: center;
  padding: calc(var(--unit) * 2);
}
.aula-modal {
  width: min(1200px, 100%);
  height: min(86vh, 100%);
  background: var(--brand-ink, #161a1d);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}
.aula-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
}
.aula-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.aula-title h2 {
  font-size: 15px;
  color: var(--paper, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.aula-live {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: #ff6b6b;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.aula-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff6b6b;
  animation: aulaPulse 1.4s ease-in-out infinite;
}
@keyframes aulaPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
.aula-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.aula-cerrar {
  color: rgba(255, 255, 255, 0.8);
}
.aula-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}
.aula-video {
  position: relative;
  flex: 1;
  min-width: 0;
}
.aula-chat {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
@media (max-width: 860px) {
  .aula-chat {
    display: none;
  }
}
.aula-jitsi {
  width: 100%;
  height: 100%;
}
.aula-jitsi :deep(iframe) {
  border: 0;
}
.aula-estado {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}
.aula-error {
  color: #ff9f9f;
}
</style>
