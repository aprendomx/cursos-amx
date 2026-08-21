<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import Chart from 'chart.js/auto'
import { resolverColor } from '@/lib/colorCanvas.js'

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

  // Los colores se resuelven ANTES de entrar al canvas: el contexto 2D ignora
  // `var(--x)` en silencio y conserva el valor anterior, así que hasta ahora
  // esta gráfica se pintaba con los colores por defecto de Chart.js en vez de
  // los de la institución, y en modo oscuro sus etiquetas quedaban oscuras
  // sobre fondo oscuro.
  const c = {
    linea: resolverColor('var(--primary)'),
    relleno: resolverColor('var(--primary-100)'),
    texto: resolverColor('var(--ink-3)'),
    reja: resolverColor('var(--line)'),
  }
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
          borderColor: c.linea,
          backgroundColor: c.relleno,
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: c.linea,
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
          ticks: { color: c.texto, font: { size: 12 } },
        },
        y: {
          grid: { color: c.reja },
          ticks: { color: c.texto, font: { size: 12 } },
          beginAtZero: true,
        },
      },
    },
  })
}

// La lectura de conjunto: lo que la gráfica comunica de un vistazo y una tabla
// de números, no.
const resumenAccesible = computed(() => {
  if (!hasData.value) return 'Sin datos de inscripciones.'
  const valores = props.data.map((d) => d.total_inscripciones ?? 0)
  const total = valores.reduce((a, b) => a + b, 0)
  const max = Math.max(...valores)
  const pico = props.data[valores.indexOf(max)]
  return (
    `Inscripciones en el tiempo: ${total} en total entre ${props.data[0].fecha} y ` +
    `${props.data[props.data.length - 1].fecha}. Máximo de ${max} el ${pico.fecha}.`
  )
})

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
      <!-- Un <canvas> no expone nada a un lector de pantalla: es un mapa de
           píxeles. La tabla de abajo es el mismo dato en forma legible, oculta
           visualmente pero no para la tecnología de asistencia. -->
      <canvas ref="canvasRef" role="img" :aria-label="resumenAccesible" />
    </div>
    <table class="solo-lectores">
      <caption>
        Inscripciones por fecha
      </caption>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Inscripciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="fila in data" :key="fila.fecha">
          <th scope="row">
            {{ fila.fecha }}
          </th>
          <td>{{ fila.total_inscripciones }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
