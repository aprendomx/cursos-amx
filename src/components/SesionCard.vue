<script setup>
const props = defineProps({
  sesion: { type: Object, required: true },
  rsvpEstado: { type: String, default: null },
  puedeUnirse: { type: Boolean, default: false },
  esInstructor: { type: Boolean, default: false },
})

const emit = defineEmits(['confirmar', 'cancelar', 'unirse', 'iniciar', 'terminar'])

const fmtFecha = (iso) =>
  new Date(iso).toLocaleString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

const plataformaLabel = { jitsi: 'Jitsi', zoom: 'Zoom' }
const plataformaClass = { jitsi: 'badge-jitsi', zoom: 'badge-zoom' }
</script>

<template>
  <div class="sesion-card" :class="{ 'is-vivo': sesion.estado === 'en_vivo' }">
    <div class="sesion-header">
      <span class="badge-plataforma" :class="plataformaClass[sesion.plataforma || 'jitsi']">
        {{ plataformaLabel[sesion.plataforma || 'jitsi'] }}
      </span>
      <span v-if="sesion.estado === 'en_vivo'" class="badge-vivo">
        <span class="dot" /> En vivo
      </span>
    </div>

    <h3 class="sesion-titulo">
      {{ sesion.titulo }}
    </h3>
    <p v-if="sesion.descripcion" class="sesion-desc">
      {{ sesion.descripcion }}
    </p>

    <div class="sesion-meta">
      <span class="sesion-fecha mono">{{ fmtFecha(sesion.programada_en || sesion.inicio) }}</span>
      <span v-if="sesion.fin" class="sesion-duracion mono"> → {{ fmtFecha(sesion.fin) }} </span>
    </div>

    <div class="sesion-acciones">
      <!-- Alumno -->
      <template v-if="!esInstructor">
        <button
          v-if="sesion.estado === 'programada' && rsvpEstado !== 'confirmado'"
          class="btn-primary btn-sm"
          data-test="confirmar-btn"
          @click="emit('confirmar')"
        >
          Confirmar asistencia
        </button>
        <button
          v-if="sesion.estado === 'programada' && rsvpEstado === 'confirmado'"
          class="btn-secondary btn-sm"
          data-test="cancelar-btn"
          @click="emit('cancelar')"
        >
          Cancelar
        </button>
        <button
          v-if="puedeUnirse || sesion.estado === 'en_vivo'"
          class="btn-primary btn-sm"
          data-test="unirse-btn"
          @click="emit('unirse')"
        >
          Unirse
        </button>
      </template>

      <!-- Instructor -->
      <template v-if="esInstructor">
        <button
          v-if="sesion.estado === 'programada'"
          class="btn-primary btn-sm"
          data-test="iniciar-btn"
          @click="emit('iniciar')"
        >
          Iniciar
        </button>
        <button
          v-if="sesion.estado === 'en_vivo'"
          class="btn-secondary btn-sm"
          data-test="terminar-btn"
          @click="emit('terminar')"
        >
          Terminar
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sesion-card {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: calc(var(--unit) * 2);
  background: var(--paper);
  transition: box-shadow 0.2s;
}
.sesion-card.is-vivo {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-100);
}
.sesion-header {
  display: flex;
  gap: 8px;
  margin-bottom: calc(var(--unit));
}
.badge-plataforma {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 3px;
}
.badge-jitsi {
  background: #e8f0fe;
  color: #174ea6;
}
.badge-zoom {
  background: #fce8e6;
  color: #c5221f;
}
.badge-vivo {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--primary-100);
  color: var(--primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
.sesion-titulo {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  margin: 0 0 4px;
}
.sesion-desc {
  font-size: 13px;
  color: var(--ink-3);
  margin: 0 0 calc(var(--unit));
}
.sesion-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: calc(var(--unit) * 1.5);
}
.sesion-fecha,
.sesion-duracion {
  font-size: 12px;
  color: var(--ink-4);
}
.sesion-acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn-sm {
  padding: 4px 12px;
  font-size: 12px;
}
</style>
