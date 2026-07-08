<script setup>
import { ref, onMounted } from 'vue'
import {
  cargarPlantillas,
  actualizarPlantilla,
  cargarEmailConfig,
  guardarEmailConfig,
} from '@/services/notificaciones.js'

/* ────────── State ────────── */
const plantillas = ref([])
const plantillasLoading = ref(false)
const plantillasError = ref('')
const savingPlantilla = ref({})

const emailConfig = ref({
  proveedor: 'resend',
  api_key: '',
  email_remitente: '',
  nombre_remitente: '',
  activo: false,
})
const emailLoading = ref(false)
const emailError = ref('')
const emailSaving = ref(false)

const toast = ref({ show: false, message: '' })

/* ────────── Toast ────────── */
function showToast(message) {
  toast.value = { show: true, message }
  setTimeout(() => {
    toast.value.show = false
  }, 2000)
}

/* ────────── Plantillas ────────── */
async function loadPlantillas() {
  plantillasLoading.value = true
  plantillasError.value = ''
  try {
    plantillas.value = await cargarPlantillas()
  } catch (e) {
    plantillasError.value = e?.message || 'Error al cargar plantillas.'
  } finally {
    plantillasLoading.value = false
  }
}

async function onGuardarPlantilla(p) {
  savingPlantilla.value = { ...savingPlantilla.value, [p.tipo]: true }
  try {
    await actualizarPlantilla(p.tipo, {
      titulo: p.titulo,
      cuerpo: p.cuerpo,
      canal_default: p.canal_default,
      activa: p.activa,
    })
    showToast('Guardado \u2713')
  } catch (e) {
    plantillasError.value = e?.message || 'Error al guardar plantilla.'
  } finally {
    savingPlantilla.value = { ...savingPlantilla.value, [p.tipo]: false }
  }
}

/* ────────── Email config ────────── */
async function loadEmailConfig() {
  emailLoading.value = true
  emailError.value = ''
  try {
    const c = await cargarEmailConfig()
    emailConfig.value = {
      proveedor: c.proveedor || 'resend',
      api_key: c.api_key || '',
      email_remitente: c.email_remitente || '',
      nombre_remitente: c.nombre_remitente || '',
      activo: !!c.activo,
    }
  } catch (e) {
    emailError.value = e?.message || 'Error al cargar configuraci\u00f3n de email.'
  } finally {
    emailLoading.value = false
  }
}

async function onGuardarEmailConfig() {
  emailSaving.value = true
  emailError.value = ''
  try {
    await guardarEmailConfig({
      proveedor: emailConfig.value.proveedor,
      api_key: emailConfig.value.api_key,
      email_remitente: emailConfig.value.email_remitente,
      nombre_remitente: emailConfig.value.nombre_remitente,
      activo: emailConfig.value.activo,
    })
    showToast('Guardado \u2713')
  } catch (e) {
    emailError.value = e?.message || 'Error al guardar configuraci\u00f3n.'
  } finally {
    emailSaving.value = false
  }
}

onMounted(() => {
  loadPlantillas()
  loadEmailConfig()
})
</script>

<template>
  <div class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">
          Comunicaci&oacute;n
        </p>
        <h1
          class="display"
          :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
        >
          Notificaciones
        </h1>
      </div>
    </div>

    <!-- Toast -->
    <div
      v-if="toast.show"
      class="toast-notification"
    >
      {{ toast.message }}
    </div>

    <!-- Plantillas -->
    <div>
      <p
        class="eyebrow"
        :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
      >
        Plantillas
      </p>
      <p
        v-if="plantillasError"
        class="mono"
        :style="{ color: 'var(--primary)', marginBottom: 'calc(var(--unit) * 2)' }"
      >
        &#9888; {{ plantillasError }}
      </p>
      <div
        v-if="plantillasLoading"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        Cargando plantillas&hellip;
      </div>
      <div
        v-else-if="!plantillas.length"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        No hay plantillas registradas.
      </div>
      <div
        v-else
        :style="{
          display: 'flex',
          flexDirection: 'column',
          gap: 'calc(var(--unit) * 3)',
        }"
      >
        <div
          v-for="p in plantillas"
          :key="p.tipo"
          class="card"
        >
          <div class="field">
            <label :for="'titulo-' + p.tipo">T&iacute;tulo template</label>
            <input
              :id="'titulo-' + p.tipo"
              v-model="p.titulo"
              type="text"
            >
          </div>
          <div class="field">
            <label :for="'cuerpo-' + p.tipo">Cuerpo template</label>
            <textarea
              :id="'cuerpo-' + p.tipo"
              v-model="p.cuerpo"
              rows="4"
            />
          </div>
          <div class="field">
            <label :for="'canal-' + p.tipo">Canal default</label>
            <select
              :id="'canal-' + p.tipo"
              v-model="p.canal_default"
            >
              <option value="all">
                Todos
              </option>
              <option value="push">
                Push
              </option>
              <option value="email">
                Email
              </option>
              <option value="app">
                Solo app
              </option>
            </select>
          </div>
          <div
            class="field"
            :style="{ display: 'flex', alignItems: 'center', gap: '8px' }"
          >
            <input
              :id="'activa-' + p.tipo"
              v-model="p.activa"
              type="checkbox"
            >
            <label
              :for="'activa-' + p.tipo"
              :style="{ marginBottom: '0' }"
            >Activa</label>
          </div>
          <div
            :style="{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 'calc(var(--unit) * 2)',
            }"
          >
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="savingPlantilla[p.tipo]"
              @click="onGuardarPlantilla(p)"
            >
              {{ savingPlantilla[p.tipo] ? 'Guardando\u2026' : 'Guardar plantilla' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Configuraci&oacute;n de email -->
    <div>
      <p
        class="eyebrow"
        :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
      >
        Configuraci&oacute;n de email
      </p>
      <p
        v-if="emailError"
        class="mono"
        :style="{ color: 'var(--primary)', marginBottom: 'calc(var(--unit) * 2)' }"
      >
        &#9888; {{ emailError }}
      </p>
      <div
        v-if="emailLoading"
        class="card"
        :style="{
          padding: 'calc(var(--unit) * 4)',
          textAlign: 'center',
          color: 'var(--ink-3)',
        }"
      >
        Cargando configuraci&oacute;n&hellip;
      </div>
      <form
        v-else
        class="card"
        @submit.prevent="onGuardarEmailConfig"
      >
        <div class="field">
          <label for="email-proveedor">Proveedor</label>
          <select
            id="email-proveedor"
            v-model="emailConfig.proveedor"
          >
            <option value="resend">
              Resend
            </option>
            <option value="smtp">
              SMTP
            </option>
            <option value="sendgrid">
              SendGrid
            </option>
          </select>
        </div>
        <div class="field">
          <label for="email-apikey">API Key</label>
          <input
            id="email-apikey"
            v-model="emailConfig.api_key"
            type="password"
            placeholder="sk_..."
          >
        </div>
        <div class="field">
          <label for="email-remitente">Email remitente</label>
          <input
            id="email-remitente"
            v-model="emailConfig.email_remitente"
            type="email"
            placeholder="noreply@ejemplo.gob.mx"
          >
        </div>
        <div class="field">
          <label for="email-nombre">Nombre remitente</label>
          <input
            id="email-nombre"
            v-model="emailConfig.nombre_remitente"
            type="text"
            placeholder="Ej. Plataforma de Capacitaci&oacute;n"
          >
        </div>
        <div
          class="field"
          :style="{ display: 'flex', alignItems: 'center', gap: '8px' }"
        >
          <input
            id="email-activo"
            v-model="emailConfig.activo"
            type="checkbox"
          >
          <label
            for="email-activo"
            :style="{ marginBottom: '0' }"
          >
            Activar env&iacute;o de email
          </label>
        </div>
        <div
          :style="{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: 'calc(var(--unit) * 2)',
          }"
        >
          <button
            type="submit"
            class="btn btn-primary btn-sm"
            :disabled="emailSaving"
          >
            {{ emailSaving ? 'Guardando\u2026' : 'Guardar configuraci&oacute;n' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.toast-notification {
  position: fixed;
  bottom: calc(var(--unit) * 4);
  right: calc(var(--unit) * 4);
  background: var(--ink);
  color: var(--paper);
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 3);
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  animation: fadeInUp 200ms var(--ease);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
