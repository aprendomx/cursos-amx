<script setup>
import { ref, onMounted } from 'vue'
import { obtenerConfigIA, actualizarConfigIA } from '@/services/aiService'

const config = ref(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude (Anthropic)' },
]

async function cargar() {
  loading.value = true
  error.value = ''
  try {
    config.value = await obtenerConfigIA()
  } catch (e) {
    error.value = e?.message || 'Error al cargar configuración.'
  } finally {
    loading.value = false
  }
}

async function onGuardar() {
  saving.value = true
  error.value = ''
  try {
    config.value = await actualizarConfigIA(config.value)
  } catch (e) {
    error.value = e?.message || 'Error al guardar configuración.'
  } finally {
    saving.value = false
  }
}

onMounted(cargar)
</script>

<template>
  <div>
    <h2 class="h3">Configuración de IA</h2>
    <p class="body-2" :style="{ color: 'var(--ink-4)', marginBottom: 'calc(var(--unit) * 3)' }">
      Administra el proveedor de IA, modelo y límites de uso.
    </p>

    <div v-if="loading" class="body-2" :style="{ color: 'var(--ink-4)' }">Cargando…</div>

    <div v-else-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <div
      v-else-if="config"
      class="card"
      :style="{ maxWidth: '520px', padding: 'calc(var(--unit) * 3)' }"
    >
      <div class="field">
        <label>Proveedor</label>
        <select v-model="config.provider">
          <option v-for="p in PROVIDERS" :key="p.value" :value="p.value">
            {{ p.label }}
          </option>
        </select>
      </div>

      <div class="field">
        <label>Modelo</label>
        <input v-model="config.model" type="text" placeholder="gpt-4o-mini" />
      </div>

      <div class="field">
        <label>API Key</label>
        <input v-model="config.api_key_encrypted" type="password" placeholder="sk-..." />
        <span class="caption" :style="{ color: 'var(--ink-4)' }">
          Se almacena encriptada. En producción usar Supabase Vault.
        </span>
      </div>

      <div class="field">
        <label>Max tokens por día</label>
        <input v-model.number="config.max_tokens_per_day" type="number" min="1000" />
      </div>

      <div class="field">
        <label class="checkbox-label">
          <input v-model="config.active" type="checkbox" />
          Activar IA
        </label>
      </div>

      <div :style="{ display: 'flex', gap: '8px', marginTop: 'calc(var(--unit) * 3)' }">
        <button type="button" class="btn btn-primary" :disabled="saving" @click="onGuardar">
          {{ saving ? 'Guardando…' : 'Guardar' }}
        </button>
      </div>
    </div>
  </div>
</template>
