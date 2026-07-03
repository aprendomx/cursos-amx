<script setup>
defineProps({
  label: { type: String, default: '' },
  dark: { type: Boolean, default: false },
})
</script>

<template>
  <div
    :class="dark ? 'ph-stripe-dark' : 'ph-stripe'"
    :data-label="label"
  />
</template>
