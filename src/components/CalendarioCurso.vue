<script setup>
import { ref } from 'vue'
import SesionesCalendario from './SesionesCalendario.vue'
import CrearSesionPanel from './CrearSesionPanel.vue'

const props = defineProps({
  cursoId: { type: String, required: true },
  esInstructor: { type: Boolean, default: false },
})

const mostrarCrear = ref(false)
</script>

<template>
  <div class="calendario-curso">
    <div class="calendario-header">
      <h3>Calendario del curso</h3>
      <button
        v-if="esInstructor"
        class="btn-primary btn-sm"
        data-test="nueva-sesion-btn"
        @click="mostrarCrear = true"
      >
        + Nueva sesión
      </button>
    </div>

    <CrearSesionPanel
      v-if="mostrarCrear"
      :curso-id="cursoId"
      @saved="mostrarCrear = false"
      @cancel="mostrarCrear = false"
    />

    <SesionesCalendario :curso-id="cursoId" />
  </div>
</template>

<style scoped>
.calendario-curso {
  max-width: 980px;
  margin: 0 auto;
  padding: calc(var(--unit) * 4) calc(var(--unit) * 3);
}
.calendario-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: calc(var(--unit) * 2);
}
.calendario-header h3 {
  font-size: 20px;
  font-weight: 600;
  color: var(--ink);
  margin: 0;
}
.btn-sm {
  padding: 6px 14px;
  font-size: 12px;
}
</style>
