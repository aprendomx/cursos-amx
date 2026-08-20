<script setup>
import { ref, onMounted, computed } from 'vue'
import { MODULOS, listarFlags, cambiarFlag } from '@/services/featureToggles.js'

const estado = ref({})
const cargando = ref(true)
const guardando = ref(null)
const error = ref('')
const aviso = ref('')

// Claves que existen en la base pero no están en el catálogo de la pantalla:
// se muestran igual, para que nada quede invisible tras una actualización.
const huerfanas = ref([])

const conocidas = computed(() => new Set(MODULOS.flatMap((g) => g.flags.map((f) => f.key))))

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const filas = await listarFlags()
    const mapa = {}
    for (const f of filas) mapa[f.key] = f.enabled === true
    estado.value = mapa
    huerfanas.value = filas.filter((f) => !conocidas.value.has(f.key)).map((f) => f.key)
  } catch (e) {
    error.value = e?.message || 'No se pudieron cargar los módulos.'
  } finally {
    cargando.value = false
  }
}

async function alternar(key) {
  const nuevo = !estado.value[key]
  guardando.value = key
  error.value = ''
  aviso.value = ''
  try {
    await cambiarFlag(key, nuevo)
    estado.value = { ...estado.value, [key]: nuevo }
    aviso.value = 'Guardado. Cada persona lo verá al recargar la página.'
  } catch (e) {
    error.value = e?.message || 'No se pudo guardar el cambio.'
  } finally {
    guardando.value = null
  }
}

onMounted(cargar)
</script>

<template>
  <section class="admin-modulos">
    <header>
      <h2>Módulos</h2>
      <p class="admin-modulos-intro">
        Enciende o apaga módulos sin reconstruir ni volver a desplegar. Los marcados como
        <strong>cierra datos</strong> además bloquean el acceso a sus tablas: apagarlos no solo
        oculta la interfaz, también impide llegar a la información por la API.
      </p>
    </header>

    <p v-if="error" class="admin-modulos-error" role="alert">
      {{ error }}
    </p>
    <p v-if="aviso" class="admin-modulos-aviso" role="status">
      {{ aviso }}
    </p>

    <p v-if="cargando">Cargando módulos…</p>

    <template v-else>
      <fieldset v-for="grupo in MODULOS" :key="grupo.grupo" class="admin-modulos-grupo">
        <legend>{{ grupo.grupo }}</legend>
        <div v-for="flag in grupo.flags" :key="flag.key" class="admin-modulos-fila">
          <label :for="`flag-${flag.key}`">
            <span class="admin-modulos-label">{{ flag.label }}</span>
            <code class="admin-modulos-key">{{ flag.key }}</code>
            <span v-if="flag.datos" class="admin-modulos-tag">cierra datos</span>
          </label>
          <input
            :id="`flag-${flag.key}`"
            type="checkbox"
            :checked="estado[flag.key] === true"
            :disabled="guardando === flag.key"
            @change="alternar(flag.key)"
          />
        </div>
      </fieldset>

      <fieldset v-if="huerfanas.length" class="admin-modulos-grupo">
        <legend>Otros</legend>
        <p class="admin-modulos-intro">Claves presentes en la base que esta versión no reconoce.</p>
        <div v-for="key in huerfanas" :key="key" class="admin-modulos-fila">
          <label :for="`flag-${key}`">
            <code class="admin-modulos-key">{{ key }}</code>
          </label>
          <input
            :id="`flag-${key}`"
            type="checkbox"
            :checked="estado[key] === true"
            :disabled="guardando === key"
            @change="alternar(key)"
          />
        </div>
      </fieldset>
    </template>
  </section>
</template>

<style scoped>
.admin-modulos-intro {
  color: var(--muted, #555);
  max-width: 60ch;
  margin-bottom: 1rem;
}

.admin-modulos-grupo {
  border: 1px solid var(--border, #ddd);
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}

.admin-modulos-grupo legend {
  font-weight: 600;
  padding: 0 0.5rem;
}

.admin-modulos-fila {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.4rem 0;
}

.admin-modulos-fila + .admin-modulos-fila {
  border-top: 1px solid var(--border-soft, #eee);
}

.admin-modulos-fila label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  cursor: pointer;
}

.admin-modulos-key {
  font-size: 0.8em;
  color: var(--muted, #666);
}

.admin-modulos-tag {
  font-size: 0.75em;
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 0 0.5em;
  color: var(--brand-accent, #b45309);
}

.admin-modulos-error {
  color: #b00020;
}

.admin-modulos-aviso {
  color: var(--brand-secondary, #0f766e);
}
</style>
