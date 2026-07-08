<script setup>
import { ref, computed } from 'vue'
import { useNotificaciones } from '@/composables/useNotificaciones.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const { notificaciones, loading, marcarLeida, marcarTodas } = useNotificaciones()

const filtro = ref('todas')

const localNotificaciones = computed(() =>
  Array.isArray(notificaciones?.value) ? notificaciones.value : []
)

const filtered = computed(() => {
  if (filtro.value === 'no_leidas') {
    return localNotificaciones.value.filter((n) => !n.leido)
  }
  return localNotificaciones.value
})

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

function getDateGroup(iso) {
  if (!iso) return 'Anteriores'
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date()
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, now)) return 'Hoy'
  if (isSameDay(d, yesterday)) return 'Ayer'
  return 'Anteriores'
}

const grupos = computed(() => {
  const g = { Hoy: [], Ayer: [], Anteriores: [] }
  for (const n of filtered.value) {
    const grupo = getDateGroup(n.created_at)
    g[grupo].push(n)
  }
  return g
})

function relativeTime(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Hace unos segundos'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  if (diff < 86400 * 30) return `Hace ${Math.floor(diff / 86400)} d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

async function handleClick(n) {
  if (!n.leido) {
    await marcarLeida(n.id)
  }
  if (n.datos?.url) {
    try {
      window.location.href = n.datos.url
    } catch {
      // noop — navigation blocked in some test environments
    }
  }
}

function handleOverlayClick(e) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}

async function handleMarcarTodas() {
  await marcarTodas()
}
</script>

<template>
  <div
    v-if="visible"
    class="np-overlay"
    data-test="notification-panel-overlay"
    @click="handleOverlayClick"
  >
    <div
      class="np-panel"
      data-test="notification-panel"
    >
      <header class="np-header">
        <h2 class="np-title">
          Notificaciones
        </h2>
        <div class="np-controls">
          <select
            v-model="filtro"
            class="np-filter"
            data-test="filter-select"
          >
            <option value="todas">
              Todas
            </option>
            <option value="no_leidas">
              No leídas
            </option>
          </select>
          <button
            class="np-mark-all"
            data-test="mark-all"
            @click="handleMarcarTodas"
          >
            Marcar todas
          </button>
          <button
            class="np-close"
            data-test="close-button"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
      </header>

      <div class="np-body">
        <div
          v-if="loading"
          class="np-loading"
          data-test="loading-state"
        >
          Cargando…
        </div>

        <div
          v-else-if="filtered.length === 0"
          class="np-empty"
          data-test="empty-state"
        >
          Sin notificaciones
        </div>

        <div
          v-else
          class="np-groups"
        >
          <div
            v-for="(items, grupo) in grupos"
            :key="grupo"
          >
            <div
              v-if="items.length > 0"
              class="np-group"
            >
              <h3
                class="np-group-title"
                data-test="group-title"
              >
                {{ grupo }}
              </h3>
              <ul class="np-list">
                <li
                  v-for="n in items"
                  :key="n.id"
                  class="np-item"
                  :class="{ unread: !n.leido }"
                  data-test="notification-item"
                  @click="handleClick(n)"
                >
                  <div class="np-item-title">
                    {{ n.titulo }}
                  </div>
                  <div class="np-item-body">
                    {{ n.cuerpo }}
                  </div>
                  <div class="np-item-time">
                    {{ relativeTime(n.created_at) }}
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.np-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(22, 26, 29, 0.55);
}
.np-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 400px;
  max-width: 100%;
  height: 100%;
  background: var(--paper);
  box-shadow: var(--shadow-pop);
  display: flex;
  flex-direction: column;
}
.np-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: calc(var(--unit) * 2) calc(var(--unit) * 2.5);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.np-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  margin: 0;
}
.np-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.np-filter {
  font-size: 13px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
}
.np-mark-all {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  white-space: nowrap;
  transition: background 160ms var(--ease);
}
.np-mark-all:hover {
  background: var(--paper-2);
}
.np-close {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--ink-2);
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 160ms var(--ease);
}
.np-close:hover {
  background: var(--paper-2);
}
.np-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.np-loading {
  padding: calc(var(--unit) * 3);
  text-align: center;
  font-size: 13px;
  color: var(--ink-3);
}
.np-empty {
  padding: calc(var(--unit) * 4);
  text-align: center;
  font-size: 13px;
  color: var(--ink-3);
}
.np-group {
  padding: calc(var(--unit) * 1) 0;
}
.np-group-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-3);
  padding: calc(var(--unit) * 1) calc(var(--unit) * 2.5);
  margin: 0;
}
.np-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.np-item {
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 2.5);
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  transition: background 160ms var(--ease);
}
.np-item:last-child {
  border-bottom: none;
}
.np-item:hover {
  background: var(--paper-2);
}
.np-item.unread {
  background: var(--primary-100);
}
.np-item-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--ink);
  line-height: 1.3;
  margin-bottom: 2px;
}
.np-item-body {
  font-size: 12px;
  color: var(--ink-2);
  line-height: 1.4;
  margin-bottom: 4px;
}
.np-item-time {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: 0.04em;
}
</style>
