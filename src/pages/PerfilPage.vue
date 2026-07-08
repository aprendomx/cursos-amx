<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/lib/supabase.js'
import { tiempoPorUsuario, formatearDuracion } from '@/services/tiempo.js'
import { featureEnabled } from '@/lib/featureFlags.js'
import { useGamificacion } from '@/composables/useGamificacion.js'
import IconSet from '@/components/IconSet.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import PlaceholderImage from '@/components/PlaceholderImage.vue'
import AppLogo from '@/components/AppLogo.vue'
import BadgeDisplay from '@/components/BadgeDisplay.vue'
import MiCalendario from '@/components/MiCalendario.vue'
import UserLevelBar from '@/components/UserLevelBar.vue'
import { theme } from '@/lib/theme.js'

const router = useRouter()
const auth = useAuthStore()

const user = computed(() => auth.user)

const cursosList = ref([])
const userStats = ref({
  cursos_activos: 0,
  cursos_completados: 0,
  horas: 0,
  constancias: 0,
})
const loading = ref(true)
const fetchError = ref(null)

const gamificacionHabilitada = featureEnabled('gamificacion')
const gamificacion = ref(null)

onMounted(async () => {
  // Guard: sin sesión → login
  if (!auth.session) {
    router.push({ name: 'login' })
    return
  }

  try {
    const userId = auth.session.user.id

    const [inscripcionesRes, cursosRes, constanciasRes, progresoRes, tiempoRows] =
      await Promise.all([
        supabase.from('inscripciones').select('curso_id').eq('user_id', userId),
        supabase
          .from('cursos')
          .select(
            'id, slug, titulo, descripcion, imagen_portada, nivel, duracion_min, publicado, modulos(id, lecciones(id, duracion_seg))'
          )
          .order('creado_en', { ascending: false }),
        supabase.from('constancias').select('curso_id, folio').eq('user_id', userId),
        supabase
          .from('progreso')
          .select('leccion_id, completado, segundos_vistos')
          .eq('user_id', userId),
        tiempoPorUsuario(userId).catch(() => []),
      ])

    const firstError =
      cursosRes.error || inscripcionesRes.error || constanciasRes.error || progresoRes.error
    if (firstError) throw firstError

    // Tiempo activo (plataforma) por curso, desde tiempo_curso.
    const tiempoPorCurso = new Map(
      (tiempoRows || []).map((r) => [r.curso_id, r.segundos_activos || 0])
    )

    const inscritoSet = new Set((inscripcionesRes.data || []).map((i) => i.curso_id))
    const constanciasByCurso = new Map(
      (constanciasRes.data || []).map((c) => [c.curso_id, c.folio])
    )
    const completadasPorLeccion = new Set(
      (progresoRes.data || []).filter((p) => p.completado).map((p) => p.leccion_id)
    )

    // Mapa leccion → curso, derivado del nested select de cursos.
    const leccionToCurso = new Map()
    for (const c of cursosRes.data || []) {
      for (const m of c.modulos || []) {
        for (const l of m.lecciones || []) {
          leccionToCurso.set(l.id, c.id)
        }
      }
    }
    // Cursos donde el user tiene cualquier progreso (visto o completado).
    const cursosConProgreso = new Set()
    for (const p of progresoRes.data || []) {
      const cursoId = leccionToCurso.get(p.leccion_id)
      if (cursoId) cursosConProgreso.add(cursoId)
    }

    cursosList.value = (cursosRes.data || []).map((c) => {
      const todasLasLecciones = (c.modulos || []).flatMap((m) => m.lecciones || [])
      const totalLecciones = todasLasLecciones.length
      const leccionesCompletadas = todasLasLecciones.filter((l) =>
        completadasPorLeccion.has(l.id)
      ).length
      const min = c.duracion_min || 0
      // "Activo" = inscripción explícita O cualquier progreso registrado.
      // La app aún no llama inscribirse() automáticamente, así que muchos
      // usuarios solo tendrán filas en progreso sin inscripcion.
      const activo = inscritoSet.has(c.id) || cursosConProgreso.has(c.id)
      return {
        id: c.id,
        slug: c.slug,
        titulo: c.titulo,
        descripcion: c.descripcion,
        nivel: c.nivel,
        duracion: min > 0 ? `${Math.floor(min / 60)}h ${min % 60}min` : '',
        imagen: c.imagen_portada || c.titulo?.split(' ')[0] || '',
        lecciones: totalLecciones,
        leccionesCompletadas,
        progreso: totalLecciones > 0 ? leccionesCompletadas / totalLecciones : 0,
        folio: constanciasByCurso.get(c.id) || null,
        tiempoActivoSeg: tiempoPorCurso.get(c.id) || 0,
        tiempoActivo: formatearDuracion(tiempoPorCurso.get(c.id) || 0),
        _inscrito: activo,
        _completado: constanciasByCurso.has(c.id),
        _publicado: c.publicado === true,
      }
    })

    // "Horas de estudio" = tiempo activo real en plataforma (tiempo_curso).
    // Si aún no hay datos de tiempo activo (usuarios previos), cae al tiempo
    // de video visto como aproximación.
    const segundosActivos = [...tiempoPorCurso.values()].reduce((s, n) => s + n, 0)
    const segundosVistos = (progresoRes.data || []).reduce(
      (s, p) => s + (p.segundos_vistos || 0),
      0
    )
    const segundosTotales = segundosActivos || segundosVistos

    userStats.value = {
      cursos_activos: cursosList.value.filter((c) => c._inscrito && !c._completado).length,
      cursos_completados: cursosList.value.filter((c) => c._completado).length,
      horas: Math.round(segundosTotales / 3600),
      constancias: cursosList.value.filter((c) => c._completado).length,
    }

    if (gamificacionHabilitada && auth.session?.user?.id) {
      gamificacion.value = useGamificacion(auth.session.user.id)
      await gamificacion.value.cargar()
    }
  } catch (err) {
    console.error('Error cargando perfil desde Supabase:', err)
    fetchError.value = err?.message || 'No se pudo conectar con el servidor.'
    cursosList.value = []
  } finally {
    loading.value = false
  }
})

const cursosEnCurso = computed(() => cursosList.value.filter((c) => c._inscrito && !c._completado))
const cursosCompletados = computed(() => cursosList.value.filter((c) => c._completado))
const cursosRecomendados = computed(() =>
  cursosList.value.filter((c) => !c._inscrito && c._publicado).slice(0, 3)
)

const kpis = computed(() => [
  { label: 'Cursos activos', value: userStats.value.cursos_activos },
  { label: 'Completados', value: userStats.value.cursos_completados },
  { label: 'Horas de estudio', value: userStats.value.horas },
  { label: 'Constancias', value: userStats.value.constancias },
])

function nextLessonHint(curso) {
  const remaining = curso.lecciones - curso.leccionesCompletadas
  return `Siguiente: Lección ${curso.leccionesCompletadas + 1} de ${curso.lecciones} · ${remaining} restantes`
}

function goToCurso(curso) {
  router.push({ name: 'curso', params: { id: curso.id } })
}

function goToConstancia(curso) {
  router.push({ name: 'constancia', params: { cursoId: curso.id } })
}

function goToHome() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="perfil-hero container">
      <div class="perfil-hero-text">
        <h1 class="display perfil-greeting">
          Hola,
          <em class="display-italic" :style="{ color: 'var(--primary)' }">{{ user?.nombre }}.</em>
        </h1>
        <p :style="{ fontSize: '14px', color: 'var(--ink-3)', marginTop: 'calc(var(--unit) * 1)' }">
          {{ user?.dependencia }} &middot; {{ user?.correo }}
        </p>
      </div>

      <!-- KPI grid -->
      <div class="perfil-kpi-grid">
        <div v-for="kpi in kpis" :key="kpi.label" class="perfil-kpi">
          <div class="display perfil-kpi-number">
            {{ kpi.value }}
          </div>
          <div class="eyebrow" :style="{ marginTop: '6px' }">
            {{ kpi.label }}
          </div>
        </div>
      </div>
    </section>

    <!-- Error block (global) -->
    <div v-if="fetchError" class="container perfil-error">
      <p class="eyebrow" :style="{ color: 'var(--danger)' }">Error de conexi&oacute;n</p>
      <p :style="{ marginTop: '8px', color: 'var(--ink-2)' }">
        {{ fetchError }}
      </p>
      <p :style="{ marginTop: '4px', color: 'var(--ink-3)', fontSize: '13px' }">
        Verifica las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.
      </p>
    </div>

    <!-- Gamificacion -->
    <section
      v-if="gamificacionHabilitada && !loading"
      class="container perfil-section"
      style="padding-top: calc(var(--unit) * 6); padding-bottom: calc(var(--unit) * 4)"
    >
      <div class="perfil-section-header">
        <span class="mono" :style="{ color: 'var(--ink-4)' }">00</span>
        <h2 class="display" :style="{ fontSize: '32px', color: 'var(--ink)' }">Logros</h2>
      </div>
      <UserLevelBar
        :puntos="gamificacion.puntos"
        :nivel="gamificacion.nivel"
        :niveles="gamificacion.niveles"
      />
      <div class="perfil-badge-grid" :style="{ marginTop: 'calc(var(--unit) * 3)' }">
        <BadgeDisplay
          v-for="badge in gamificacion.badges"
          :key="badge.id"
          :badge="badge"
          :desbloqueado="gamificacion.badgesIdsUsuario.has(badge.id)"
        />
      </div>
    </section>

    <!-- Mi Calendario (Fase L) -->
    <section
      v-if="featureEnabled('sesiones_virtuales') && auth.session?.user?.id"
      class="container perfil-section"
    >
      <MiCalendario :user-id="auth.session.user.id" />
    </section>

    <!-- Divider -->
    <hr class="hairline" />

    <!-- En curso section (01) -->
    <section class="container perfil-section">
      <div class="perfil-section-header">
        <span class="mono" :style="{ color: 'var(--ink-4)' }">01</span>
        <h2 class="display" :style="{ fontSize: '32px', color: 'var(--ink)' }">En curso</h2>
      </div>

      <div v-if="loading" class="perfil-empty">
        <span class="mono" :style="{ color: 'var(--ink-3)' }">Cargando&hellip;</span>
      </div>

      <div v-else-if="cursosEnCurso.length === 0" class="perfil-empty">
        <p :style="{ color: 'var(--ink-2)', marginBottom: 'calc(var(--unit) * 2)' }">
          A&uacute;n no tienes cursos en curso.
        </p>
        <button class="btn btn-primary btn-sm" @click="goToHome">
          Explora el cat&aacute;logo
          <IconSet name="arrow" />
        </button>
      </div>

      <div v-else class="perfil-progress-grid">
        <div
          v-for="(curso, i) in cursosEnCurso"
          :key="curso.id"
          class="card perfil-progress-card fade-in"
          :style="{ animationDelay: i * 60 + 'ms' }"
        >
          <div class="perfil-progress-body">
            <!-- Eyebrow -->
            <p class="eyebrow">{{ curso.nivel }} &middot; {{ curso.duracion }}</p>

            <!-- Title -->
            <h3
              class="display"
              :style="{ fontSize: '24px', lineHeight: '1.1', color: 'var(--ink)' }"
            >
              {{ curso.titulo }}
            </h3>

            <!-- Progress percentage -->
            <div
              :style="{
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px',
                marginTop: 'calc(var(--unit) * 1)',
              }"
            >
              <span class="display" :style="{ fontSize: '36px', color: 'var(--primary)' }">
                {{ Math.round(curso.progreso * 100) }}%
              </span>
              <span class="mono" :style="{ color: 'var(--ink-4)' }">completado</span>
            </div>

            <!-- ProgressBar -->
            <ProgressBar :value="curso.progreso" />

            <!-- Next lesson hint -->
            <p
              class="mono"
              :style="{ color: 'var(--ink-3)', marginTop: 'calc(var(--unit) * 1.5)' }"
            >
              {{ nextLessonHint(curso) }}
            </p>

            <!-- Tiempo activo en el curso -->
            <p
              class="mono"
              :style="{ color: 'var(--ink-4)', marginTop: 'calc(var(--unit) * 0.5)' }"
            >
              Tiempo en plataforma: {{ curso.tiempoActivo }}
            </p>

            <!-- Continuar button -->
            <button
              class="btn btn-primary btn-sm"
              :style="{ alignSelf: 'flex-start', marginTop: 'calc(var(--unit) * 2)' }"
              @click="goToCurso(curso)"
            >
              Continuar
              <IconSet name="arrow" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Completados section (02) -->
    <section class="perfil-completados">
      <div class="container perfil-section">
        <div class="perfil-section-header">
          <span class="mono" :style="{ color: 'var(--ink-4)' }">02</span>
          <h2 class="display" :style="{ fontSize: '32px', color: 'var(--ink)' }">Completados</h2>
        </div>

        <div v-if="loading" class="perfil-empty">
          <span class="mono" :style="{ color: 'var(--ink-3)' }">Cargando&hellip;</span>
        </div>

        <div v-else-if="cursosCompletados.length === 0" class="perfil-empty">
          <p :style="{ color: 'var(--ink-2)' }">A&uacute;n no has completado cursos.</p>
        </div>

        <div v-else class="perfil-cert-grid">
          <div
            v-for="(curso, i) in cursosCompletados"
            :key="curso.id"
            class="perfil-cert-row fade-in"
            :style="{ animationDelay: i * 60 + 'ms' }"
          >
            <!-- Certificate icon -->
            <div class="perfil-cert-icon">
              <svg
                width="56"
                height="70"
                viewBox="0 0 56 70"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="1"
                  y="1"
                  width="54"
                  height="68"
                  rx="2"
                  stroke="var(--brand-accent)"
                  stroke-width="1.5"
                />
                <rect
                  x="6"
                  y="6"
                  width="44"
                  height="58"
                  rx="1"
                  stroke="var(--brand-accent)"
                  stroke-width="0.75"
                  stroke-dasharray="2 2"
                />
                <text
                  x="28"
                  y="30"
                  text-anchor="middle"
                  font-family="var(--display)"
                  font-size="10"
                  fill="var(--brand-accent)"
                  font-style="italic"
                >
                  C
                </text>
                <line
                  x1="16"
                  y1="40"
                  x2="40"
                  y2="40"
                  stroke="var(--brand-accent)"
                  stroke-width="0.75"
                />
                <line
                  x1="20"
                  y1="46"
                  x2="36"
                  y2="46"
                  stroke="var(--brand-accent)"
                  stroke-width="0.5"
                />
                <line
                  x1="22"
                  y1="52"
                  x2="34"
                  y2="52"
                  stroke="var(--brand-accent)"
                  stroke-width="0.5"
                />
              </svg>
            </div>

            <!-- Info -->
            <div class="perfil-cert-info">
              <p class="eyebrow">Constancia &middot; Emitida</p>
              <h3
                class="display"
                :style="{ fontSize: '20px', lineHeight: '1.15', color: 'var(--ink)' }"
              >
                {{ curso.titulo }}
              </h3>
              <p class="mono" :style="{ color: 'var(--ink-4)', marginTop: '4px' }">
                Folio {{ curso.folio }}
              </p>
            </div>

            <!-- Action -->
            <button class="btn btn-ghost btn-sm" @click="goToConstancia(curso)">
              Ver
              <IconSet name="arrow" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Recomendados section (03) -->
    <section v-if="!loading && cursosRecomendados.length > 0" class="container perfil-section">
      <div class="perfil-section-header">
        <span class="mono" :style="{ color: 'var(--ink-4)' }">03</span>
        <h2 class="display" :style="{ fontSize: '32px', color: 'var(--ink)' }">Recomendados</h2>
      </div>

      <div class="perfil-rec-grid">
        <div
          v-for="(curso, i) in cursosRecomendados"
          :key="curso.id"
          class="card perfil-rec-card fade-in"
          :style="{ animationDelay: i * 60 + 'ms', cursor: 'pointer' }"
          @click="goToCurso(curso)"
        >
          <PlaceholderImage :label="curso.imagen" :style="{ aspectRatio: '16/9', width: '100%' }" />
          <div class="perfil-rec-body">
            <p class="eyebrow">{{ curso.nivel }} &middot; {{ curso.duracion }}</p>
            <h3
              class="display"
              :style="{ fontSize: '20px', lineHeight: '1.1', color: 'var(--ink)' }"
            >
              {{ curso.titulo }}
            </h3>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="perfil-footer">
      <div
        class="container"
        :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }"
      >
        <AppLogo />
        <span class="mono" :style="{ color: 'var(--ink-4)' }">
          {{ theme.app.name }} &middot; {{ theme.nav.title }}
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Hero */
.perfil-hero {
  padding-top: calc(var(--unit) * 10);
  padding-bottom: calc(var(--unit) * 8);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 5);
}

.perfil-greeting {
  font-size: clamp(40px, 4.5vw, 64px);
  color: var(--ink);
}

/* KPI grid */
.perfil-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: calc(var(--unit) * 3);
  padding-top: calc(var(--unit) * 4);
  border-top: 1px solid var(--line);
}

.perfil-kpi {
  display: flex;
  flex-direction: column;
}

.perfil-kpi-number {
  font-size: 42px;
  color: var(--ink);
  line-height: 1;
}

/* Sections */
.perfil-section {
  padding-top: calc(var(--unit) * 8);
  padding-bottom: calc(var(--unit) * 8);
}

.perfil-section-header {
  display: flex;
  align-items: baseline;
  gap: calc(var(--unit) * 2);
  margin-bottom: calc(var(--unit) * 4);
}

/* En curso cards */
.perfil-progress-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: calc(var(--unit) * 3);
}

.perfil-progress-body {
  padding: calc(var(--unit) * 3);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
}

/* Completados */
.perfil-completados {
  background: var(--paper-2);
}

.perfil-cert-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: calc(var(--unit) * 3);
}

.perfil-cert-row {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 3);
  padding: calc(var(--unit) * 2.5);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 2px;
}

.perfil-cert-icon {
  flex-shrink: 0;
}

.perfil-cert-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Recomendados */
.perfil-rec-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--unit) * 3);
}

.perfil-rec-body {
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
}

/* Footer */
.perfil-footer {
  border-top: 1px solid var(--line);
  padding: calc(var(--unit) * 5) 0;
  margin-top: calc(var(--unit) * 4);
}

/* Badge grid */
.perfil-badge-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--unit) * 2);
}

/* Empty / error states */
.perfil-empty {
  padding: calc(var(--unit) * 6) 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--unit) * 1);
}
.perfil-error {
  margin: calc(var(--unit) * 3) auto;
  padding: calc(var(--unit) * 3) calc(var(--unit) * 4);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
  border-radius: 4px;
  text-align: center;
}
</style>
