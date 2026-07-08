<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useInstructor } from '@/composables/useInstructor.js'
import { ESTADO_LABEL } from '@/composables/useEntregas.js'
import SesionesVirtualesPanel from '@/components/SesionesVirtualesPanel.vue'
import InstructorReportPanel from '@/components/InstructorReportPanel.vue'
import InstructorVideoDashboard from '@/components/InstructorVideoDashboard.vue'
import { featureEnabled } from '@/lib/featureFlags.js'

const props = defineProps({
  session: { type: Object, default: null },
  perfil: { type: Object, default: null },
})

const router = useRouter()

const {
  habilitado,
  misCursos,
  cursoActivo,
  alumnos,
  comentarios,
  log,
  metricas,
  entregas,
  entregasHabilitadas,
  loading,
  error,
  tieneCursos,
  init,
  seleccionarCurso,
  moderar,
  revisar,
  descargarEntrega,
} = useInstructor()

const esInstructor = computed(
  () => props.perfil?.es_instructor === true || props.perfil?.es_admin === true
)

onMounted(() => {
  if (habilitado && esInstructor.value) init()
})

const fmtFecha = (iso) =>
  new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

const nombreCorto = (p) => (p ? `${p.nombres || ''} ${p.apellido_paterno || ''}`.trim() : '—')

const ACCION_LABEL = {
  ocultar: 'Ocultó',
  mostrar: 'Mostró',
  destacar: 'Destacó',
  quitar_destacado: 'Quitó destacado',
  eliminar: 'Eliminó',
}

async function onModerar(c, accion) {
  if (
    accion === 'eliminar' &&
    !confirm('¿Eliminar este comentario de forma permanente? Quedará registrado en el log.')
  )
    return
  try {
    await moderar(c.id, accion)
  } catch {
    /* el error ya queda en `error` del composable */
  }
}

/* ── Entregas (módulo LMS 3) ── */
const filtroEntregas = ref('')

const entregasFiltradas = computed(() =>
  filtroEntregas.value
    ? entregas.value.filter((e) => e.estado === filtroEntregas.value)
    : entregas.value
)

async function onRevisar(e, estado) {
  let comentario = null
  if (estado === 'rechazada' || estado === 'revisada') {
    comentario =
      prompt('Comentario para el alumno (opcional):', e.comentario_instructor || '') || null
  }
  try {
    await revisar(e.id, estado, comentario)
  } catch {
    /* error visible vía `error` */
  }
}

const fmtBytes = (b) =>
  b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'
</script>

<template>
  <main class="instructor-page">
    <!-- Guards: flag apagado / sin rol / sin cursos -->
    <div v-if="!habilitado" class="inst-empty">
      <p class="eyebrow">Instructor</p>
      <p>Esta función no está habilitada.</p>
    </div>

    <div v-else-if="!esInstructor" class="inst-empty">
      <p class="eyebrow">Instructor</p>
      <p>Tu cuenta no tiene el rol de instructor.</p>
      <button class="btn btn-ghost" @click="router.push({ name: 'home' })">Volver al inicio</button>
    </div>

    <template v-else>
      <header class="inst-header">
        <div>
          <p class="eyebrow">Panel de instructor</p>
          <h1 class="display">
            {{ cursoActivo?.titulo || 'Mis cursos' }}
          </h1>
        </div>
        <div v-if="misCursos.length > 1" class="field inst-curso-select">
          <label>Curso</label>
          <select :value="cursoActivo?.id" @change="seleccionarCurso($event.target.value)">
            <option v-for="c in misCursos" :key="c.id" :value="c.id">
              {{ c.titulo }}
            </option>
          </select>
        </div>
      </header>

      <p v-if="error" class="inst-error mono">⚠ {{ error }}</p>

      <div v-if="loading && !cursoActivo" class="inst-empty">Cargando…</div>

      <div v-else-if="!tieneCursos" class="inst-empty">
        <p>Aún no tienes cursos asignados. Pide a un administrador que te asigne desde el panel.</p>
      </div>

      <template v-else-if="cursoActivo">
        <!-- Métricas -->
        <section class="inst-metricas">
          <div class="card inst-metrica">
            <span class="mono inst-metrica-label">Alumnos inscritos</span>
            <span class="display inst-metrica-valor">{{ metricas.alumnos }}</span>
          </div>
          <div class="card inst-metrica">
            <span class="mono inst-metrica-label">Comentarios (7 días)</span>
            <span class="display inst-metrica-valor">{{ metricas.comentarios7d }}</span>
          </div>
          <div class="card inst-metrica">
            <span class="mono inst-metrica-label">Ocultos por moderación</span>
            <span class="display inst-metrica-valor">{{ metricas.ocultos }}</span>
          </div>
          <div class="card inst-metrica">
            <span class="mono inst-metrica-label">Sesiones programadas</span>
            <span class="display inst-metrica-valor">{{ metricas.sesionesProgramadas }}</span>
          </div>
        </section>

        <div class="inst-grid">
          <!-- Comentarios / moderación -->
          <section class="card inst-panel">
            <h2 class="inst-panel-titulo">Comentarios recientes</h2>
            <p v-if="!comentarios.length" class="inst-vacio">Sin comentarios en este curso.</p>
            <ul v-else class="inst-comentarios">
              <li
                v-for="c in comentarios"
                :key="c.id"
                class="inst-comentario"
                :class="{ 'is-oculto': c.oculto, 'is-destacado': c.destacado }"
              >
                <div class="inst-comentario-meta">
                  <strong>{{ nombreCorto(c.perfiles) }}</strong>
                  <span class="mono">{{ c.lecciones?.titulo }}</span>
                  <span class="mono inst-fecha">{{ fmtFecha(c.creado_en) }}</span>
                  <span v-if="c.oculto" class="chip">Oculto</span>
                  <span v-if="c.destacado" class="chip chip-oro">Destacado</span>
                </div>
                <p class="inst-comentario-texto">
                  {{ c.contenido }}
                </p>
                <div class="inst-acciones">
                  <button
                    v-if="!c.oculto"
                    class="btn btn-ghost btn-sm"
                    @click="onModerar(c, 'ocultar')"
                  >
                    Ocultar
                  </button>
                  <button v-else class="btn btn-ghost btn-sm" @click="onModerar(c, 'mostrar')">
                    Mostrar
                  </button>
                  <button
                    v-if="!c.destacado"
                    class="btn btn-ghost btn-sm"
                    @click="onModerar(c, 'destacar')"
                  >
                    Destacar
                  </button>
                  <button
                    v-else
                    class="btn btn-ghost btn-sm"
                    @click="onModerar(c, 'quitar_destacado')"
                  >
                    Quitar destacado
                  </button>
                  <button
                    class="btn btn-ghost btn-sm inst-eliminar"
                    @click="onModerar(c, 'eliminar')"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            </ul>
          </section>

          <div class="inst-col">
            <!-- Entregas por revisar (módulo LMS 3) -->
            <section v-if="entregasHabilitadas" class="card inst-panel">
              <div class="inst-panel-head">
                <h2 class="inst-panel-titulo">Entregas</h2>
                <select v-model="filtroEntregas" class="inst-filtro mono">
                  <option value="">Todas</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="revisada">Revisadas</option>
                  <option value="aprobada">Aprobadas</option>
                  <option value="rechazada">Rechazadas</option>
                </select>
              </div>
              <p v-if="!entregasFiltradas.length" class="inst-vacio">
                Sin entregas{{ filtroEntregas ? ' en este estado' : '' }}.
              </p>
              <ul v-else class="inst-entregas">
                <li v-for="e in entregasFiltradas" :key="e.id" class="inst-entrega">
                  <div class="inst-entrega-meta">
                    <strong>{{ nombreCorto(e.perfiles) }}</strong>
                    <span class="mono">{{ e.lecciones?.titulo }}</span>
                    <span class="chip" :data-estado="e.estado">{{
                      ESTADO_LABEL[e.estado] || e.estado
                    }}</span>
                  </div>
                  <div class="inst-entrega-archivo">
                    <a href="#" @click.prevent="descargarEntrega(e)">📎 {{ e.archivo_nombre }}</a>
                    <span class="mono inst-fecha"
                      >v{{ e.version }} · {{ fmtBytes(e.archivo_bytes) }} ·
                      {{ fmtFecha(e.creado_en) }}</span
                    >
                  </div>
                  <p v-if="e.comentario_instructor" class="inst-entrega-comentario">
                    {{ e.comentario_instructor }}
                  </p>
                  <div class="inst-acciones">
                    <button class="btn btn-ghost btn-sm" @click="onRevisar(e, 'aprobada')">
                      Aprobar
                    </button>
                    <button class="btn btn-ghost btn-sm" @click="onRevisar(e, 'revisada')">
                      Revisada
                    </button>
                    <button
                      class="btn btn-ghost btn-sm inst-eliminar"
                      @click="onRevisar(e, 'rechazada')"
                    >
                      Rechazar
                    </button>
                  </div>
                </li>
              </ul>
            </section>

            <!-- Alumnos -->
            <section class="card inst-panel">
              <h2 class="inst-panel-titulo">Alumnos inscritos</h2>
              <p v-if="!alumnos.length" class="inst-vacio">Nadie se ha inscrito todavía.</p>
              <table v-else class="inst-tabla">
                <thead>
                  <tr>
                    <th class="mono">Nombre</th>
                    <th class="mono">Dependencia</th>
                    <th class="mono">Inscrito</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="a in alumnos" :key="a.user_id">
                    <td>{{ nombreCorto(a.perfiles) }}</td>
                    <td>
                      <span v-if="a.perfiles?.dependencias?.siglas" class="chip">{{
                        a.perfiles.dependencias.siglas
                      }}</span>
                    </td>
                    <td class="mono inst-fecha">
                      {{ fmtFecha(a.inscrito_en) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <!-- Log de moderación -->
            <section class="card inst-panel">
              <h2 class="inst-panel-titulo">Log de moderación</h2>
              <p v-if="!log.length" class="inst-vacio">Sin acciones registradas.</p>
              <ul v-else class="inst-log">
                <li v-for="l in log" :key="l.id" class="mono">
                  <span class="inst-fecha">{{ fmtFecha(l.creado_en) }}</span>
                  — {{ nombreCorto(l.perfiles) }} · {{ ACCION_LABEL[l.accion] || l.accion }}
                  {{ l.tipo_objetivo }}
                </li>
              </ul>
            </section>
          </div>
        </div>

        <!-- Aulas virtuales (módulo LMS 4): gestión de sesiones del curso -->
        <SesionesVirtualesPanel
          v-if="featureEnabled('aulas')"
          :key="cursoActivo.id"
          :curso-id="cursoActivo.id"
          :session="session"
          :perfil="perfil"
          gestion
        />

        <!-- Reportes por instructor (Fase H2) -->
        <InstructorReportPanel
          v-if="featureEnabled('reportes_avanzados')"
          :instructor-id="session?.user?.id"
        />

        <!-- Analytics de video (Fase J) -->
        <InstructorVideoDashboard v-if="featureEnabled('video_analytics')" />
      </template>
    </template>
  </main>
</template>

<style scoped>
.instructor-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: calc(var(--unit) * 4) calc(var(--unit) * 3) calc(var(--unit) * 8);
}
.inst-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: calc(var(--unit) * 2);
  flex-wrap: wrap;
  margin-bottom: calc(var(--unit) * 3);
}
.inst-header h1 {
  font-size: 32px;
  color: var(--ink);
  margin-top: 4px;
}
.inst-curso-select {
  min-width: 260px;
}
.inst-error {
  color: var(--primary);
  margin-bottom: calc(var(--unit) * 2);
}
.inst-empty {
  min-height: 40vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: calc(var(--unit) * 2);
  text-align: center;
  color: var(--ink-3);
}
.inst-metricas {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: calc(var(--unit) * 2);
  margin-bottom: calc(var(--unit) * 3);
}
.inst-metrica {
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.inst-metrica-label {
  font-size: 10px;
  color: var(--ink-3);
}
.inst-metrica-valor {
  font-size: 40px;
  line-height: 1;
  color: var(--ink);
}
.inst-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: calc(var(--unit) * 2);
  align-items: start;
}
.inst-col {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.inst-panel {
  padding: calc(var(--unit) * 2.5);
}
.inst-panel-titulo {
  font-size: 16px;
  color: var(--ink);
  margin-bottom: calc(var(--unit) * 2);
}
.inst-vacio {
  color: var(--ink-4);
  font-size: 14px;
}
.inst-comentarios {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.inst-comentario {
  border-bottom: 1px solid var(--paper-3, #eee);
  padding-bottom: calc(var(--unit) * 1.5);
}
.inst-comentario.is-oculto {
  opacity: 0.55;
}
.inst-comentario.is-destacado {
  box-shadow: inset 3px 0 0 var(--brand-accent, #a57f2c);
  padding-left: calc(var(--unit) * 1.5);
}
.inst-comentario-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--ink-3);
}
.inst-comentario-meta strong {
  color: var(--ink);
}
.inst-comentario-texto {
  margin: 6px 0 8px;
  font-size: 14px;
  color: var(--ink-2);
}
.inst-acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.inst-eliminar {
  color: var(--primary);
}
.inst-fecha {
  font-size: 11px;
  color: var(--ink-4);
}
.chip-oro {
  background: var(--brand-accent-soft, #e6d194);
  color: #8a6e3f;
}
.inst-tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.inst-tabla th {
  text-align: left;
  font-size: 10px;
  color: var(--ink-3);
  padding: 6px 8px;
  border-bottom: 1px solid var(--paper-3, #eee);
}
.inst-tabla td {
  padding: 8px;
  border-bottom: 1px solid var(--paper-2, #f5f5f5);
}
.inst-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: calc(var(--unit) * 1.5);
}
.inst-panel-head .inst-panel-titulo {
  margin-bottom: 0;
}
.inst-filtro {
  font-size: 11px;
  padding: 4px 8px;
}
.inst-entregas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.inst-entrega {
  border-bottom: 1px solid var(--paper-3, #eee);
  padding-bottom: calc(var(--unit) * 1.5);
}
.inst-entrega-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--ink-3);
}
.inst-entrega-meta strong {
  color: var(--ink);
}
.inst-entrega-meta .chip[data-estado='aprobada'] {
  background: var(--brand-secondary-soft, #d8e6e1);
  color: var(--brand-secondary, #1e5b4f);
}
.inst-entrega-meta .chip[data-estado='rechazada'] {
  background: var(--primary-100, #f0dce4);
  color: var(--primary, #9b2247);
}
.inst-entrega-archivo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 6px 0;
  font-size: 14px;
}
.inst-entrega-archivo a {
  color: var(--ink);
}
.inst-entrega-comentario {
  font-size: 12px;
  color: var(--ink-3);
  background: var(--paper-2, #f8f5ee);
  padding: 6px 10px;
  border-left: 3px solid var(--brand-accent, #a57f2c);
  margin-bottom: 6px;
}
.inst-log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-3);
}

@media (max-width: 900px) {
  .inst-metricas {
    grid-template-columns: repeat(2, 1fr);
  }
  .inst-grid {
    grid-template-columns: 1fr;
  }
}
</style>
