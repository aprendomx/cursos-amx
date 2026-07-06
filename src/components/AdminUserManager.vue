<script setup>
import { ref, computed, onMounted } from 'vue'
import { listarUsuarios, setPassword } from '@/services/usuarios.js'

const props = defineProps({
  session: { type: Object, default: null },
})

/* ──────────────────────────────
   Usuarios (datos reales + reset de contraseña)
   ────────────────────────────── */
const usuarioSearch = ref('')
const usuarios = ref([])
const usuariosTotal = ref(0)
const usuariosPage = ref(0)
const usuariosPageSize = ref(25)
const usuariosLoading = ref(false)
const usuariosError = ref('')
let usuarioSearchTimer = null

async function cargarUsuarios() {
  usuariosLoading.value = true
  usuariosError.value = ''
  try {
    const { rows, total, pageSize } = await listarUsuarios({
      q: usuarioSearch.value,
      page: usuariosPage.value,
    })
    usuarios.value = rows
    usuariosTotal.value = total
    usuariosPageSize.value = pageSize
  } catch (e) {
    usuariosError.value = e?.message || 'Error al cargar usuarios.'
    usuarios.value = []
  } finally {
    usuariosLoading.value = false
  }
}

function onUsuarioSearch() {
  if (usuarioSearchTimer) clearTimeout(usuarioSearchTimer)
  usuarioSearchTimer = setTimeout(() => {
    usuariosPage.value = 0
    cargarUsuarios()
  }, 350)
}

const usuariosDesde = computed(() =>
  usuariosTotal.value === 0 ? 0 : usuariosPage.value * usuariosPageSize.value + 1
)
const usuariosHasta = computed(() =>
  Math.min((usuariosPage.value + 1) * usuariosPageSize.value, usuariosTotal.value)
)

function usuariosPrevPage() {
  if (usuariosPage.value > 0) {
    usuariosPage.value--
    cargarUsuarios()
  }
}
function usuariosNextPage() {
  if ((usuariosPage.value + 1) * usuariosPageSize.value < usuariosTotal.value) {
    usuariosPage.value++
    cargarUsuarios()
  }
}

function fechaAcceso(iso) {
  if (!iso) return 'Sin registro'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/* Modal de restablecer contraseña (el admin teclea la nueva). */
const pwModalOpen = ref(false)
const pwUser = ref(null)
const pwNew = ref('')
const pwConfirm = ref('')
const pwMsg = ref(null)
const pwLoading = ref(false)

function abrirReset(u) {
  pwUser.value = u
  pwNew.value = ''
  pwConfirm.value = ''
  pwMsg.value = null
  pwModalOpen.value = true
}
function cerrarReset() {
  if (pwLoading.value) return
  pwModalOpen.value = false
  pwUser.value = null
}
async function confirmarReset() {
  pwMsg.value = null
  if (pwNew.value.length < 8) {
    pwMsg.value = { type: 'error', text: 'La contraseña debe tener al menos 8 caracteres.' }
    return
  }
  if (pwNew.value !== pwConfirm.value) {
    pwMsg.value = { type: 'error', text: 'Las contraseñas no coinciden.' }
    return
  }
  pwLoading.value = true
  try {
    await setPassword(pwUser.value.id, pwNew.value)
    pwMsg.value = {
      type: 'ok',
      text: `Contraseña actualizada para ${pwUser.value.nombres_completos || pwUser.value.correo}.`,
    }
    pwNew.value = ''
    pwConfirm.value = ''
  } catch (e) {
    pwMsg.value = { type: 'error', text: e?.message || 'No se pudo restablecer la contraseña.' }
  } finally {
    pwLoading.value = false
  }
}

onMounted(cargarUsuarios)
</script>

<template>
  <div class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">
          Gesti&oacute;n
        </p>
        <h1
          class="display"
          :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
        >
          Usuarios
        </h1>
      </div>
    </div>

    <!-- Search -->
    <div
      class="field"
      :style="{ maxWidth: '400px', marginBottom: 'calc(var(--unit) * 3)' }"
    >
      <label>Buscar usuario</label>
      <input
        v-model="usuarioSearch"
        type="text"
        placeholder="Nombre o correo..."
        @input="onUsuarioSearch"
      >
    </div>

    <p
      v-if="usuariosError"
      class="mono"
      :style="{ color: 'var(--primary)', marginBottom: 'calc(var(--unit) * 2)' }"
    >
      &#9888; {{ usuariosError }}
    </p>

    <div
      class="card"
      :style="{ overflow: 'auto' }"
    >
      <table class="admin-table admin-table-full">
        <thead>
          <tr>
            <th class="mono">
              Nombre
            </th>
            <th class="mono">
              Dependencia
            </th>
            <th class="mono">
              Correo
            </th>
            <th class="mono">
              Rol
            </th>
            <th class="mono">
              &Uacute;ltimo acceso
            </th>
            <th class="mono" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="usuariosLoading">
            <td
              colspan="6"
              class="mono"
              :style="{ textAlign: 'center', color: 'var(--ink-4)', padding: '24px' }"
            >
              Cargando&hellip;
            </td>
          </tr>
          <tr v-else-if="!usuarios.length">
            <td
              colspan="6"
              class="mono"
              :style="{ textAlign: 'center', color: 'var(--ink-4)', padding: '24px' }"
            >
              Sin resultados.
            </td>
          </tr>
          <tr
            v-for="u in usuarios"
            :key="u.id"
          >
            <td :style="{ fontWeight: '500' }">
              {{ u.nombres_completos || '—' }}
            </td>
            <td>
              <span class="chip">{{ u.dependencias?.siglas || 'N/A' }}</span>
            </td>
            <td
              class="mono"
              :style="{ color: 'var(--ink-3)' }"
            >
              {{ u.correo }}
            </td>
            <td>
              <span
                v-if="u.es_admin"
                class="chip"
              >Admin</span>
              <span
                v-else-if="u.es_instructor"
                class="chip"
              >Instructor</span>
              <span
                v-else
                :style="{ color: 'var(--ink-4)' }"
              >&mdash;</span>
            </td>
            <td
              class="mono"
              :style="{ color: 'var(--ink-4)' }"
            >
              {{ fechaAcceso(u.actualizado_en) }}
            </td>
            <td>
              <button
                class="btn btn-ghost btn-sm"
                @click="abrirReset(u)"
              >
                Restablecer contrase&ntilde;a
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginaci&oacute;n -->
    <div
      :style="{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 'calc(var(--unit) * 2)',
      }"
    >
      <span
        class="mono"
        :style="{ color: 'var(--ink-4)', fontSize: '13px' }"
      >
        {{ usuariosDesde }}&ndash;{{ usuariosHasta }} de {{ usuariosTotal }}
      </span>
      <div :style="{ display: 'flex', gap: '8px' }">
        <button
          class="btn btn-ghost btn-sm"
          :disabled="usuariosPage === 0 || usuariosLoading"
          @click="usuariosPrevPage"
        >
          Anterior
        </button>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="usuariosHasta >= usuariosTotal || usuariosLoading"
          @click="usuariosNextPage"
        >
          Siguiente
        </button>
      </div>
    </div>

    <!-- Modal restablecer contrase&ntilde;a -->
    <div
      v-if="pwModalOpen"
      class="pw-overlay"
      role="dialog"
      aria-modal="true"
      @click.self="cerrarReset"
    >
      <div class="pw-modal card">
        <h3 :style="{ marginBottom: '4px', color: 'var(--ink)' }">
          Restablecer contrase&ntilde;a
        </h3>
        <p
          class="mono"
          :style="{
            color: 'var(--ink-3)',
            fontSize: '13px',
            marginBottom: 'calc(var(--unit) * 2)',
          }"
        >
          {{ pwUser?.nombres_completos || pwUser?.correo }}
        </p>
        <div
          class="field"
          :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
        >
          <label>Nueva contrase&ntilde;a</label>
          <input
            v-model="pwNew"
            type="password"
            autocomplete="new-password"
            placeholder="M&iacute;nimo 8 caracteres"
          >
        </div>
        <div
          class="field"
          :style="{ marginBottom: 'calc(var(--unit) * 2)' }"
        >
          <label>Confirmar contrase&ntilde;a</label>
          <input
            v-model="pwConfirm"
            type="password"
            autocomplete="new-password"
            @keyup.enter="confirmarReset"
          >
        </div>
        <p
          v-if="pwMsg"
          class="mono"
          :style="{
            fontSize: '13px',
            marginBottom: 'calc(var(--unit) * 2)',
            color: pwMsg.type === 'ok' ? '#2e9e6b' : 'var(--primary)',
          }"
        >
          {{ pwMsg.text }}
        </p>
        <div :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
          <button
            class="btn btn-ghost btn-sm"
            :disabled="pwLoading"
            @click="cerrarReset"
          >
            Cerrar
          </button>
          <button
            class="btn btn-sm"
            :disabled="pwLoading"
            @click="confirmarReset"
          >
            {{ pwLoading ? 'Guardando…' : 'Restablecer' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
