<script setup>
const props = defineProps({
  alumnos: { type: Array, default: () => [] },
})

function riskColor(score) {
  if (score >= 75) return 'var(--danger)'
  if (score >= 50) return 'var(--warn)'
  return 'var(--success)'
}

function riskLabel(score) {
  if (score >= 75) return 'Alto'
  if (score >= 50) return 'Medio'
  return 'Bajo'
}
</script>

<template>
  <div class="card" :style="{ overflow: 'auto' }">
    <div :style="{ padding: 'calc(var(--unit) * 2.5)', borderBottom: '1px solid var(--line)' }">
      <p class="eyebrow">Alumnos en riesgo</p>
    </div>
    <table v-if="alumnos.length" class="admin-table admin-table-full">
      <thead>
        <tr>
          <th class="mono">Alumno</th>
          <th class="mono">Score</th>
          <th class="mono">Último login</th>
          <th class="mono">Lecciones</th>
          <th class="mono">Quizzes</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in alumnos" :key="a.id || a.nombre">
          <td>
            <div :style="{ display: 'flex', flexDirection: 'column', gap: '2px' }">
              <span :style="{ fontWeight: '500' }">{{ a.nombre }}</span>
              <span v-if="a.email" class="mono" :style="{ color: 'var(--ink-4)' }">{{
                a.email
              }}</span>
            </div>
          </td>
          <td>
            <span
              class="chip"
              :style="{ background: riskColor(a.score), color: 'var(--paper)', fontWeight: '600' }"
            >
              {{ a.score }}% — {{ riskLabel(a.score) }}
            </span>
          </td>
          <td class="mono" :style="{ color: 'var(--ink-3)' }">
            {{ a.ultimo_login || '—' }}
          </td>
          <td>{{ a.lecciones ?? 0 }}</td>
          <td>{{ a.quizzes ?? 0 }}</td>
        </tr>
      </tbody>
    </table>
    <p
      v-else
      :style="{
        padding: 'calc(var(--unit) * 2.5)',
        color: 'var(--ink-3)',
        fontSize: '13px',
      }"
    >
      Sin alumnos que cumplan el criterio de riesgo.
    </p>
  </div>
</template>
