<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase.js'

const props = defineProps({
  userId: { type: String, required: true },
})

const sesiones = ref([])
const loading = ref(false)

async function cargar() {
  loading.value = true
  try {
    // Sesiones de cursos en los que el usuario está inscrito
    const { data, error } = await supabase
      .from('sesiones_virtuales')
      .select('*, cursos(titulo)')
      .in('curso_id', supabase.from('inscripciones').select('curso_id').eq('user_id', props.userId))
      .gte('programada_en', new Date().toISOString())
      .order('programada_en', { ascending: true })
      .limit(20)

    if (error) throw error
    sesiones.value = data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const fmtFecha = (iso) =>
  new Date(iso).toLocaleString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

onMounted(cargar)
</script>

<template>
  <div class="mi-calendario">
    <h3>Mis próximas sesiones</h3>
    <p v-if="loading">Cargando…</p>
    <ul v-else class="sesiones-lista">
      <li v-for="s in sesiones" :key="s.id" class="sesion-item">
        <div>
          <strong>{{ s.titulo }}</strong>
          <span class="curso-tag">{{ s.cursos?.titulo }}</span>
        </div>
        <span class="sesion-fecha mono">{{ fmtFecha(s.programada_en) }}</span>
      </li>
    </ul>
    <p v-if="!sesiones.length && !loading">No tienes sesiones programadas.</p>
  </div>
</template>

<style scoped>
.mi-calendario {
  max-width: 600px;
}
.mi-calendario h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: calc(var(--unit) * 1.5);
}
.sesiones-lista {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sesion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
}
.sesion-item strong {
  font-size: 13px;
  color: var(--ink);
}
.curso-tag {
  font-size: 11px;
  color: var(--ink-4);
  margin-left: 8px;
}
.sesion-fecha {
  font-size: 11px;
  color: var(--ink-4);
}
</style>
