<script setup>
import { ref, onMounted } from 'vue'
import { useGrabaciones } from '@/composables/useGrabaciones.js'

const props = defineProps({
  cursoId: { type: String, required: true },
})

const emit = defineEmits(['reproducir'])

const { grabaciones, loading, error, cargar } = useGrabaciones(props.cursoId)
const busqueda = ref('')

onMounted(cargar)

const fmtDuracion = (seg) => {
  if (!seg) return '--:--'
  const m = Math.floor(seg / 60)
  const s = String(seg % 60).padStart(2, '0')
  return `${m}:${s}`
}
</script>

<template>
  <div class="archivo-sesiones">
    <h3>Archivo de sesiones</h3>
    <p v-if="loading">Cargando…</p>
    <p v-if="error" class="error">
      {{ error }}
    </p>

    <div v-if="!loading && !grabaciones.length" class="vacio">No hay grabaciones disponibles.</div>

    <div class="grid">
      <div
        v-for="g in grabaciones"
        :key="g.id"
        class="tarjeta"
        data-test="grabacion-tarjeta"
        @click="emit('reproducir', g)"
      >
        <div class="tarjeta-thumb">
          <span class="play-icon">▶</span>
        </div>
        <div class="tarjeta-info">
          <strong>{{ g.sesiones_virtuales?.titulo || 'Sin título' }}</strong>
          <span class="meta mono"
            >{{ fmtDuracion(g.duracion_segundos) }} · {{ g.tamano_mb }} MB</span
          >
          <span class="estado" :class="`estado-${g.estado}`">{{ g.estado }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.archivo-sesiones {
  max-width: 980px;
  margin: 0 auto;
  padding: calc(var(--unit) * 4) calc(var(--unit) * 3);
}
.archivo-sesiones h3 {
  font-size: 20px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: calc(var(--unit) * 2);
}
.error {
  color: var(--primary);
}
.vacio {
  color: var(--ink-4);
  font-size: 14px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: calc(var(--unit) * 2);
}
.tarjeta {
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s;
  background: var(--paper);
}
.tarjeta:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.tarjeta-thumb {
  height: 120px;
  background: var(--paper-2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.play-icon {
  font-size: 32px;
  color: var(--primary);
}
.tarjeta-info {
  padding: calc(var(--unit) * 1.5);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tarjeta-info strong {
  font-size: 14px;
  color: var(--ink);
}
.meta {
  font-size: 11px;
  color: var(--ink-4);
}
.estado {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 2px;
  align-self: flex-start;
}
.estado-lista {
  background: #e8f5e9;
  color: #2e7d32;
}
.estado-procesando {
  background: #fff3e0;
  color: #e65100;
}
.estado-error {
  background: #fce8e6;
  color: #c5221f;
}
</style>
