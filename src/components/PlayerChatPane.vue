<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import IconSet from '@/components/IconSet.vue'

const props = defineProps({
  comentarios: { type: Array, required: true },
  draft: { type: String, default: '' },
})

const emit = defineEmits(['send', 'update:draft'])

const draftModel = computed({
  get: () => props.draft,
  set: (val) => emit('update:draft', val),
})

const chatContainerRef = ref(null)

watch(
  () => props.comentarios,
  () => {
    nextTick(() => {
      if (chatContainerRef.value) {
        chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
      }
    })
  },
  { deep: true }
)

function handleSend() {
  emit('send')
}
</script>

<template>
  <div class="chat-pane">
    <div class="chat-header">
      <span class="eyebrow">{{ $t('chat.eyebrow') }}</span>
      <div class="chat-header-row">
        <h3 class="chat-title display">
          {{ $t('chat.title') }}
        </h3>
        <span class="chat-live-dot pulsing" />
      </div>
    </div>
    <div
      ref="chatContainerRef"
      class="chat-messages"
    >
      <div
        v-for="c in comentarios"
        :key="c.id"
        class="chat-msg"
        :class="{ 'chat-msg-incoming': c.incoming, 'chat-msg-destacado': c.destacado }"
      >
        <div
          class="chat-avatar"
          :class="{ 'chat-avatar-instructor': c.esInstructor }"
        >
          {{ c.user.charAt(0) }}
        </div>
        <div class="chat-body">
          <div class="chat-meta">
            <span class="chat-name">{{ c.user }}</span>
            <span
              v-if="c.esInstructor"
              class="chat-badge-instructor mono"
            >{{
              $t('chat.badgeInstructor')
            }}</span>
            <span class="chat-dep mono">{{ c.dep }}</span>
            <span class="chat-time">{{ c.t }}</span>
          </div>
          <p class="chat-text">
            {{ c.texto }}
          </p>
        </div>
      </div>
    </div>
    <div class="chat-input-bar">
      <input
        v-model="draftModel"
        type="text"
        :placeholder="$t('chat.placeholder')"
        @keydown.enter="handleSend"
      >
      <button
        class="chat-send"
        @click="handleSend"
      >
        <IconSet name="send" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ─── Chat pane ──────────────────────────────────── */
.chat-pane {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.03);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.chat-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.chat-header .eyebrow {
  color: var(--brand-accent);
  margin-bottom: 4px;
  display: block;
}

.chat-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-title {
  font-size: 24px;
  color: var(--paper);
}

.chat-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
}

/* ─── Chat messages ──────────────────────────────── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-messages::-webkit-scrollbar {
  width: 4px;
}
.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.chat-msg {
  display: flex;
  gap: 10px;
  animation: fadeIn 280ms var(--ease) both;
}

.chat-msg-incoming {
  animation: slideInRight 320ms var(--ease) both;
}

/* Comentario destacado por instructor: barra oro a la izquierda */
.chat-msg-destacado {
  box-shadow: inset 3px 0 0 var(--brand-accent);
  padding-left: 8px;
}

.chat-badge-instructor {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--brand-ink, #161a1d);
  background: var(--brand-accent);
  padding: 1px 6px;
  border-radius: 3px;
}

.chat-avatar-instructor {
  background: var(--brand-accent);
  color: var(--brand-ink, #161a1d);
}

.chat-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--brand-accent);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  font-family: var(--ui);
}

.chat-body {
  min-width: 0;
}

.chat-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 3px;
  flex-wrap: wrap;
}

.chat-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--paper);
}

.chat-dep {
  font-size: 10px;
  color: var(--brand-accent);
}

.chat-time {
  font-size: 11px;
  color: var(--ink-4);
}

.chat-text {
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
}

/* ─── Chat input ─────────────────────────────────── */
.chat-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.chat-input-bar input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--paper);
  outline: none;
  transition: border-color 180ms var(--ease);
}
.chat-input-bar input::placeholder {
  color: var(--ink-4);
  font-family: var(--ui);
  font-style: normal;
}
.chat-input-bar input:focus {
  border-color: rgba(255, 255, 255, 0.2);
}

.chat-send {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--brand-accent);
  color: var(--ink);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition:
    transform 120ms var(--ease),
    opacity 120ms;
}
.chat-send:hover {
  transform: scale(1.06);
}
</style>
