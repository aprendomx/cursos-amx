<script setup>
import { ref, computed, watch } from 'vue'
import { useCalendario } from '@/composables/useCalendario.js'

const props = defineProps({
  cursoId: { type: String, required: true },
})

const { eventos, eventosPorDia, eventosPorMes, loading, error, cargar } = useCalendario(
  props.cursoId
)

const hoy = new Date()
const mesActual = ref(hoy.getMonth())
const anioActual = ref(hoy.getFullYear())

const nombresMes = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
const nombresDia = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const diasDelMes = computed(() => {
  const dias = []
  const primerDia = new Date(anioActual.value, mesActual.value, 1)
  const ultimoDia = new Date(anioActual.value, mesActual.value + 1, 0)
  const offset = primerDia.getDay()

  for (let i = 0; i < offset; i++) dias.push(null)
  for (let d = 1; d <= ultimoDia.getDate(); d++) dias.push(d)

  return dias
})

const keyMes = computed(() => `${anioActual.value}-${String(mesActual.value + 1).padStart(2, '0')}`)
const eventosMesActual = computed(() => eventosPorMes.value.get(keyMes.value) || [])

function tieneEventos(dia) {
  if (!dia) return false
  const key = `${anioActual.value}-${String(mesActual.value + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return (eventosPorDia.value.get(key) || []).length > 0
}

function eventosDelDia(dia) {
  if (!dia) return []
  const key = `${anioActual.value}-${String(mesActual.value + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return eventosPorDia.value.get(key) || []
}

function esHoy(dia) {
  return (
    dia === hoy.getDate() &&
    mesActual.value === hoy.getMonth() &&
    anioActual.value === hoy.getFullYear()
  )
}

function mesAnterior() {
  if (mesActual.value === 0) {
    mesActual.value = 11
    anioActual.value--
  } else {
    mesActual.value--
  }
}

function mesSiguiente() {
  if (mesActual.value === 11) {
    mesActual.value = 0
    anioActual.value++
  } else {
    mesActual.value++
  }
}

watch(() => props.cursoId, cargar, { immediate: true })
</script>

<template>
  <div class="calendario">
    <div class="calendario-header">
      <button class="btn-nav" data-test="mes-anterior" @click="mesAnterior">‹</button>
      <h3 class="calendario-titulo" data-test="mes-titulo">
        {{ nombresMes[mesActual] }} {{ anioActual }}
      </h3>
      <button class="btn-nav" data-test="mes-siguiente" @click="mesSiguiente">›</button>
    </div>

    <div class="calendario-grid">
      <div v-for="d in nombresDia" :key="d" class="calendario-dia-header">
        {{ d }}
      </div>
      <div
        v-for="(dia, idx) in diasDelMes"
        :key="idx"
        class="calendario-celda"
        :class="{ 'is-hoy': esHoy(dia), 'has-eventos': tieneEventos(dia) }"
        data-test="calendario-celda"
      >
        <span v-if="dia" class="calendario-numero">{{ dia }}</span>
        <div v-if="tieneEventos(dia)" class="calendario-eventos">
          <div
            v-for="e in eventosDelDia(dia)"
            :key="e.id"
            class="calendario-evento"
            :class="`tipo-${e.tipo}`"
            :title="e.titulo"
          >
            {{ e.titulo }}
          </div>
        </div>
      </div>
    </div>

    <p v-if="loading" class="calendario-loading">Cargando…</p>
    <p v-if="error" class="calendario-error">
      {{ error }}
    </p>

    <div v-if="eventosMesActual.length" class="calendario-lista">
      <h4>Eventos este mes</h4>
      <ul>
        <li v-for="e in eventosMesActual" :key="e.id" data-test="evento-lista">
          <span class="evento-tipo" :class="`tipo-${e.tipo}`">{{ e.tipo }}</span>
          <span class="evento-titulo">{{ e.titulo }}</span>
          <span class="evento-fecha mono">{{ new Date(e.fecha).toLocaleDateString('es-MX') }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.calendario {
  max-width: 800px;
}
.calendario-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: calc(var(--unit) * 2);
}
.calendario-titulo {
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
  margin: 0;
}
.btn-nav {
  background: none;
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 16px;
  color: var(--ink);
}
.calendario-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.calendario-dia-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-3);
  text-align: center;
  padding: 4px;
}
.calendario-celda {
  min-height: 80px;
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 4px;
  background: var(--paper);
  position: relative;
}
.calendario-celda.is-hoy {
  border-color: var(--primary);
  background: var(--primary-100);
}
.calendario-celda.has-eventos {
  border-color: var(--primary-300);
}
.calendario-numero {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}
.calendario-eventos {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.calendario-evento {
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--primary-100);
  color: var(--primary);
}
.calendario-evento.tipo-tarea_deadline {
  background: #fff3e0;
  color: #e65100;
}
.calendario-evento.tipo-curso_fecha {
  background: #e8f5e9;
  color: #2e7d32;
}
.calendario-evento.tipo-anuncio {
  background: #f3e5f5;
  color: #7b1fa2;
}
.calendario-loading,
.calendario-error {
  margin-top: calc(var(--unit) * 2);
  font-size: 13px;
}
.calendario-error {
  color: var(--primary);
}
.calendario-lista {
  margin-top: calc(var(--unit) * 3);
}
.calendario-lista h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: calc(var(--unit));
}
.calendario-lista ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.calendario-lista li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.evento-tipo {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 2px;
  background: var(--paper-2);
  color: var(--ink-3);
}
.evento-titulo {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.evento-fecha {
  font-size: 11px;
  color: var(--ink-4);
}
</style>
