<script setup>
import { ref, watch, computed } from 'vue'
import { fetchProgresoModulos, agregarPorModulo } from '@/services/instructores.ts'

const props = defineProps({
  cursoId: { type: String, required: true },
  /** Lista de inscritos del curso, para mostrar nombres en vez de UUIDs. */
  alumnos: { type: Array, default: () => [] },
})

const nombrePorId = computed(() => {
  const m = {}
  for (const a of props.alumnos) {
    const p = a?.perfiles
    if (!p) continue
    m[a.user_id] = [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ')
  }
  return m
})

function nombreDe(userId) {
  return nombrePorId.value[userId] || 'Persona inscrita'
}

const filas = ref([])
const cargando = ref(false)
const error = ref('')

// Detalle por persona: solo se despliega el módulo que se pide, para no
// volcar la lista completa de alumnos de todos los módulos a la vez.
const abierto = ref(null)

const modulos = computed(() => agregarPorModulo(filas.value))

const inscritos = computed(() => new Set(filas.value.map((f) => f.user_id)).size)

function personasDe(moduloId) {
  return filas.value
    .filter((f) => f.modulo_id === moduloId)
    .sort((a, b) => b.porcentaje - a.porcentaje)
}

function alternar(moduloId) {
  abierto.value = abierto.value === moduloId ? null : moduloId
}

async function cargar(id) {
  if (!id) return
  cargando.value = true
  error.value = ''
  abierto.value = null
  try {
    filas.value = await fetchProgresoModulos(id)
  } catch (e) {
    error.value = e?.message || 'No se pudo cargar el avance por módulo.'
    filas.value = []
  } finally {
    cargando.value = false
  }
}

watch(() => props.cursoId, cargar, { immediate: true })
</script>

<template>
  <section class="mod-panel">
    <header class="mod-head">
      <h3>Avance por módulo</h3>
      <button
        class="btn btn-ghost btn-sm"
        type="button"
        :disabled="cargando"
        @click="cargar(cursoId)"
      >
        {{ cargando ? 'Actualizando…' : 'Actualizar' }}
      </button>
    </header>

    <p v-if="error" class="mod-error" role="alert">
      {{ error }}
    </p>
    <p v-else-if="cargando && !filas.length" class="mod-vacio">Cargando…</p>
    <p v-else-if="!modulos.length" class="mod-vacio">
      Este curso todavía no tiene módulos con lecciones, o nadie se ha inscrito.
    </p>

    <table v-else class="mod-tabla">
      <caption class="sr-only">
        Avance de las
        {{
          inscritos
        }}
        personas inscritas, módulo por módulo
      </caption>
      <thead>
        <tr>
          <th scope="col">Módulo</th>
          <th scope="col" class="num">Lecciones</th>
          <th scope="col" class="num">Iniciaron</th>
          <th scope="col" class="num">Terminaron</th>
          <th scope="col">Promedio del grupo</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="m in modulos" :key="m.modulo_id">
          <tr>
            <th scope="row">
              <button
                class="mod-toggle"
                type="button"
                :aria-expanded="abierto === m.modulo_id"
                @click="alternar(m.modulo_id)"
              >
                {{ m.modulo || 'Sin título' }}
              </button>
            </th>
            <td class="num">
              {{ m.lecciones }}
            </td>
            <td class="num">{{ m.conAvance }} / {{ inscritos }}</td>
            <td class="num">{{ m.completaron }} / {{ inscritos }}</td>
            <td>
              <div
                class="mod-barra"
                role="progressbar"
                :aria-valuenow="m.promedio"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="`Promedio del módulo ${m.modulo}`"
              >
                <span class="mod-barra-fill" :style="{ width: m.promedio + '%' }" />
              </div>
              <span class="mod-pct">{{ m.promedio }}%</span>
            </td>
          </tr>
          <tr v-if="abierto === m.modulo_id" class="mod-detalle">
            <td colspan="5">
              <ul>
                <li v-for="p in personasDe(m.modulo_id)" :key="p.user_id">
                  <span class="mod-nombre">{{ nombreDe(p.user_id) }}</span>
                  {{ p.completadas }} de {{ p.lecciones }} · {{ p.porcentaje }}%
                </li>
              </ul>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.mod-panel {
  margin-top: calc(var(--unit) * 4);
}

.mod-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.mod-tabla {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0.75rem;
}

.mod-tabla th,
.mod-tabla td {
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--border, #e5e5e5);
  vertical-align: middle;
}

.mod-tabla .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.mod-toggle {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  text-decoration: underline dotted;
}

.mod-barra {
  display: inline-block;
  width: min(12rem, 40vw);
  height: 0.5rem;
  border-radius: var(--radius-full);
  background: var(--border, #e5e5e5);
  overflow: hidden;
  vertical-align: middle;
}

.mod-barra-fill {
  display: block;
  height: 100%;
  background: var(--brand-secondary, var(--brand-secondary));
}

.mod-pct {
  margin-left: 0.5rem;
  font-variant-numeric: tabular-nums;
}

.mod-detalle ul {
  margin: 0;
  padding: 0.25rem 0 0.25rem 1rem;
  columns: 2;
}

.mod-detalle li {
  list-style: none;
  font-size: 0.9em;
  color: var(--muted, #555);
}

.mod-nombre {
  margin-right: 0.4rem;
  color: var(--text, inherit);
}

.mod-error {
  color: var(--danger);
}

.mod-vacio {
  color: var(--muted, #555);
}

@media (prefers-reduced-motion: no-preference) {
  .mod-barra-fill {
    transition: width 0.3s ease;
  }
}
</style>
