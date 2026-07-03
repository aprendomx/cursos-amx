<script setup>
import IconSet from './IconSet.vue'

const props = defineProps({
  tweaks: {
    type: Object,
    default: () => ({
      primary: 'brand',
      density: 'cozy',
      playerLayout: 'split',
      liveChat: true,
    }),
  },
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['update:tweaks', 'close'])

function set(key, value) {
  emit('update:tweaks', { ...props.tweaks, [key]: value })
}

function toggleChat() {
  set('liveChat', !props.tweaks.liveChat)
}
</script>

<template>
  <div v-if="visible" class="tweaks-panel">
    <div class="tweaks-header">
      <h4>Ajustes de vista</h4>
      <button class="tweaks-close" @click="emit('close')">
        <IconSet name="close" />
      </button>
    </div>

    <!-- Primary color -->
    <div class="tweaks-row">
      <label>Color primario</label>
      <div class="tweaks-segment">
        <button :class="{ on: tweaks.primary === 'brand' }" @click="set('primary', 'brand')">
          Principal
        </button>
        <button :class="{ on: tweaks.primary === 'secondary' }" @click="set('primary', 'secondary')">
          Alterno
        </button>
      </div>
    </div>

    <!-- Density -->
    <div class="tweaks-row">
      <label>Densidad</label>
      <div class="tweaks-segment">
        <button :class="{ on: tweaks.density === 'compact' }" @click="set('density', 'compact')">
          Compacto
        </button>
        <button :class="{ on: tweaks.density === 'cozy' }" @click="set('density', 'cozy')">
          Normal
        </button>
        <button :class="{ on: tweaks.density === 'spacious' }" @click="set('density', 'spacious')">
          Amplio
        </button>
      </div>
    </div>

    <!-- Player layout -->
    <div class="tweaks-row">
      <label>Reproductor</label>
      <div class="tweaks-segment">
        <button
          :class="{ on: tweaks.playerLayout === 'split' }"
          @click="set('playerLayout', 'split')"
        >
          Split
        </button>
        <button
          :class="{ on: tweaks.playerLayout === 'stacked' }"
          @click="set('playerLayout', 'stacked')"
        >
          Stacked
        </button>
        <button
          :class="{ on: tweaks.playerLayout === 'focus' }"
          @click="set('playerLayout', 'focus')"
        >
          Focus
        </button>
      </div>
    </div>

    <!-- Live chat toggle -->
    <div class="tweaks-row">
      <div class="tweaks-toggle">
        <span>Chat en vivo</span>
        <div class="tweaks-switch" :class="{ on: tweaks.liveChat }" @click="toggleChat" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tweaks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tweaks-header h4 {
  margin-bottom: 0;
}
.tweaks-close {
  color: var(--ink-4);
  padding: 4px;
  transition: color 180ms var(--ease);
}
.tweaks-close:hover {
  color: var(--paper);
}
/* Push first row below header */
.tweaks-panel .tweaks-row:first-of-type {
  margin-top: 14px;
}
</style>
