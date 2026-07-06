<script setup>
import { reactive, ref, onMounted } from 'vue'
import IconSet from '@/components/IconSet.vue'
import { getConstanciaConfig, updateConstanciaConfig } from '@/services/constanciaConfig.js'

const constConfig = reactive({
  titular_nombre: '',
  titular_cargo: '',
  lugar: '',
})
const constConfigLoading = ref(false)
const constConfigSaving = ref(false)
const constConfigMsg = ref('')

async function loadConstConfig() {
  constConfigLoading.value = true
  try {
    const c = await getConstanciaConfig()
    constConfig.titular_nombre = c.titular_nombre || ''
    constConfig.titular_cargo = c.titular_cargo || ''
    constConfig.lugar = c.lugar || ''
  } finally {
    constConfigLoading.value = false
  }
}

async function saveConstConfig() {
  if (constConfigSaving.value) return
  constConfigSaving.value = true
  constConfigMsg.value = ''
  try {
    await updateConstanciaConfig({
      titular_nombre: constConfig.titular_nombre,
      titular_cargo: constConfig.titular_cargo,
      lugar: constConfig.lugar,
    })
    constConfigMsg.value = '\u2713 Guardado'
    setTimeout(() => {
      constConfigMsg.value = ''
    }, 3000)
  } catch (err) {
    constConfigMsg.value = '\u26a0 ' + (err?.message || String(err))
  } finally {
    constConfigSaving.value = false
  }
}

onMounted(loadConstConfig)
</script>

<template>
  <div class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Plataforma</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
          Configuraci&oacute;n de la constancia
        </h1>
        <p
          :style="{
            marginTop: '8px',
            color: 'var(--ink-3)',
            fontSize: '14px',
            lineHeight: '1.55',
          }"
        >
          Datos del firmante que aparecen al pie de cada constancia emitida. Estos valores son
          globales y se aplican a partir de las pr&oacute;ximas constancias generadas.
        </p>
      </div>
    </div>
    <div v-if="constConfigLoading" class="config-card">
      <span class="mono" :style="{ color: 'var(--ink-3)' }">Cargando…</span>
    </div>
    <form v-else class="config-card" @submit.prevent="saveConstConfig">
      <div class="field">
        <label for="cs-titular">Nombre del titular</label>
        <input
          id="cs-titular"
          v-model="constConfig.titular_nombre"
          type="text"
          placeholder="Ej. Dr. Juan P&eacute;rez Garc&iacute;a"
          maxlength="120"
        />
      </div>
      <div class="field">
        <label for="cs-cargo">Cargo del titular</label>
        <input
          id="cs-cargo"
          v-model="constConfig.titular_cargo"
          type="text"
          placeholder="Ej. Titular de la instituci&oacute;n"
          maxlength="160"
        />
      </div>
      <div class="field">
        <label for="cs-lugar">Lugar de emisi&oacute;n</label>
        <input
          id="cs-lugar"
          v-model="constConfig.lugar"
          type="text"
          placeholder="Ej. Ciudad de M&eacute;xico"
          maxlength="80"
        />
      </div>
      <div class="config-actions">
        <button type="submit" class="btn btn-primary" :disabled="constConfigSaving">
          <template v-if="constConfigSaving"> Guardando… </template>
          <template v-else> Guardar cambios <IconSet name="arrow" /> </template>
        </button>
        <span v-if="constConfigMsg" class="mono config-msg">{{ constConfigMsg }}</span>
      </div>
    </form>
  </div>
</template>
