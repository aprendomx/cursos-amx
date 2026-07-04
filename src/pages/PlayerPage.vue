<script setup>
import { ref, computed, watch, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { COMENTARIOS_FUENTE, USER } from '@/data.js'
import { sbSelect, sbInsert, sbRpc } from '@/lib/sbRest.js'
import { supabase } from '@/lib/supabase.js'
import IconSet from '@/components/IconSet.vue'
import { useHlsPlayer } from '@/composables/useHlsPlayer.js'
import { useTiempoActividad } from '@/composables/useTiempoActividad.js'
import { getPlayback } from '@/services/videos.js'
import { actualizarSegundosVistos, marcarLeccionCompletada } from '@/services/progreso.js'
import { fetchInstructoresDeCurso } from '@/services/instructores.js'
import EntregaUploadField from '@/components/EntregaUploadField.vue'
import { featureEnabled } from '@/lib/featureFlags.js'
import DocumentoViewer from '@/components/DocumentoViewer.vue'
import EvaluacionPanel from '@/components/EvaluacionPanel.vue'
import PlayerVideoSurface from '@/components/PlayerVideoSurface.vue'
import PlayerChatPane from '@/components/PlayerChatPane.vue'
import PlayerLessonNavigator from '@/components/PlayerLessonNavigator.vue'

const props = defineProps({
  cursoId: { type: String, default: 'c1' },
  leccionId: { type: String, default: '' },
})

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const appUser = computed(() => auth.user)
const session = computed(() => auth.session)
const tweaks = computed(() => ui.tweaks)

// Conteo de tiempo activo por curso/usuario. Solo cuenta con curso real
// (uuid) y sesión iniciada; el composable maneja visibilidad/inactividad.
useTiempoActividad({
  cursoId: () => (/^[0-9a-f]{8}-/.test(props.cursoId) ? props.cursoId : null),
  enabled: () => !!session.value?.access_token,
})

/* ── State ────────────────────────────────────────── */
const currentLeccion = ref(props.leccionId || '')
const playing = ref(false)
const currentTime = ref(0)
const totalTime = ref(735)
const comentarios = ref([])
// IDs de instructores del curso, para el badge en el feed
const instructorIds = ref(new Set())
const draft = ref('')
const completada = ref(false)
const llegoAlFinal = ref(false)

function handleFinLectura() {
  llegoAlFinal.value = true
}

// HLS player refs
const videoEl = ref(null)
const hlsMasterUrl = ref(null)
const hlsPoster = ref(null)
const hlsDuration = ref(0)

// Lecciones loaded from Supabase
const lecciones = ref([])
const cursoTitulo = ref('')
const moduloTitulo = ref('')
const loadingLecciones = ref(true)

/* ── Derived ──────────────────────────────────────── */
const curso = computed(() => ({ titulo: cursoTitulo.value }))
const leccion = computed(
  () =>
    lecciones.value.find((l) => l.id === currentLeccion.value) ||
    lecciones.value[0] || {
      id: '',
      titulo: 'Cargando...',
      orden: 1,
      duracion_seg: 735,
      tipo: 'video',
    }
)

// Reset estado de lectura al cambiar de lección. DEBE ir después de
// declarar `leccion` o el watch dispara la fuente al setup y leccion
// cae en temporal dead zone.
async function marcarLecturaCompletada() {
  if (!leccion.value?.id || completada.value) return
  try {
    await marcarLeccionCompletada(leccion.value.id)
    completada.value = true
    const lec = lecciones.value.find((l) => l.id === leccion.value.id)
    if (lec) lec.completado = true
  } catch (e) {
    console.error('marcar leida:', e)
  }
}

// La RPC de calificación ya escribió progreso; aquí solo refrescamos el
// estado local para que la barra de avance y la lista marquen la lección.
function handleEvaluacionAprobada() {
  completada.value = true
  const lec = lecciones.value.find((l) => l.id === leccion.value.id)
  if (lec) lec.completado = true
}

function goToNextLesson() {
  const idx = lecciones.value.findIndex((l) => l.id === currentLeccion.value)
  const next = lecciones.value[idx + 1]
  if (next) {
    router.push({ name: 'player', params: { cursoId: props.cursoId, leccionId: next.id } })
  } else {
    router.push({ name: 'curso', params: { id: props.cursoId } })
  }
}

watch(
  () => leccion.value?.id,
  () => {
    llegoAlFinal.value = false
  }
)

const variant = computed(() => tweaks.value.playerLayout || 'split')
const progress = computed(() => Math.min(currentTime.value / totalTime.value, 1))

function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function extractYoutubeId(url) {
  if (!url) return ''
  const m = String(url).match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/
  )
  return m?.[1] || ''
}
const youtubeId = computed(() => extractYoutubeId(leccion.value?.youtube_url))
const youtubeEmbed = computed(() =>
  youtubeId.value ? `https://www.youtube.com/embed/${youtubeId.value}?rel=0&modestbranding=1` : ''
)

const source = computed(() => {
  if (leccion.value?.tipo === 'examen') return { kind: 'examen', leccionId: leccion.value.id }
  if (leccion.value?.documento_path) return { kind: 'documento', leccionId: leccion.value.id }
  if (leccion.value?.video_id) return { kind: 'hls', videoId: leccion.value.video_id }
  if (youtubeId.value) return { kind: 'youtube', id: youtubeId.value }
  return { kind: 'none' }
})

const completedCount = computed(() => lecciones.value.filter((l) => l.completado).length)
const progressFraction = computed(() => `${completedCount.value}/${lecciones.value.length}`)
const progressPct = computed(() =>
  lecciones.value.length ? Math.round((completedCount.value / lecciones.value.length) * 100) : 0
)

/* ── Tweaks helpers ───────────────────────────────── */
function setVariant(v) {
  ui.updateTweaks({ ...tweaks.value, playerLayout: v })
}

/* ── Playback simulation ──────────────────────────── */
let playInterval = null

function startPlayback() {
  stopPlayback()
  playInterval = setInterval(() => {
    if (currentTime.value >= totalTime.value) {
      completada.value = true
      playing.value = false
      stopPlayback()
      return
    }
    currentTime.value += 2
  }, 1000)
}

function stopPlayback() {
  if (playInterval) {
    clearInterval(playInterval)
    playInterval = null
  }
}

function togglePlay() {
  if (source.value.kind === 'hls') {
    const el = videoEl.value
    if (!el) return
    if (el.paused) {
      const p = el.play()
      if (p && typeof p.catch === 'function') {
        p.catch((err) => console.error('[player] video.play() rejected:', err))
      }
    } else {
      el.pause()
    }
    return
  }
  // existing YouTube/fallback behavior
  if (completada.value) return
  playing.value = !playing.value
}

watch(playing, (v) => {
  if (source.value.kind === 'hls') return // HLS drives itself via <video> events
  if (v && !completada.value) startPlayback()
  else stopPlayback()
})

/* ── HLS playback ─────────────────────────────────── */
async function loadHlsForVideo(videoId) {
  try {
    const data = await getPlayback(videoId)
    hlsMasterUrl.value = data.master_url
    hlsPoster.value = data.poster_url
    hlsDuration.value = data.duracion_seg || 0
    if (hlsDuration.value) totalTime.value = hlsDuration.value
  } catch (e) {
    console.warn('hls playback:', e)
    hlsMasterUrl.value = null
  }
}

watch(
  source,
  (s) => {
    if (s.kind === 'hls') loadHlsForVideo(s.videoId)
    else {
      hlsMasterUrl.value = null
      hlsPoster.value = null
    }
  },
  { immediate: true }
)

useHlsPlayer(videoEl, hlsMasterUrl, (err) => {
  if (err?.type === 'unsupported') return
  // Network or 4h expiry — refetch the master.
  if (source.value.kind === 'hls') loadHlsForVideo(source.value.videoId)
})

let saveTimer = null
function scheduleSave(leccionId, segundos) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    actualizarSegundosVistos(leccionId, segundos).catch(() => {})
  }, 5000)
}
function flushSave(leccionId, segundos) {
  clearTimeout(saveTimer)
  actualizarSegundosVistos(leccionId, segundos).catch(() => {})
}

function onHlsTimeUpdate() {
  const el = videoEl.value
  if (!el) return
  currentTime.value = el.currentTime
  totalTime.value = el.duration || totalTime.value
  if (leccion.value?.id) scheduleSave(leccion.value.id, el.currentTime)
  if (totalTime.value && el.currentTime / totalTime.value >= 0.9 && !completada.value) {
    marcarLeccionCompletada(leccion.value.id)
      .then(() => {
        completada.value = true
      })
      .catch(() => {})
  }
}

async function onHlsLoadedMetadata() {
  const el = videoEl.value
  if (!el || !leccion.value?.id) return
  totalTime.value = el.duration
  const { data } = await supabase
    .from('progreso')
    .select('segundos_vistos, completado')
    .eq('leccion_id', leccion.value.id)
    .maybeSingle()
  if (data && data.segundos_vistos > 5 && !data.completado) {
    el.currentTime = Math.max(0, data.segundos_vistos - 3)
  }
}

function onHlsEnded() {
  if (!leccion.value?.id) return
  flushSave(leccion.value.id, totalTime.value)
  marcarLeccionCompletada(leccion.value.id)
    .then(() => {
      completada.value = true
    })
    .catch(() => {})
}

watch(
  () => leccion.value?.id,
  (newId, oldId) => {
    if (oldId && videoEl.value) flushSave(oldId, videoEl.value.currentTime || 0)
  }
)

onBeforeUnmount(() => {
  if (leccion.value?.id && videoEl.value) {
    flushSave(leccion.value.id, videoEl.value.currentTime || 0)
  }
})

/* ── Mark lesson complete in Supabase ────────────── */
watch(completada, async (val) => {
  if (!val || !session.value?.access_token) return
  const id = currentLeccion.value
  if (!/^[0-9a-f]{8}-/.test(id)) return
  // Reflejar en local state inmediatamente para que la UI (sidebar,
  // contador, %) se actualice sin esperar a recargar la página.
  const lec = lecciones.value.find((l) => l.id === id)
  if (lec) lec.completado = true
  // HLS/documento path already called marcarLeccionCompletada directly — skip duplicate RPC.
  if (source.value.kind === 'hls' || source.value.kind === 'documento') return
  try {
    await sbRpc('marcar_leccion_completada', { p_leccion_id: id }, session.value.access_token)
  } catch (e) {
    console.error('Error marking lesson complete:', e)
  }
})

/* ── Send comment ─────────────────────────────────── */
const userName = computed(() => {
  if (appUser?.value?.nombre)
    return `${appUser.value.nombre} ${(appUser.value.apellidos || '')[0] || ''}.`
  return `${USER.nombre} ${USER.apellidos.charAt(0)}.`
})

const sendComment = async () => {
  if (!draft.value.trim()) return
  const text = draft.value.trim()
  comentarios.value.push({
    id: Date.now(),
    user: userName.value,
    dep: '',
    t: 'ahora',
    texto: text,
    own: true,
  })
  draft.value = ''
  if (session.value?.access_token && /^[0-9a-f]{8}-/.test(currentLeccion.value)) {
    try {
      await sbInsert(
        'comentarios',
        {
          user_id: session.value.user.id,
          leccion_id: currentLeccion.value,
          contenido: text,
        },
        session.value.access_token,
        false
      )
    } catch (e) {
      console.error('Error saving comment:', e)
    }
  }
}

/* ── Seek handler delegated from PlayerVideoSurface ─ */
function handleSeek(ratio) {
  const targetTime = Math.floor(ratio * totalTime.value)
  if (source.value.kind === 'hls') {
    const el = videoEl.value
    if (el) el.currentTime = targetTime
    currentTime.value = targetTime
    return
  }
  currentTime.value = targetTime
  if (currentTime.value >= totalTime.value) {
    completada.value = true
    playing.value = false
  } else {
    completada.value = false
    if (!playing.value) playing.value = true
  }
}

/* ── Select lesson ────────────────────────────────── */
function selectLesson(id) {
  currentLeccion.value = id
  const l = lecciones.value.find((x) => x.id === id)
  if (l) {
    totalTime.value = l.duracion_seg || 735
    currentTime.value = 0
    completada.value = false
    playing.value = true
    moduloTitulo.value = l.modulo_titulo || moduloTitulo.value
  }
}

/* ── Progress bar seek ────────────────────────────── */
function seekProgress(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const targetTime = Math.floor(ratio * totalTime.value)
  if (source.value.kind === 'hls') {
    const el = videoEl.value
    if (el) el.currentTime = targetTime
    currentTime.value = targetTime
    return
  }
  currentTime.value = targetTime
  if (currentTime.value >= totalTime.value) {
    completada.value = true
    playing.value = false
  } else {
    completada.value = false
    if (!playing.value) {
      playing.value = true
    }
  }
}

/* ── Lifecycle ────────────────────────────────────── */
let pollComentarios = null
let comentariosAbort = null

async function loadComentarios(leccionId, token) {
  if (!leccionId || !/^[0-9a-f]{8}-/.test(leccionId)) return
  // Cancelar fetch anterior si sigue en vuelo
  if (comentariosAbort) comentariosAbort.abort()
  comentariosAbort = new AbortController()
  try {
    const { data } = await sbSelect(
      `comentarios?select=*,perfiles(nombres,apellido_paterno,dependencias(siglas))&leccion_id=eq.${leccionId}&order=creado_en.asc&limit=50`,
      token,
      { signal: comentariosAbort.signal }
    )
    comentarios.value = (data || []).map((c) => ({
      id: c.id,
      user: (c.perfiles?.nombres || '') + ' ' + (c.perfiles?.apellido_paterno?.[0] || '') + '.',
      dep: c.perfiles?.dependencias?.siglas || '',
      t: new Date(c.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      texto: c.contenido,
      esInstructor: instructorIds.value.has(c.user_id),
      destacado: c.destacado === true,
    }))
  } catch (e) {
    // Silenciar errores no accionables: aborts y network blips transitorios
    if (e?.name === 'AbortError') return
    if (e instanceof TypeError && e.message === 'Failed to fetch') return
    console.warn('Error cargando comentarios:', e)
  }
}

onMounted(async () => {
  const token = session.value?.access_token
  const isRealCurso = /^[0-9a-f]{8}-/.test(props.cursoId)

  if (isRealCurso) {
    try {
      const { data: cursoRows } = await sbSelect(
        `cursos?select=titulo&id=eq.${props.cursoId}`,
        token
      )
      cursoTitulo.value = cursoRows?.[0]?.titulo || ''

      const { data: lecRows } = await sbSelect(
        `lecciones?select=*,modulos!inner(curso_id,orden,titulo)&modulos.curso_id=eq.${props.cursoId}&order=orden.asc&limit=1000`,
        token
      )

      if (lecRows?.length) {
        lecRows.sort((a, b) => a.modulos.orden - b.modulos.orden || a.orden - b.orden)

        let completedIds = new Set()
        if (session.value?.user?.id) {
          try {
            const { data: prog } = await sbSelect(
              `progreso?select=leccion_id&user_id=eq.${session.value.user.id}&completado=eq.true&limit=10000`,
              token
            )
            completedIds = new Set((prog || []).map((p) => p.leccion_id))
          } catch (e) {
            console.warn('progreso:', e)
          }
        }

        lecciones.value = lecRows.map((l) => ({
          id: l.id,
          orden: l.orden,
          titulo: l.titulo,
          duracion: l.duracion_seg
            ? `${Math.floor(l.duracion_seg / 60)}:${String(l.duracion_seg % 60).padStart(2, '0')}`
            : '\u2014',
          duracion_seg: l.duracion_seg || 600,
          youtube_url: l.url_youtube || '',
          video_id: l.video_id || null,
          documento_path: l.documento_path || null,
          documento_tipo: l.documento_tipo || null,
          tipo: l.tipo_material || 'video',
          completado: completedIds.has(l.id),
          modulo_titulo: l.modulos.titulo,
          modulo_orden: l.modulos.orden,
          requiere_entrega: l.requiere_entrega === true,
          entrega_tipos: l.entrega_tipos || null,
          entrega_max_mb: l.entrega_max_mb || 10,
        }))

        moduloTitulo.value = lecciones.value[0]?.modulo_titulo || ''

        if (props.leccionId && lecciones.value.find((l) => l.id === props.leccionId)) {
          currentLeccion.value = props.leccionId
        } else {
          const firstIncomplete = lecciones.value.find((l) => !l.completado)
          currentLeccion.value = firstIncomplete?.id || lecciones.value[0]?.id || ''
        }

        const cur = lecciones.value.find((l) => l.id === currentLeccion.value)
        totalTime.value = cur?.duracion_seg || 735
      }
    } catch (e) {
      console.error('Error cargando lecciones:', e)
    }
  }

  loadingLecciones.value = false

  if (lecciones.value.length) {
    playing.value = true
    if (playing.value && source.value.kind !== 'hls') startPlayback()
  }

  // Instructores del curso → badge en el feed. Antes de los comentarios
  // para que el primer render ya traiga la marca.
  if (isRealCurso && session.value) {
    try {
      instructorIds.value = new Set(await fetchInstructoresDeCurso(props.cursoId))
    } catch (e) {
      console.warn('instructores:', e)
    }
  }

  // Carga comentarios reales de la leccion actual
  await loadComentarios(currentLeccion.value, token)

  // Polling simple cada 8s para nuevos comentarios (sin realtime websocket)
  if (session.value?.access_token && /^[0-9a-f]{8}-/.test(currentLeccion.value)) {
    pollComentarios = setInterval(() => {
      loadComentarios(currentLeccion.value, session.value.access_token)
    }, 8000)
  }
})

watch(currentLeccion, async (id) => {
  if (!id) return
  await loadComentarios(id, session.value?.access_token)
})

onUnmounted(() => {
  stopPlayback()
  if (pollComentarios) clearInterval(pollComentarios)
  if (comentariosAbort) comentariosAbort.abort()
})
</script>

<template>
  <div class="player-page" :class="`variant-${variant}`">
    <!-- Top bar -->
    <header class="player-topbar">
      <div class="topbar-left">
        <button
          class="topbar-back"
          @click="router.push({ name: 'curso', params: { id: props.cursoId } })"
        >
          <IconSet name="arrowLeft" />
          <span>Salir del curso</span>
        </button>
        <div class="topbar-divider" />
        <div class="topbar-info">
          <span class="eyebrow">Modulo 02 &middot; Leccion {{ leccion.orden }}</span>
          <span class="topbar-title display-italic">{{ leccion.titulo }}</span>
        </div>
      </div>
      <div class="topbar-right">
        <div class="topbar-variants tweaks-segment">
          <button :class="{ on: variant === 'split' }" @click="setVariant('split')">Split</button>
          <button :class="{ on: variant === 'stacked' }" @click="setVariant('stacked')">
            Chat inferior
          </button>
          <button :class="{ on: variant === 'focus' }" @click="setVariant('focus')">Enfoque</button>
        </div>
      </div>
    </header>

    <!-- Split -->
    <div v-if="variant === 'split'" class="layout-split">
      <div class="split-left">
        <PlayerVideoSurface
          :source="source"
          :leccion="leccion"
          :video-el-ref="videoEl"
          :hls-poster="hlsPoster"
          :playing="playing"
          :completada="completada"
          :current-time="currentTime"
          :total-time="totalTime"
          :modulo-titulo="moduloTitulo"
          :llego-al-final="llegoAlFinal"
          @toggle-play="togglePlay"
          @seek="handleSeek"
          @time-update="onHlsTimeUpdate"
          @loaded-metadata="onHlsLoadedMetadata"
          @ended="onHlsEnded"
          @update:current-time="(v) => (currentTime = v)"
          @update:total-time="(v) => (totalTime = v)"
          @fin-lectura="handleFinLectura"
          @eval-aprobada="handleEvaluacionAprobada"
          @marcar-lectura-completada="marcarLecturaCompletada"
        />
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />
        <PlayerLessonNavigator
          :lecciones="lecciones"
          :current-leccion-id="currentLeccion"
          :completed-count="completedCount"
          :progress-fraction="progressFraction"
          :progress-pct="progressPct"
          :modulo-titulo="moduloTitulo"
          @select="selectLesson"
        />
      </div>
      <PlayerChatPane v-model:draft="draft" :comentarios="comentarios" @send="sendComment" />
    </div>

    <!-- Stacked -->
    <div v-else-if="variant === 'stacked'" class="layout-stacked">
      <div class="stacked-top">
        <PlayerVideoSurface
          :source="source"
          :leccion="leccion"
          :video-el-ref="videoEl"
          :hls-poster="hlsPoster"
          :playing="playing"
          :completada="completada"
          :current-time="currentTime"
          :total-time="totalTime"
          :modulo-titulo="moduloTitulo"
          :llego-al-final="llegoAlFinal"
          @toggle-play="togglePlay"
          @seek="handleSeek"
          @time-update="onHlsTimeUpdate"
          @loaded-metadata="onHlsLoadedMetadata"
          @ended="onHlsEnded"
          @update:current-time="(v) => (currentTime = v)"
          @update:total-time="(v) => (totalTime = v)"
          @fin-lectura="handleFinLectura"
          @eval-aprobada="handleEvaluacionAprobada"
          @marcar-lectura-completada="marcarLecturaCompletada"
        />
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />
        <PlayerLessonNavigator
          variant="stacked"
          :lecciones="lecciones"
          :current-leccion-id="currentLeccion"
          :completed-count="completedCount"
          :progress-fraction="progressFraction"
          :progress-pct="progressPct"
          :modulo-titulo="moduloTitulo"
          @select="selectLesson"
        />
      </div>
      <div class="stacked-bottom">
        <div class="stacked-notes">
          <div class="notes-header">
            <span class="eyebrow">Notas de leccion</span>
            <h3 class="display-italic">
              {{ leccion.titulo }}
            </h3>
          </div>
          <div class="notes-body">
            <p>
              La Plataforma Nacional de Transparencia (PNT) es el sistema informatico que concentra
              las obligaciones de transparencia de todos los sujetos obligados en Mexico.
            </p>
            <p>
              Permite a cualquier ciudadano consultar la informacion publica de oficio, presentar
              solicitudes de acceso a la informacion y dar seguimiento a recursos de revision.
            </p>
            <p class="notes-highlight">
              Articulo 70 de la LGTAIP establece 48 fracciones de obligaciones comunes que deben
              publicarse y actualizarse periodicamente.
            </p>
          </div>
        </div>
        <PlayerChatPane v-model:draft="draft" :comentarios="comentarios" @send="sendComment" />
      </div>
    </div>

    <!-- Focus -->
    <div v-else class="layout-focus">
      <div class="focus-center">
        <PlayerVideoSurface
          :source="source"
          :leccion="leccion"
          :video-el-ref="videoEl"
          :hls-poster="hlsPoster"
          :playing="playing"
          :completada="completada"
          :current-time="currentTime"
          :total-time="totalTime"
          :modulo-titulo="moduloTitulo"
          :llego-al-final="llegoAlFinal"
          @toggle-play="togglePlay"
          @seek="handleSeek"
          @time-update="onHlsTimeUpdate"
          @loaded-metadata="onHlsLoadedMetadata"
          @ended="onHlsEnded"
          @update:current-time="(v) => (currentTime = v)"
          @update:total-time="(v) => (totalTime = v)"
          @fin-lectura="handleFinLectura"
          @eval-aprobada="handleEvaluacionAprobada"
          @marcar-lectura-completada="marcarLecturaCompletada"
        />
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />
        <div class="focus-below">
          <div class="focus-title-block">
            <span class="eyebrow">Modulo 02 &middot; Leccion {{ leccion.orden }}</span>
            <h2 class="display-italic focus-lesson-title">
              {{ leccion.titulo }}
            </h2>
          </div>
          <div class="focus-actions">
            <button class="btn btn-ghost btn-sm" title="Notas (proximamente)" @click="() => {}">
              <IconSet name="doc" /> Notas
            </button>
            <button class="btn btn-ghost btn-sm" title="Chat (proximamente)" @click="() => {}">
              <IconSet name="chat" /> Chat
            </button>
            <button v-if="completada" class="btn btn-primary btn-sm" @click="goToNextLesson">
              Siguiente leccion <IconSet name="arrow" />
            </button>
          </div>
        </div>
      </div>
      <PlayerLessonNavigator
        variant="focus"
        :lecciones="lecciones"
        :current-leccion-id="currentLeccion"
        :completed-count="completedCount"
        :progress-fraction="progressFraction"
        :progress-pct="progressPct"
        :modulo-titulo="moduloTitulo"
        @select="selectLesson"
      />
    </div>
  </div>
</template>

<style scoped>
/* ─── Page shell ─────────────────────────────────── */
.player-page {
  background: var(--ink);
  color: var(--paper);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ─── Top bar ────────────────────────────────────── */
.player-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  background: var(--brand-primary-dark);
  border-bottom: 2px solid var(--brand-accent); /* línea oro APF — consistencia con TopNav global */
  flex-shrink: 0;
  position: relative;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.topbar-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-4);
  transition: color 180ms var(--ease);
  flex-shrink: 0;
}
.topbar-back:hover {
  color: var(--paper);
}

.topbar-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.topbar-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.topbar-info .eyebrow {
  color: var(--ink-4);
  font-size: 10px;
}
.topbar-title {
  font-size: 18px;
  color: var(--paper);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-right {
  flex-shrink: 0;
}

.topbar-variants {
  background: rgba(255, 255, 255, 0.06);
}
.topbar-variants button {
  color: var(--ink-4);
  font-size: 12px;
  padding: 6px 12px;
}
.topbar-variants button.on {
  background: var(--paper);
  color: var(--ink);
}

/* ─── Video surface (shared) ─────────────────────── */

/* ─── Slide content ──────────────────────────────── */

/* ─── Video badges ───────────────────────────────── */

/* ─── Center play button ─────────────────────────── */

/* ─── Completion overlay ─────────────────────────── */

/* ─── Video controls ─────────────────────────────── */

/* ─── Chat pane ──────────────────────────────────── */

/* ─── Chat messages ──────────────────────────────── */

/* Comentario destacado por instructor: barra oro a la izquierda */

/* ─── Chat input ─────────────────────────────────── */

/* ─── Lesson list ────────────────────────────────── */

/* ═══════════════════════════════════════════════════
   VARIANT: SPLIT
   ═══════════════════════════════════════════════════ */
.layout-split {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 380px;
  overflow: hidden;
}

.split-left {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.split-left .video-surface {
  flex-shrink: 0;
}

.split-left .lesson-list {
  flex: 1;
  overflow-y: auto;
}

.layout-split .chat-pane {
  height: 100%;
}

/* ═══════════════════════════════════════════════════
   VARIANT: STACKED
   ═══════════════════════════════════════════════════ */
.layout-stacked {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stacked-top {
  display: grid;
  grid-template-columns: 1fr 320px;
  flex-shrink: 0;
}

.stacked-video {
  /* inherits video-surface */
}

.stacked-bottom {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
  min-height: 280px;
}

.stacked-notes {
  padding: 24px;
  overflow-y: auto;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.notes-header {
  margin-bottom: 20px;
}
.notes-header .eyebrow {
  color: var(--ink-4);
  display: block;
  margin-bottom: 6px;
}
.notes-header h3 {
  font-size: 22px;
  color: var(--paper);
}

.notes-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.notes-body p {
  font-size: 14px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.6);
}
.notes-highlight {
  padding: 16px;
  border-left: 3px solid var(--brand-accent);
  background: rgba(212, 193, 156, 0.06);
  color: rgba(255, 255, 255, 0.75) !important;
  font-style: italic;
}

.layout-stacked .chat-pane {
  border-left: none;
}

/* ═══════════════════════════════════════════════════
   VARIANT: FOCUS
   ═══════════════════════════════════════════════════ */
.layout-focus {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.focus-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 24px 0;
  overflow-y: auto;
}

.focus-video {
  width: 100%;
  max-width: 1200px;
  border-radius: 4px;
  overflow: hidden;
}

.focus-below {
  width: 100%;
  max-width: 1200px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 0 24px;
}

.focus-title-block {
  min-width: 0;
}
.focus-title-block .eyebrow {
  color: var(--ink-4);
  display: block;
  margin-bottom: 4px;
}
.focus-lesson-title {
  font-size: 28px;
  color: var(--paper);
}

.focus-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.focus-actions .btn-ghost {
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--paper);
}
.focus-actions .btn-ghost:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.24);
}

/* ─── Focus horizontal lesson strip ──────────────── */
</style>
