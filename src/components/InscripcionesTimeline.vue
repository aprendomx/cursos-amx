<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import Chart from 'chart.js/auto'

const props = defineProps({
  data: {
    type: Array,
    default: () => [],
  },
})

const canvasRef = ref(null)
let chartInstance = null

const hasData = computed(() => Array.isArray(props.data) && props.data.length > 0)

function createChart() {
  if (!canvasRef.value || !hasData.value) return

  const ctx = canvasRef.value.getContext('2d')
  const labels = props.data.map((d) => d.fecha)
  const values = props.data.map((d) => d.total_inscripciones)

  if (chartInstance) {
    chartInstance.destroy()
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Inscripciones',
          data: values,
          borderColor: 'var(--primary)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: 'var(--primary)',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: 'var(--ink-3)', font: { size: 11 } },
        },
        y: {
          grid: { color: 'var(--line)' },
          ticks: { color: 'var(--ink-3)', font: { size: 11 } },
          beginAtZero: true,
        },
      },
    },
  })
}

watch(() => props.data, createChart, { deep: true })

onMounted(createChart)
onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>

<template>
  <div class="card" :style="{ padding: 'calc(var(--unit) * 3)' }">
    <p class="eyebrow" :style="{ marginBottom: 'calc(var(--unit) * 2)' }">
      Inscripciones en el tiempo
    </p>
    <div
      v-if="!hasData"
      :style="{
        padding: 'calc(var(--unit) * 4)',
        textAlign: 'center',
        color: 'var(--ink-3)',
      }"
    >
      Sin datos para mostrar.
    </div>
    <div v-else :style="{ height: '280px' }">
      <canvas ref="canvasRef" />
    </div>
  </div>
</template>
