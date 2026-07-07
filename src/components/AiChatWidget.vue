<script setup>
import { ref, nextTick } from 'vue'
import { useAiChatbot } from '@/composables/useAiChatbot.js'

const props = defineProps({
  context: { type: String, default: '' },
})

const ai = useAiChatbot()
const open = ref(false)
const input = ref('')
const messagesRef = ref(null)

function toggle() {
  open.value = !open.value
}

async function onEnviar() {
  const texto = input.value.trim()
  if (!texto) return
  input.value = ''
  await ai.enviarMensaje(texto, props.context)
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    onEnviar()
  }
}

function onCerrar() {
  open.value = false
  ai.limpiar()
}
</script>

<template>
  <div class="ai-chat-widget">
    <!-- Toggle button -->
    <button type="button" class="ai-chat-toggle" :class="{ open }" @click="toggle">
      <span v-if="open">×</span>
      <span v-else>💬</span>
    </button>

    <!-- Chat panel -->
    <div v-if="open" class="ai-chat-panel card">
      <div class="ai-chat-header">
        <h4 class="eyebrow">Asistente de estudio</h4>
        <button type="button" class="qe-icon" @click="onCerrar">×</button>
      </div>

      <div ref="messagesRef" class="ai-chat-messages">
        <div v-if="!ai.messages.value.length" class="ai-chat-empty caption">
          Escribe una pregunta sobre esta lección.
        </div>

        <div v-for="(msg, i) in ai.messages.value" :key="i" class="ai-chat-msg" :class="msg.role">
          <div class="ai-chat-bubble">
            {{ msg.content }}
          </div>
        </div>

        <div v-if="ai.loading.value" class="ai-chat-msg assistant">
          <div class="ai-chat-bubble ai-chat-typing">
            <span />
            <span />
            <span />
          </div>
        </div>

        <div v-if="ai.error.value" class="ai-chat-msg assistant">
          <div class="ai-chat-bubble ai-chat-error">
            {{ ai.error.value }}
          </div>
        </div>
      </div>

      <div class="ai-chat-input">
        <input
          v-model="input"
          type="text"
          placeholder="Escribe tu pregunta..."
          @keydown="onKeydown"
        />
        <button
          type="button"
          class="btn btn-primary"
          :disabled="ai.loading.value || !input.trim()"
          @click="onEnviar"
        >
          ➤
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-chat-widget {
  position: fixed;
  bottom: calc(var(--unit) * 4);
  right: calc(var(--unit) * 4);
  z-index: 90;
}
.ai-chat-toggle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
}
.ai-chat-toggle.open {
  transform: rotate(90deg);
}
.ai-chat-panel {
  position: absolute;
  bottom: 60px;
  right: 0;
  width: 360px;
  max-height: 520px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ai-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--unit) * 2) calc(var(--unit) * 3);
  border-bottom: 1px solid var(--ink-7);
}
.ai-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--unit) * 2) calc(var(--unit) * 3);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-chat-empty {
  text-align: center;
  color: var(--ink-4);
  padding: calc(var(--unit) * 4) 0;
}
.ai-chat-msg {
  display: flex;
}
.ai-chat-msg.user {
  justify-content: flex-end;
}
.ai-chat-msg.assistant {
  justify-content: flex-start;
}
.ai-chat-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.4;
}
.ai-chat-msg.user .ai-chat-bubble {
  background: var(--primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.ai-chat-msg.assistant .ai-chat-bubble {
  background: var(--surface-2);
  color: var(--ink-2);
  border-bottom-left-radius: 4px;
}
.ai-chat-error {
  background: var(--error-bg) !important;
  color: var(--error) !important;
}
.ai-chat-typing {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 24px;
}
.ai-chat-typing span {
  width: 6px;
  height: 6px;
  background: var(--ink-4);
  border-radius: 50%;
  animation: typing 1s infinite ease-in-out;
}
.ai-chat-typing span:nth-child(2) {
  animation-delay: 0.2s;
}
.ai-chat-typing span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes typing {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
.ai-chat-input {
  display: flex;
  gap: 8px;
  padding: calc(var(--unit) * 2) calc(var(--unit) * 3);
  border-top: 1px solid var(--ink-7);
}
.ai-chat-input input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--ink-7);
  border-radius: 8px;
  font-size: 14px;
}
.ai-chat-input .btn {
  padding: 8px 14px;
}
</style>
