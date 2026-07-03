<script setup>
defineProps({
  minimal: { type: Boolean, default: false },
})
</script>

<template>
  <div class="nav-logo">
    <div class="nav-logo-mark">C</div>
    <div v-if="!minimal" class="nav-logo-text">
      <b>CONASAMA</b>
      <span>Plataforma &middot; Servidores p&uacute;blicos</span>
    </div>
  </div>
</template>
