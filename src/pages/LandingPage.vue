<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase.js'
import LandingHero from '@/components/LandingHero.vue'
import LandingCursoBloque from '@/components/LandingCursoBloque.vue'
import LandingEstrategiaABC from '@/components/LandingEstrategiaABC.vue'
import LandingComoConstancia from '@/components/LandingComoConstancia.vue'
import LandingNiveles from '@/components/LandingNiveles.vue'
import LandingConstancia from '@/components/LandingConstancia.vue'
import LandingFaq from '@/components/LandingFaq.vue'
import LandingFooter from '@/components/LandingFooter.vue'

const props = defineProps({
  hasRegistered: { type: Boolean, default: false },
})

const router = useRouter()

const cursos = ref([])
const stats = ref({
  servidoresInscritos: 0,
  constanciasEmitidas: 0,
  cursosDisponibles: 0,
})
const loading = ref(true)
const fetchError = ref(null)

onMounted(async () => {
  try {
    const [cursosRes, inscripcionesRes, constanciasRes] = await Promise.all([
      supabase
        .from('cursos')
        .select(
          'id, slug, titulo, descripcion, imagen_portada, nivel, duracion_min, modulos(id, orden, titulo, imagen_portada, lecciones(id, duracion_seg))'
        )
        .eq('publicado', true)
        .order('creado_en', { ascending: false }),
      supabase.from('inscripciones').select('user_id'),
      supabase.from('constancias').select('id', { count: 'exact', head: true }),
    ])

    if (cursosRes.error) throw cursosRes.error

    cursos.value = (cursosRes.data || []).map((c) => {
      const modulos = (c.modulos || [])
        .slice()
        .sort((a, b) => (a.orden || 0) - (b.orden || 0))
        .map((m) => ({
          id: m.id,
          orden: m.orden,
          titulo: m.titulo,
          imagen_portada: m.imagen_portada,
          lecciones: m.lecciones?.length || 0,
        }))
      const totalLecciones = modulos.reduce((sum, m) => sum + m.lecciones, 0)
      const min = c.duracion_min || 0
      return {
        id: c.id,
        slug: c.slug,
        titulo: c.titulo,
        descripcion: c.descripcion,
        duracion: min > 0 ? `${Math.floor(min / 60)}h ${min % 60}min` : '',
        lecciones: totalLecciones,
        modulosCount: modulos.length,
        modulos,
        nivel: c.nivel,
        imagen: c.imagen_portada || c.titulo?.split(' ')[0] || '',
        progreso: 0,
      }
    })

    // Servidores inscritos: distinct user_id en cliente.
    const inscripcionesData = inscripcionesRes.data || []
    const distinctUsers = new Set(inscripcionesData.map((r) => r.user_id))

    stats.value = {
      servidoresInscritos: distinctUsers.size,
      constanciasEmitidas: constanciasRes.count || 0,
      cursosDisponibles: cursos.value.length,
    }
  } catch (e) {
    console.error('Error cargando portada desde Supabase:', e)
    fetchError.value = e?.message || 'No se pudo conectar con el servidor.'
    cursos.value = []
  } finally {
    loading.value = false
  }
})

const searchQuery = ref('')

function normaliza(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const cursosFiltrados = computed(() => {
  const q = normaliza(searchQuery.value)
  if (!q) return cursos.value
  return cursos.value.filter((c) => {
    return (
      normaliza(c.titulo).includes(q) ||
      normaliza(c.descripcion || '').includes(q) ||
      normaliza(c.nivel || '').includes(q)
    )
  })
})

const displayCursos = computed(() =>
  searchQuery.value ? cursosFiltrados.value : cursos.value.slice(0, 6)
)

const showStats = computed(() => {
  const s = stats.value
  return s.servidoresInscritos > 0 || s.constanciasEmitidas > 0 || s.cursosDisponibles > 0
})

const porcentajeAprobacion = computed(() => {
  if (stats.value.servidoresInscritos === 0) return null
  return Math.min(
    100,
    Math.round((stats.value.constanciasEmitidas / stats.value.servidoresInscritos) * 100)
  )
})

const cursosPorNivel = computed(() => {
  const counts = { Fundamental: 0, Intermedio: 0, Avanzado: 0 }
  for (const c of cursos.value) {
    if (counts[c.nivel] !== undefined) counts[c.nivel]++
  }
  return counts
})

function goToCurso(curso, anchor = null) {
  router.push({ name: 'curso', params: { id: curso.id }, query: anchor ? { anchor } : undefined })
}

function goToModulo({ curso, modulo }) {
  router.push({ name: 'curso', params: { id: curso.id }, query: { anchor: 'modulo-' + modulo.id } })
}

function goToRegistro() {
  router.push({ name: 'registro' })
}

function goToCatalogo() {
  router.push({ name: 'home' })
}

function onBuscar(q) {
  searchQuery.value = q
  // Scroll suave al catálogo
  setTimeout(() => {
    const el = document.getElementById('catalogo')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 50)
}

function limpiarBusqueda() {
  searchQuery.value = ''
}

// Perfiles del módulo "Estrategia ABC de las emociones".
// Los cursos específicos para cada perfil se construirán después;
// por ahora redirigimos al catálogo con una marca por perfil.
function onSeleccionarPerfilAbc(perfil) {
  // perfil ∈ { 'servidor-publico', 'brigadista' }
  router.push({ name: 'home', query: { anchor: 'catalogo', perfilAbc: perfil } })
}

function onDescargarConstancia() {
  // Si el usuario está autenticado y tiene constancia, llevarlo a su perfil
  // donde están listadas. Si no, al login. Por ahora navegamos a perfil.
  router.push({ name: props.hasRegistered ? 'perfil' : 'login' })
}

function onEnviarMensajeFaq() {
  // CTA del FAQ → correo de soporte institucional. Cuando exista un
  // formulario de contacto real (p. ej. /#/contacto) cambiar esto a
  // emit('navigate', { name: 'contacto' }).
  window.location.href =
    'mailto:REEMPLAZA_CON_CORREO_DE_SOPORTE?subject=' +
    encodeURIComponent('Consulta — Plataforma de Capacitación')
}
</script>

<template>
  <div class="landing">
    <LandingHero
      :has-registered="hasRegistered"
      :stats="stats"
      :show-stats="showStats"
      :porcentaje-aprobacion="porcentajeAprobacion"
      @registro="goToRegistro"
      @catalogo="goToCatalogo"
      @buscar="onBuscar"
    />

    <!-- Sección 3: Lista de cursos con módulos -->
    <section id="catalogo" class="container cursos-wrap">
      <div class="cursos-head">
        <p class="eyebrow">CAT&Aacute;LOGO</p>
        <h2 class="display cursos-title">
          <template v-if="searchQuery">
            Resultados para &laquo;<em class="display-italic">{{ searchQuery }}</em
            >&raquo;
          </template>
          <template v-else> Cursos disponibles. </template>
        </h2>
        <div v-if="searchQuery" class="cursos-search-meta">
          <span class="mono"
            >{{ displayCursos.length }} resultado{{ displayCursos.length === 1 ? '' : 's' }}</span
          >
          <button class="cursos-search-clear" type="button" @click="limpiarBusqueda">
            Limpiar b&uacute;squeda
          </button>
        </div>
      </div>

      <div v-if="loading" class="cursos-empty">
        <span class="mono" :style="{ color: 'var(--ink-3)' }">Cargando cursos&hellip;</span>
      </div>

      <div v-else-if="fetchError" class="cursos-empty">
        <p class="eyebrow" :style="{ color: 'var(--danger)' }">Error de conexi&oacute;n</p>
        <p :style="{ marginTop: '8px', color: 'var(--ink-2)' }">
          {{ fetchError }}
        </p>
        <p :style="{ marginTop: '4px', color: 'var(--ink-3)', fontSize: '13px' }">
          Verifica las variables <code>VITE_SUPABASE_URL</code> y
          <code>VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>

      <div v-else-if="displayCursos.length === 0" class="cursos-empty">
        <template v-if="searchQuery">
          <p class="eyebrow">Sin coincidencias</p>
          <p :style="{ marginTop: '8px', color: 'var(--ink-2)' }">
            No encontramos cursos para &laquo;{{ searchQuery }}&raquo;. Prueba con otro
            t&eacute;rmino o
            <a
              href="#"
              :style="{ color: 'var(--guinda)', textDecoration: 'underline' }"
              @click.prevent="limpiarBusqueda"
              >limpiar la b&uacute;squeda</a
            >.
          </p>
        </template>
        <template v-else>
          <p class="eyebrow">Sin cursos publicados</p>
          <p :style="{ marginTop: '8px', color: 'var(--ink-2)' }">
            A&uacute;n no hay cursos publicados. Pide a un administrador que publique uno desde el
            panel.
          </p>
        </template>
      </div>

      <div v-else class="cursos-list">
        <LandingCursoBloque
          v-for="(curso, i) in displayCursos"
          :key="curso.id"
          :curso="curso"
          :index="i"
          @ver-curso="goToCurso($event)"
          @ver-modulo="goToModulo($event)"
        />
      </div>
    </section>

    <!-- Sección 3.5: Cursos Estrategia "ABC de las emociones" por perfil -->
    <LandingEstrategiaABC @seleccionar-perfil="onSeleccionarPerfilAbc" />

    <!-- Sección 3.6: Cómo obtener tu constancia (pasos + preview) -->
    <LandingComoConstancia @descargar-constancia="onDescargarConstancia" />

    <LandingNiveles :cursos-por-nivel="cursosPorNivel" />

    <LandingConstancia />

    <LandingFaq @enviar-mensaje="onEnviarMensajeFaq" />

    <LandingFooter :cursos-count="cursos.length" />
  </div>
</template>

<style scoped>
.cursos-wrap {
  padding-top: calc(var(--unit) * 8);
  padding-bottom: calc(var(--unit) * 4);
  border-top: 1px solid var(--line);
}
.cursos-head {
  margin-bottom: calc(var(--unit) * 4);
}
.cursos-title {
  font-size: clamp(28px, 3vw, 40px);
  color: var(--ink);
  margin-top: calc(var(--unit) * 1);
}
.cursos-list {
  display: flex;
  flex-direction: column;
}
.cursos-empty {
  padding: calc(var(--unit) * 8) 0;
  text-align: center;
}

.cursos-search-meta {
  margin-top: calc(var(--unit) * 2);
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 2);
  flex-wrap: wrap;
}
.cursos-search-meta .mono {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--guinda);
  padding: 6px 10px;
  background: var(--paper-3);
  border-left: 2px solid var(--oro);
}
.cursos-search-clear {
  background: transparent;
  border: none;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gris-70);
  cursor: pointer;
  padding: 6px 0;
  text-decoration: underline;
  text-decoration-color: var(--line);
  text-underline-offset: 4px;
}
.cursos-search-clear:hover {
  color: var(--guinda);
  text-decoration-color: var(--oro);
}
</style>
