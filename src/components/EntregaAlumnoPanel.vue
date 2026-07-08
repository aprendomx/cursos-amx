<script setup>
import { ref, computed, watch } from 'vue'
import { useEntregas } from '@/composables/useEntregas'
import RubricaAlumnoView from './RubricaAlumnoView.vue'

const props = defineProps({
  tareaId: { type: String, required: true },
  userId: { type: String, required: true },
})

const emit = defineEmits(['entregado'])

const {
  entrega,
  tarea,
  rubrica,
  loading,
  error,
  estado,
  versionActual,
  diasRestantes,
  diasRetraso,
  puedeEntregar,
  cargar,
  subirVersion,
} = useEntregas(props.tareaId, props.userId)

const texto = ref('')
const archivos = ref([])
const mostrarHistorial = ref(false)

const estadoBanner = computed(
  () =>
    ({
      pendiente: { clase: 'banner-pendiente', texto: 'Pendiente de entrega' },
      entregada: { clase: 'banner-entregada', texto: `Entregada (versión ${versionActual.value})` },
      calificada: {
        clase: 'banner-calificada',
        texto: `Calificada: ${entrega.value?.puntaje_final ?? '-'}/100`,
      },
      devuelta: { clase: 'banner-devuelta', texto: 'Devuelta para corrección' },
    })[estado.value] || { clase: '', texto: '' }
)

async function onEntregar() {
  await subirVersion({ texto: texto.value, archivos: archivos.value, comentario: '' })
  texto.value = ''
  archivos.value = []
  emit('entregado')
}

watch(() => props.tareaId, cargar, { immediate: true })
</script>

<template>
  <div class="entrega-panel">
    <div v-if="loading" class="skeleton card" style="height: 200px" />
    <div v-else-if="error" class="card publish-status-error">Error: {{ error.message }}</div>
    <template v-else>
      <div class="banner" :class="estadoBanner.clase">
        <span class="mono">{{ estadoBanner.texto }}</span>
        <span v-if="diasRestantes !== null && diasRestantes > 0" class="countdown">
          {{ diasRestantes }} días restantes
        </span>
        <span
          v-else-if="diasRestantes !== null && diasRestantes <= 0 && tarea?.permitir_retraso"
          class="countdown retraso"
        >
          Retraso: {{ Math.abs(diasRestantes) }} días
        </span>
      </div>

      <!-- Formulario de entrega -->
      <div v-if="estado === 'pendiente' || estado === 'devuelta'" class="card">
        <h4 class="h4">
          {{ estado === 'devuelta' ? 'Reenviar corrección' : 'Entregar tarea' }}
        </h4>
        <textarea v-model="texto" rows="6" class="textarea" placeholder="Escribe tu respuesta..." />
        <div class="acciones">
          <button
            class="btn btn-primary"
            :disabled="!puedeEntregar || (!texto && !archivos.length)"
            @click="onEntregar"
          >
            Entregar
          </button>
        </div>
      </div>

      <!-- Vista entregada -->
      <div v-else-if="estado === 'entregada'" class="card">
        <h4 class="h4">Entrega realizada</h4>
        <p class="text-muted">
          Versión {{ versionActual }} —
          {{ new Date(entrega?.entregado_en).toLocaleDateString('es-MX') }}
        </p>
        <button v-if="puedeEntregar" class="btn btn-secondary" @click="cargar">
          Nueva versión
        </button>
      </div>

      <!-- Vista calificada -->
      <div v-else-if="estado === 'calificada' && rubrica" class="calificada-view">
        <RubricaAlumnoView
          :rubrica="rubrica"
          :calificaciones="entrega?.calificaciones || []"
          :puntaje-final="entrega?.puntaje_final || 0"
        />
        <div v-if="entrega?.comentario_instructor" class="card comentario-instructor">
          <h5 class="eyebrow">Comentario del instructor</h5>
          <p>{{ entrega.comentario_instructor }}</p>
        </div>
      </div>

      <!-- Historial -->
      <div v-if="entrega?.entrega_versiones?.length > 1" class="historial">
        <button class="btn btn-ghost btn-sm" @click="mostrarHistorial = !mostrarHistorial">
          {{ mostrarHistorial ? 'Ocultar' : 'Ver' }} historial de versiones
        </button>
        <ul v-if="mostrarHistorial">
          <li v-for="v in entrega.entrega_versiones" :key="v.id">
            Versión {{ v.numero_version }} —
            {{ new Date(v.entregado_en).toLocaleDateString('es-MX') }}
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<style scoped>
.entrega-panel {
  margin-top: 1rem;
}
.banner {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.banner-pendiente {
  background: var(--paper-3);
}
.banner-entregada {
  background: var(--info-bg, #dbeafe);
}
.banner-calificada {
  background: var(--success-bg, #dcfce7);
}
.banner-devuelta {
  background: var(--warning-bg, #fef3c7);
}
.countdown {
  font-size: 0.875rem;
}
.countdown.retraso {
  color: var(--danger);
}
.textarea {
  width: 100%;
  padding: 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid var(--paper-3);
  background: var(--paper-1);
  color: var(--ink-1);
  resize: vertical;
}
.acciones {
  margin-top: 1rem;
  display: flex;
  gap: 0.5rem;
}
.comentario-instructor {
  margin-top: 1rem;
}
.historial {
  margin-top: 1rem;
}
</style>
