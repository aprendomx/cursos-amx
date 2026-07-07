<script setup>
const props = defineProps({
  cursoId: { type: String, default: '' },
})

const emit = defineEmits(['download'])

const reportes = [
  { tipo: 'progreso', label: 'Progreso por alumno' },
  { tipo: 'calificaciones', label: 'Calificaciones' },
  { tipo: 'engagement', label: 'Engagement' },
]

function onDownload(tipo) {
  emit('download', tipo, props.cursoId)
}
</script>

<template>
  <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
    <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">Descargar reportes</p>
    <div :style="{ display: 'flex', gap: 'calc(var(--unit) * 1.5)', flexWrap: 'wrap' }">
      <button
        v-for="r in reportes"
        :key="r.tipo"
        class="btn btn-secondary btn-sm"
        @click="onDownload(r.tipo)"
      >
        {{ r.label }}
      </button>
    </div>
  </div>
</template>
