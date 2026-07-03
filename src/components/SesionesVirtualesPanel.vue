<script setup>
import { ref, computed, onMounted } from 'vue'
import { featureEnabled } from '@/lib/featureFlags.js'
import {
  fetchSesionesCurso,
  crearSesion,
  eliminarSesion,
  iniciarSesion,
  terminarSesion,
  useSesionesRealtime,
  SESION_ESTADO_LABEL,
} from '@/services/sesionesVirtuales.js'
import { fetchInstructoresDeCurso } from '@/services/instructores.js'
import AulaVirtualModal from '@/components/AulaVirtualModal.vue'

const props = defineProps({
  cursoId: { type: String, required: true },
  session: { type: Object, default: null },
  perfil: { type: Object, default: null },
  // true cuando se monta desde el dashboard de instructor: muestra el
  // formulario de creación aunque la detección de rol aún no cargue.
  gestion: { type: Boolean, default: false },
})

const habilitado = featureEnabled('aulas')

const sesiones = ref([])
const instructorIds = ref(new Set())
const loading = ref(false)
const error = ref('')
const sesionAbierta = ref(null) // sesión en el modal de Jitsi

const esInstructorCurso = computed(
  () =>
    props.gestion ||
    props.perfil?.es_admin === true ||
    (props.session?.user?.id && instructorIds.value.has(props.session.user.id))
)

async function cargar() {
  loading.value = true
  error.value = ''
  try {
    const [s, ids] = await Promise.all([
      fetchSesionesCurso(props.cursoId),
      fetchInstructoresDeCurso(props.cursoId),
    ])
    sesiones.value = s
    instructorIds.value = new Set(ids)
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!habilitado || !props.session) return
  cargar()
  // Pase a "en vivo" / "terminada" en tiempo real
  useSesionesRealtime(props.cursoId, () => cargar())
})

/* Crear sesión (instructor) */
const creando = ref(false)
const nuevoTitulo = ref('')
const nuevaFecha = ref('')

async function onCrear() {
  const t = nuevoTitulo.value.trim()
  if (!t || !nuevaFecha.value) return
  try {
    await crearSesion({
      cursoId: props.cursoId,
      titulo: t,
      programadaEn: new Date(nuevaFecha.value).toISOString(),
    })
    nuevoTitulo.value = ''
    nuevaFecha.value = ''
    creando.value = false
    await cargar()
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

async function onIniciar(s) {
  try {
    const iniciada = await iniciarSesion(s.id)
    await cargar()
    sesionAbierta.value = iniciada
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

async function onTerminar(s) {
  try {
    await terminarSesion(s.id)
    if (sesionAbierta.value?.id === s.id) sesionAbierta.value = null
    await cargar()
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

async function onEliminar(s) {
  if (!confirm(`¿Eliminar la sesión "${s.titulo}"?`)) return
  try {
    await eliminarSesion(s.id)
    await cargar()
  } catch (e) {
    error.value = e?.message || String(e)
  }
}

function unirse(s) {
  if (s.estado !== 'en_vivo') return
  sesionAbierta.value = s
}

const fmtFecha = (iso) =>
  new Date(iso).toLocaleString('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

const nombre = (p) => (p ? `${p.nombres || ''} ${p.apellido_paterno || ''}`.trim() : '—')
</script>

<template>
  <section v-if="habilitado && session" class="sesiones-panel">
    <div class="sesiones-head">
      <div>
        <p class="eyebrow">Aulas virtuales</p>
        <h2 class="display sesiones-titulo">Sesiones en vivo</h2>
      </div>
      <button v-if="esInstructorCurso" class="btn btn-ghost btn-sm" @click="creando = !creando">
        + Programar sesión
      </button>
    </div>

    <p v-if="error" class="mono sesiones-error">⚠ {{ error }}</p>

    <div v-if="creando && esInstructorCurso" class="card sesiones-form">
      <div class="field">
        <label>Título</label>
        <input
          v-model="nuevoTitulo"
          type="text"
          maxlength="200"
          placeholder="p. ej. Sesión de dudas — Módulo 2"
        />
      </div>
      <div class="field">
        <label>Fecha y hora</label>
        <input v-model="nuevaFecha" type="datetime-local" />
      </div>
      <div class="sesiones-acciones">
        <button
          class="btn btn-primary btn-sm"
          :disabled="!nuevoTitulo.trim() || !nuevaFecha"
          @click="onCrear"
        >
          Programar
        </button>
        <button class="btn btn-ghost btn-sm" @click="creando = false">Cancelar</button>
      </div>
    </div>

    <p v-if="!sesiones.length && !loading" class="sesiones-vacio">
      No hay sesiones programadas en este curso.
    </p>

    <ul class="sesiones-lista">
      <li
        v-for="s in sesiones"
        :key="s.id"
        class="card sesion-item"
        :class="{ 'is-vivo': s.estado === 'en_vivo', 'is-terminada': s.estado === 'terminada' }"
      >
        <div class="sesion-info">
          <div class="sesion-meta">
            <span class="sesion-estado mono" :data-estado="s.estado">
              <span v-if="s.estado === 'en_vivo'" class="sesion-dot" />
              {{ SESION_ESTADO_LABEL[s.estado] }}
            </span>
            <strong>{{ s.titulo }}</strong>
          </div>
          <span class="mono sesion-detalle">
            {{ fmtFecha(s.programada_en) }} · {{ nombre(s.perfiles) }}
          </span>
        </div>

        <div class="sesion-acciones">
          <!-- Alumno e instructor: unirse cuando está en vivo -->
          <button v-if="s.estado === 'en_vivo'" class="btn btn-primary btn-sm" @click="unirse(s)">
            Unirse
          </button>

          <a
            v-if="s.estado === 'terminada' && s.grabacion_url"
            class="btn btn-ghost btn-sm"
            :href="s.grabacion_url"
            target="_blank"
            rel="noopener"
            >Ver grabación</a
          >

          <!-- Instructor -->
          <template v-if="esInstructorCurso">
            <button
              v-if="s.estado === 'programada'"
              class="btn btn-primary btn-sm"
              @click="onIniciar(s)"
            >
              Iniciar
            </button>
            <button
              v-if="s.estado === 'en_vivo'"
              class="btn btn-ghost btn-sm"
              @click="onTerminar(s)"
            >
              Terminar
            </button>
            <button
              v-if="s.estado === 'programada'"
              class="btn btn-ghost btn-sm sesiones-eliminar"
              @click="onEliminar(s)"
            >
              Eliminar
            </button>
          </template>
        </div>
      </li>
    </ul>

    <AulaVirtualModal
      v-if="sesionAbierta"
      :sesion="sesionAbierta"
      :session="session"
      :perfil="perfil"
      :es-instructor="esInstructorCurso"
      @close="sesionAbierta = null"
      @terminar="onTerminar(sesionAbierta)"
    />
  </section>
</template>

<style scoped>
.sesiones-panel {
  max-width: 980px;
  margin: 0 auto;
  padding: calc(var(--unit) * 4) calc(var(--unit) * 3);
}
.sesiones-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: calc(var(--unit) * 2);
  margin-bottom: calc(var(--unit) * 2.5);
}
.sesiones-titulo {
  font-size: 28px;
  color: var(--ink);
  margin-top: 4px;
}
.sesiones-error {
  color: var(--primary);
  margin-bottom: calc(var(--unit) * 2);
}
.sesiones-vacio {
  color: var(--ink-4);
  font-size: 14px;
}
.sesiones-form {
  padding: calc(var(--unit) * 2);
  margin-bottom: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.sesiones-acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sesiones-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.sesion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 2);
  flex-wrap: wrap;
}
.sesion-item.is-vivo {
  box-shadow: inset 3px 0 0 var(--primary, #9b2247);
}
.sesion-item.is-terminada {
  opacity: 0.65;
}
.sesion-info {
  min-width: 0;
}
.sesion-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.sesion-meta strong {
  color: var(--ink);
  font-size: 16px;
}
.sesion-estado {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--paper-2, #f3efe7);
  color: var(--ink-3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sesion-estado[data-estado='en_vivo'] {
  background: var(--primary-100, #f0dce4);
  color: var(--primary, #9b2247);
}
.sesion-estado[data-estado='terminada'] {
  background: var(--paper-2, #eee);
  color: var(--ink-4);
}
.sesion-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary, #9b2247);
  animation: sesionPulse 1.4s ease-in-out infinite;
}
@keyframes sesionPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
.sesion-detalle {
  font-size: 11px;
  color: var(--ink-4);
  display: block;
  margin-top: 4px;
}
.sesion-acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.sesiones-eliminar {
  color: var(--primary);
}
</style>
