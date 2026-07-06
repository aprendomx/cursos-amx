<script setup>
import { theme } from '@/lib/theme.js'

defineProps({
  minimal: { type: Boolean, default: false },
})
</script>

<template>
  <div class="nav-logo">
    <div class="nav-logo-mark">
      {{ theme.logos.mark }}
    </div>
    <div v-if="!minimal" class="nav-logo-text">
      <b>{{ theme.app.name }}</b>
      <span>{{ theme.app.tagline }}</span>
    </div>
  </div>
</template>
