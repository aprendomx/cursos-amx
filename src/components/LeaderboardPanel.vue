<script setup>
import { ref, watch } from 'vue'
import { obtenerLeaderboard } from '@/services/gamificacion.js'

const props = defineProps({
  cursoId: { type: String, required: true },
})

const leaderboard = ref([])
const loading = ref(false)
const error = ref(null)

async function cargarLeaderboard() {
  if (!props.cursoId) return
  loading.value = true
  error.value = null
  try {
    const data = await obtenerLeaderboard(props.cursoId)
    leaderboard.value = data || []
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

watch(() => props.cursoId, cargarLeaderboard, { immediate: true })

function medalClass(rank) {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  if (rank === 3) return 'bronze'
  return ''
}
</script>

<template>
  <div
    class="leaderboard-panel"
    data-test="leaderboard-panel"
  >
    <h3 class="leaderboard-title">
      Leaderboard
    </h3>
    <div
      v-if="loading"
      class="leaderboard-loading"
    >
      Cargando...
    </div>
    <div
      v-else-if="error"
      class="leaderboard-error"
    >
      Error al cargar el leaderboard
    </div>
    <div
      v-else-if="leaderboard.length === 0"
      class="leaderboard-empty"
    >
      Sin datos aún
    </div>
    <table
      v-else
      class="leaderboard-table"
    >
      <thead>
        <tr>
          <th>#</th>
          <th>Nombre</th>
          <th>Puntos</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in leaderboard"
          :key="entry.usuario_id || entry.rank"
          :class="['leaderboard-row', medalClass(entry.rank)]"
        >
          <td class="leaderboard-rank">
            <span
              v-if="entry.rank <= 3"
              class="leaderboard-medal"
            >
              {{ entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉' }}
            </span>
            <span v-else>{{ entry.rank }}</span>
          </td>
          <td class="leaderboard-name">
            {{ entry.nombre_completo || entry.usuario_id }}
          </td>
          <td class="leaderboard-points">
            {{ entry.puntos_totales || 0 }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.leaderboard-panel {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: calc(var(--unit) * 2.5);
  overflow: hidden;
}
.leaderboard-title {
  margin: 0 0 calc(var(--unit) * 2);
  font-family: var(--display);
  font-weight: 500;
  font-size: 20px;
  color: var(--ink);
}
.leaderboard-loading,
.leaderboard-error,
.leaderboard-empty {
  padding: calc(var(--unit) * 4) 0;
  text-align: center;
  color: var(--ink-3);
  font-size: 14px;
}
.leaderboard-error {
  color: var(--danger);
}
.leaderboard-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.leaderboard-table th {
  text-align: left;
  padding: calc(var(--unit) * 1) calc(var(--unit) * 1.5);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  border-bottom: 1px solid var(--line);
  font-weight: 500;
}
.leaderboard-table td {
  padding: calc(var(--unit) * 1.25) calc(var(--unit) * 1.5);
  border-bottom: 1px solid var(--line-soft);
  vertical-align: middle;
}
.leaderboard-row.gold td {
  background: color-mix(in srgb, #fde68a 20%, transparent);
}
.leaderboard-row.silver td {
  background: color-mix(in srgb, #e5e7eb 20%, transparent);
}
.leaderboard-row.bronze td {
  background: color-mix(in srgb, #fed7aa 20%, transparent);
}
.leaderboard-rank {
  width: 48px;
  text-align: center;
  font-weight: 600;
}
.leaderboard-medal {
  font-size: 18px;
}
.leaderboard-name {
  color: var(--ink);
  font-weight: 500;
}
.leaderboard-points {
  text-align: right;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--ink-2);
  font-weight: 600;
}
</style>
