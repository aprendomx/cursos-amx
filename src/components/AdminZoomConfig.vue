<script setup>
import { ref, onMounted } from 'vue'
import { guardarConfiguracionZoom, obtenerConfiguracionZoom } from '@/services/zoom.js'

const config = ref({
  client_id: '',
  client_secret: '',
  account_id: '',
})
const guardando = ref(false)
const mensaje = ref('')

async function cargar() {
  try {
    const data = await obtenerConfiguracionZoom()
    if (data) {
      config.value.client_id = data.client_id || ''
      config.value.client_secret = data.client_secret || ''
      config.value.account_id = data.account_id || ''
    }
  } catch (e) {
    console.error(e)
  }
}

async function guardar() {
  guardando.value = true
  mensaje.value = ''
  try {
    await guardarConfiguracionZoom({
      client_id: config.value.client_id,
      client_secret: config.value.client_secret,
      account_id: config.value.account_id,
    })
    mensaje.value = 'Configuración guardada.'
  } catch (e) {
    mensaje.value = e?.message || 'Error al guardar'
  } finally {
    guardando.value = false
  }
}

onMounted(cargar)
</script>

<template>
  <div class="admin-zoom-config">
    <h3>Configuración Zoom</h3>
    <p class="hint">
      Credenciales de Server-to-Server OAuth de Zoom.
      <a
        href="https://developers.zoom.us/docs/internal-apps/s2s-oauth/"
        target="_blank"
        rel="noopener"
        >Documentación</a
      >
    </p>

    <div class="field-row">
      <label class="field-label">Client ID</label>
      <input v-model="config.client_id" type="text" data-test="client-id" />
    </div>

    <div class="field-row">
      <label class="field-label">Client Secret</label>
      <input v-model="config.client_secret" type="password" data-test="client-secret" />
    </div>

    <div class="field-row">
      <label class="field-label">Account ID</label>
      <input v-model="config.account_id" type="text" data-test="account-id" />
    </div>

    <button
      class="btn-primary"
      :disabled="guardando || !config.client_id || !config.client_secret || !config.account_id"
      data-test="guardar-btn"
      @click="guardar"
    >
      {{ guardando ? 'Guardando...' : 'Guardar' }}
    </button>

    <p v-if="mensaje" class="mensaje" data-test="mensaje">
      {{ mensaje }}
    </p>
  </div>
</template>

<style scoped>
.admin-zoom-config {
  max-width: 600px;
}
.admin-zoom-config h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: calc(var(--unit));
}
.hint {
  font-size: 12px;
  color: var(--ink-4);
  margin-bottom: calc(var(--unit) * 2);
}
.hint a {
  color: var(--primary);
}
.field-row {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 0.5);
  margin-bottom: calc(var(--unit) * 1.5);
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
input {
  padding: calc(var(--unit)) calc(var(--unit) * 1.5);
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper);
  color: var(--ink);
  font-size: 13px;
}
input:focus {
  outline: none;
  border-color: var(--primary);
}
.btn-primary {
  padding: calc(var(--unit)) calc(var(--unit) * 2);
  border-radius: 4px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mensaje {
  margin-top: calc(var(--unit));
  font-size: 13px;
  color: var(--ink-3);
}
</style>
