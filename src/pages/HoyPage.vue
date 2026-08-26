<!-- src/pages/HoyPage.vue — el destino post-login (pantalla 02 de la
     propuesta «hábito con recompensa»).

     Una sola pregunta y una sola acción de acento: ¿dónde sigo hoy? La racha
     y la meta del día encabezan SOLO con `gamificacion` encendido; apagado,
     la pantalla se degrada a «continuar + siguientes + catálogo» sin huecos.

     `/` sigue siendo el catálogo público: esta ruta no lo secuestra — solo el
     fallback post-login apunta aquí (App.vue). -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/lib/supabase.js'
import { featureEnabled } from '@/lib/featureFlags.js'
import { useGamificacion } from '@/composables/useGamificacion.js'
import { categoriaVisual, inicialPortada } from '@/lib/categoriaVisual.js'
import BadgeDisplay from '@/components/BadgeDisplay.vue'
import UserLevelBar from '@/components/UserLevelBar.vue'
import IconSet from '@/components/IconSet.vue'

const router = useRouter()
const auth = useAuthStore()

const conGamificacion = featureEnabled('gamificacion')

const loading = ref(true)
const fetchError = ref(null)
const cursos = ref([])
const inscritos = ref(new Set())

const userId = auth.session?.user?.id
const gamificacion = conGamificacion && userId ? useGamificacion(userId) : null

onMounted(async () => {
  try {
    const [inscripcionesRes, cursosRes, progresoRes] = await Promise.all([
      supabase.from('inscripciones').select('curso_id').eq('user_id', userId),
      supabase
        .from('cursos')
        .select('id, titulo, descripcion, nivel, imagen_portada, modulos(id, lecciones(id))')
        .eq('publicado', true)
        .order('creado_en', { ascending: false }),
      supabase.from('progreso').select('leccion_id, completado').eq('user_id', userId),
    ])
    const firstError = inscripcionesRes.error || cursosRes.error || progresoRes.error
    if (firstError) throw firstError

    inscritos.value = new Set((inscripcionesRes.data || []).map((i) => i.curso_id))
    const completadas = new Set(
      (progresoRes.data || []).filter((p) => p.completado).map((p) => p.leccion_id)
    )

    cursos.value = (cursosRes.data || []).map((c) => {
      const lecciones = (c.modulos || []).flatMap((m) => m.lecciones || [])
      const total = lecciones.length
      const hechas = lecciones.filter((l) => completadas.has(l.id)).length
      return {
        id: c.id,
        titulo: c.titulo,
        descripcion: c.descripcion,
        nivel: c.nivel,
        totalLecciones: total,
        hechas,
        progreso: total > 0 ? hechas / total : 0,
        inscrito: inscritos.value.has(c.id),
      }
    })
  } catch (e) {
    fetchError.value = e?.message || 'No se pudo cargar tu día.'
  } finally {
    loading.value = false
  }
  if (gamificacion) gamificacion.cargar()
})

// «Sigue aquí»: el curso inscrito con avance a medias; si no hay, el inscrito
// sin empezar. Nunca un curso terminado.
const cursoEnCurso = computed(() => {
  const abiertos = cursos.value.filter((c) => c.inscrito && c.progreso < 1)
  return abiertos.find((c) => c.progreso > 0) || abiertos[0] || null
})

// Dos siguientes: primero otros inscritos abiertos, luego catálogo no inscrito.
const siguientes = computed(() => {
  const actual = cursoEnCurso.value?.id
  const otrosInscritos = cursos.value.filter((c) => c.inscrito && c.progreso < 1 && c.id !== actual)
  const noInscritos = cursos.value.filter((c) => !c.inscrito)
  return [...otrosInscritos, ...noInscritos].slice(0, 2)
})

const insigniasRecientes = computed(() =>
  gamificacion ? gamificacion.badgesUsuario.value.slice(0, 4) : []
)

const racha = computed(
  () => gamificacion?.racha.value || { racha_actual: 0, mejor_racha: 0, activo_hoy: false }
)

function continuar(curso) {
  // Sin leccionId: el reproductor abre la primera lección incompleta.
  router.push({ name: 'player', params: { cursoId: curso.id, leccionId: '' } })
}
function verCurso(curso) {
  router.push({ name: 'curso', params: { id: curso.id } })
}
function irCatalogo() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="container hoy">
    <header class="hoy-head">
      <p class="eyebrow">Hoy</p>
      <h1 class="display hoy-titulo">Hola, {{ auth.user.nombre || 'de nuevo' }}</h1>
    </header>

    <div v-if="loading" class="hoy-estado mono">Cargando tu día…</div>
    <div v-else-if="fetchError" class="hoy-estado">
      <p class="eyebrow" :style="{ color: 'var(--danger)' }">No se pudo cargar</p>
      <p :style="{ color: 'var(--ink-2)', marginTop: '8px' }">
        {{ fetchError }}
      </p>
    </div>

    <template v-else>
      <!-- Meta del día y racha: solo con gamificación. -->
      <section v-if="conGamificacion" class="hoy-racha tarjeta-plana" aria-label="Meta del día">
        <div class="hoy-racha-anillo" :class="{ 'is-hecho': racha.activo_hoy }" aria-hidden="true">
          <IconSet v-if="racha.activo_hoy" name="check" />
          <span v-else class="hoy-racha-num display">{{ racha.racha_actual }}</span>
        </div>
        <div class="hoy-racha-texto">
          <strong v-if="racha.activo_hoy"
            >Hoy ya cuenta. Racha de {{ racha.racha_actual }}
            {{ racha.racha_actual === 1 ? 'día' : 'días' }}.</strong
          >
          <strong v-else-if="racha.racha_actual > 0"
            >Llevas {{ racha.racha_actual }} {{ racha.racha_actual === 1 ? 'día' : 'días' }}:
            estudia hoy y sigue la racha.</strong
          >
          <strong v-else>Empieza tu racha hoy: una lección basta.</strong>
          <span v-if="racha.mejor_racha > 1" class="hoy-racha-mejor mono"
            >Mejor racha: {{ racha.mejor_racha }} días</span
          >
        </div>
      </section>

      <!-- Sigue aquí: la única acción de acento de la pantalla. -->
      <section v-if="cursoEnCurso" class="hoy-seccion">
        <p class="eyebrow">Sigue aquí</p>
        <article class="tarjeta-dura hoy-continuar">
          <div
            class="hoy-continuar-inicial"
            :class="`pastel-${categoriaVisual(cursoEnCurso)}`"
            aria-hidden="true"
          >
            <span class="display">{{ inicialPortada(cursoEnCurso.titulo) }}</span>
          </div>
          <div class="hoy-continuar-cuerpo">
            <h2 class="display hoy-continuar-titulo">
              {{ cursoEnCurso.titulo }}
            </h2>
            <p class="hoy-continuar-avance mono">
              {{ cursoEnCurso.hechas }} de {{ cursoEnCurso.totalLecciones }} lecciones
            </p>
            <button class="btn btn-primary" @click="continuar(cursoEnCurso)">
              {{ cursoEnCurso.progreso > 0 ? 'Continuar' : 'Comenzar' }}
              <IconSet name="arrow" />
            </button>
          </div>
        </article>
      </section>

      <section v-else class="hoy-seccion">
        <p class="eyebrow">Sigue aquí</p>
        <div class="tarjeta-plana hoy-vacio">
          <p>
            No tienes ningún curso a medias. Elige uno del catálogo y hoy mismo cuenta como día de
            estudio.
          </p>
          <button class="btn btn-primary" @click="irCatalogo">
            Ver catálogo <IconSet name="arrow" />
          </button>
        </div>
      </section>

      <section v-if="siguientes.length" class="hoy-seccion">
        <p class="eyebrow">Siguientes</p>
        <div class="hoy-siguientes">
          <button
            v-for="c in siguientes"
            :key="c.id"
            class="tarjeta-dura hoy-siguiente"
            type="button"
            @click="verCurso(c)"
          >
            <span class="hoy-siguiente-inicial" :class="`pastel-${categoriaVisual(c)}`">
              {{ inicialPortada(c.titulo) }}
            </span>
            <span class="hoy-siguiente-texto">
              <span class="hoy-siguiente-titulo">{{ c.titulo }}</span>
              <span class="mono hoy-siguiente-meta">{{ c.nivel || 'Curso' }}</span>
            </span>
          </button>
        </div>
      </section>

      <template v-if="conGamificacion && gamificacion">
        <section class="hoy-seccion">
          <UserLevelBar
            :puntos="gamificacion.puntos.value"
            :nivel="gamificacion.nivel.value"
            :niveles="gamificacion.niveles.value"
          />
        </section>

        <section v-if="insigniasRecientes.length" class="hoy-seccion">
          <p class="eyebrow">Insignias recientes</p>
          <div class="hoy-insignias">
            <BadgeDisplay
              v-for="bu in insigniasRecientes"
              :key="bu.id"
              :badge="bu.badges || {}"
              :desbloqueado="true"
            />
          </div>
        </section>
      </template>

      <p class="hoy-catalogo-alt">
        <a href="#" @click.prevent="irCatalogo">Explorar todo el catálogo</a>
      </p>
    </template>
  </div>
</template>

<style scoped>
.hoy {
  padding-top: calc(var(--unit) * 4);
  padding-bottom: calc(var(--unit) * 8);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 4);
  max-width: 760px;
}
.hoy-titulo {
  font-size: clamp(28px, 5vw, 40px);
  color: var(--ink);
  margin-top: calc(var(--unit) * 1);
}
.hoy-estado {
  padding: calc(var(--unit) * 8) 0;
  text-align: center;
  color: var(--ink-3);
}

.hoy-racha {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 2) calc(var(--unit) * 2.5);
}
.hoy-racha-anillo {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 3px dashed var(--line);
  display: grid;
  place-items: center;
  color: var(--ink-2);
  flex-shrink: 0;
}
.hoy-racha-anillo.is-hecho {
  border: 3px solid var(--brand-accent);
  background: var(--brand-accent-soft);
  color: var(--sobre-accent-soft);
}
.hoy-racha-num {
  font-size: var(--text-xl);
}
.hoy-racha-texto {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-base);
  color: var(--ink);
}
.hoy-racha-mejor {
  font-size: var(--text-xs);
  color: var(--ink-3);
}

.hoy-seccion {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}

.hoy-continuar {
  display: flex;
  overflow: hidden;
}
.hoy-continuar-inicial {
  width: 96px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: var(--text-3xl);
}
.hoy-continuar-cuerpo {
  padding: calc(var(--unit) * 2.5);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
  align-items: flex-start;
}
.hoy-continuar-titulo {
  font-size: var(--text-xl);
  color: var(--ink);
}
.hoy-continuar-avance {
  font-size: var(--text-xs);
  color: var(--ink-3);
}

.hoy-vacio {
  padding: calc(var(--unit) * 3);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
  align-items: flex-start;
  color: var(--ink-2);
}

.hoy-siguientes {
  display: grid;
  grid-template-columns: 1fr;
  gap: calc(var(--unit) * 1.5);
}
@media (min-width: 640px) {
  .hoy-siguientes {
    grid-template-columns: 1fr 1fr;
  }
}
.hoy-siguiente {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 1.5);
  padding: calc(var(--unit) * 1.5);
  text-align: left;
  cursor: pointer;
}
.hoy-siguiente-inicial {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  font-family: var(--display);
  font-size: var(--text-lg);
  flex-shrink: 0;
}
.hoy-siguiente-texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.hoy-siguiente-titulo {
  font-weight: var(--weight-medium);
  color: var(--ink);
}
.hoy-siguiente-meta {
  font-size: var(--text-xs);
  color: var(--ink-3);
}

.hoy-insignias {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: calc(var(--unit) * 1.5);
}

.hoy-catalogo-alt {
  text-align: center;
}
.hoy-catalogo-alt a {
  color: var(--primary-fg);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  display: inline-flex;
  min-height: 44px;
  align-items: center;
}
</style>
