<script setup>
import { ref, watch } from 'vue'
import { useGrabaciones } from '@/composables/useGrabaciones.js'

const props = defineProps({
  cursoId: { type: String, required: true },
})

const emit = defineEmits(['reproducir'])

const { resultadosBusqueda, loading, error, buscar } = useGrabaciones(props.cursoId)
const query = ref('')
let debounceTimer = null

watch(query, (q) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => buscar(q), 300)
})
</script>

<template>
  <div class="buscador-sesiones">
    <input
      v-model="query"
      type="text"
      placeholder="Buscar en transcripciones..."
      class="buscador-input"
      data-test="buscador-input"
    />

    <p v-if="loading" class="loading">Buscando…</p>
    <p v-if="error" class="error">
      {{ error }}
    </p>

    <ul v-if="resultadosBusqueda.length" class="resultados">
      <li
        v-for="r in resultadosBusqueda"
        :key="r.sesion_id"
        class="resultado"
        data-test="resultado-item"
        @click="emit('reproducir', r)"
      >
        <strong>{{ r.titulo }}</strong>
        <p class="snippet" v-html="r.snippet" />
      </li>
    </ul>

    <p v-if="query && !loading && !resultadosBusqueda.length" class="sin-resultados">
      Sin resultados para "{{ query }}"
    </p>
  </div>
</template>

<style scoped>
.buscador-sesiones {
  max-width: 600px;
}
.buscador-input {
  width: 100%;
  padding: calc(var(--unit)) calc(var(--unit) * 1.5);
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 14px;
  background: var(--paper);
  color: var(--ink);
}
.buscador-input:focus {
  outline: none;
  border-color: var(--primary);
}
.loading,
.error,
.sin-resultados {
  margin-top: calc(var(--unit));
  font-size: 13px;
}
.error {
  color: var(--primary);
}
.resultados {
  list-style: none;
  padding: 0;
  margin: calc(var(--unit) * 2) 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.resultado {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
  background: var(--paper);
  transition: box-shadow 0.2s;
}
.resultado:hover {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}
.resultado strong {
  font-size: 14px;
  color: var(--ink);
}
.snippet {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ink-3);
  line-height: 1.4;
}
</style>
