<script setup>
import { ref, computed } from 'vue'
import { useNotificaciones } from '@/composables/useNotificaciones.js'

const props = defineProps({
  onOpenPanel: {
    type: Function,
    default: () => {},
  },
})

const { notificaciones, unreadCount, marcarLeida } = useNotificaciones()

const open = ref(false)

const localUnreadCount = computed(() =>
  typeof unreadCount?.value === 'number' ? unreadCount.value : 0
)

const localNotificaciones = computed(() =>
  Array.isArray(notificaciones?.value) ? notificaciones.value : []
)

const badgeText = computed(() =>
  localUnreadCount.value > 99 ? '99+' : String(localUnreadCount.value)
)

const previewList = computed(() => localNotificaciones.value.slice(0, 5))

function toggleDropdown() {
  open.value = !open.value
}

function relativeTime(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Hace unos segundos'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`
  if (diff < 86400 * 30) return `Hace ${Math.floor(diff / 86400)} d`
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

async function handleNotificationClick(n) {
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

function handleVerTodas() {
  open.value = false
  props.onOpenPanel()
}
</script>

<template>
  <div class="notification-bell">
    <button
      class="bell-btn"
      :aria-label="`Notificaciones${localUnreadCount > 0 ? ` (${localUnreadCount} sin leer)` : ''}`"
      data-test="bell-button"
      @click="toggleDropdown"
    >
      <svg
        class="bell-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span
        v-if="localUnreadCount > 0"
        class="badge"
        data-test="badge"
      >{{ badgeText }}</span>
    </button>

    <div
      v-if="open"
      class="dropdown"
      data-test="dropdown"
    >
      <ul class="dropdown-list">
        <li
          v-for="n in previewList"
          :key="n.id"
          class="dropdown-item"
          :class="{ unread: !n.leido }"
          data-test="notification-item"
          @click="handleNotificationClick(n)"
        >
          <div class="item-title">
            {{ n.titulo }}
          </div>
          <div class="item-body">
            {{ n.cuerpo }}
          </div>
          <div class="item-time">
            {{ relativeTime(n.created_at) }}
          </div>
        </li>
      </ul>
      <div
        v-if="previewList.length === 0"
        class="dropdown-empty"
        data-test="empty-state"
      >
        Sin notificaciones
      </div>
      <button
        class="ver-todas"
        data-test="ver-todas"
        @click="handleVerTodas"
      >
        Ver todas
      </button>
    </div>
  </div>
</template>

<style scoped>
.notification-bell {
  position: relative;
  display: inline-block;
}
.bell-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border: none;
}
.bell-icon {
  width: 20px;
  height: 20px;
}
.badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  background: var(--paper);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
  z-index: 60;
}
.dropdown-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
}
.dropdown-item {
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 2);
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  transition: background 160ms var(--ease);
}
.dropdown-item:last-child {
  border-bottom: none;
}
.dropdown-item:hover {
  background: var(--paper-2);
}
.dropdown-item.unread {
  border-left: 3px solid var(--primary);
}
.item-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--ink);
  line-height: 1.3;
  margin-bottom: 2px;
}
.item-body {
  font-size: 12px;
  color: var(--ink-2);
  line-height: 1.4;
  margin-bottom: 4px;
}
.item-time {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-3);
  letter-spacing: 0.04em;
}
.dropdown-empty {
  padding: calc(var(--unit) * 2);
  text-align: center;
  font-size: 13px;
  color: var(--ink-3);
}
.ver-todas {
  width: 100%;
  padding: calc(var(--unit) * 1.5) calc(var(--unit) * 2);
  font-size: 13px;
  font-weight: 500;
  color: var(--primary);
  background: transparent;
  border: none;
  border-top: 1px solid var(--line);
  cursor: pointer;
  text-align: center;
  transition: background 160ms var(--ease);
}
.ver-todas:hover {
  background: var(--paper-2);
}
</style>
