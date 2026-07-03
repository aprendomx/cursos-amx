<script setup>
import { ref, computed, watch, onMounted, onUnmounted, onBeforeUnmount, nextTick } from 'vue'
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

/* ── Comment simulation ───────────────────────────── */
let chatInterval = null
let chatIndex = 0

function startChat() {
  stopChat()
  chatInterval = setInterval(() => {
    const src = COMENTARIOS_FUENTE[chatIndex % COMENTARIOS_FUENTE.length]
    chatIndex++
    comentarios.value.push({
      id: Date.now(),
      user: src.user,
      dep: src.dep,
      t: 'ahora',
      texto: src.texto,
      incoming: true,
    })
  }, 4500)
}

function stopChat() {
  if (chatInterval) {
    clearInterval(chatInterval)
    chatInterval = null
  }
}

watch(
  () => tweaks.value.liveChat,
  (v) => {
    if (v) startChat()
    else stopChat()
  },
  { immediate: false }
)

/* ── Auto-scroll chat ─────────────────────────────── */
const chatContainer = ref(null)

watch(
  comentarios,
  () => {
    nextTick(() => {
      if (chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight
      }
    })
  },
  { deep: true }
)

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
  stopChat()
  if (pollComentarios) clearInterval(pollComentarios)
  if (comentariosAbort) comentariosAbort.abort()
})
</script>

<template>
  <div class="player-page" :class="`variant-${variant}`">
    <!-- ═══════ TOP BAR ═══════ -->
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

    <!-- ═══════ VARIANT: SPLIT ═══════ -->
    <div v-if="variant === 'split'" class="layout-split">
      <div class="split-left">
        <!-- Video -->
        <div
          class="video-surface"
          :class="{ 'has-iframe': source.kind === 'youtube' }"
          @click="source.kind === 'none' && togglePlay()"
        >
          <iframe
            v-if="source.kind === 'youtube'"
            class="video-iframe"
            :src="youtubeEmbed"
            title="video"
            frameborder="0"
            allow="
              accelerometer;
              autoplay;
              clipboard-write;
              encrypted-media;
              gyroscope;
              picture-in-picture;
            "
            allowfullscreen
          />
          <video
            v-else-if="source.kind === 'hls'"
            ref="videoEl"
            class="video-native"
            :poster="hlsPoster"
            playsinline
            controls
            @timeupdate="onHlsTimeUpdate"
            @loadedmetadata="onHlsLoadedMetadata"
            @ended="onHlsEnded"
            @play="playing = true"
            @pause="playing = false"
          />
          <DocumentoViewer
            v-else-if="source.kind === 'documento'"
            :leccion-id="source.leccionId"
            @fin-de-lectura="handleFinLectura"
          />
          <EvaluacionPanel
            v-else-if="source.kind === 'examen' && featureEnabled('evaluaciones')"
            :key="source.leccionId"
            :leccion-id="source.leccionId"
            @aprobada="handleEvaluacionAprobada"
          />
          <template v-else>
            <div class="video-bg">
              <div class="video-stripe-overlay" />
              <div class="video-radial" />
            </div>
            <div class="slide-content">
              <span class="slide-eyebrow eyebrow"
                >{{ moduloTitulo || 'Lecci\u00f3n' }} &middot;
                {{ String(leccion.orden || 1).padStart(2, '0') }}</span
              >
              <h2 class="slide-heading display">
                {{ leccion.titulo || 'Lecci\u00f3n' }}
              </h2>
              <span class="slide-footer mono">Sin video disponible</span>
            </div>
          </template>

          <!-- Badges -->
          <div class="video-badges">
            <span class="badge-live"><span class="badge-dot pulsing" /> Aula viva</span>
            <span class="badge-duration">{{ leccion.duracion }}</span>
          </div>

          <!-- Center play (when paused) -->
          <div
            v-if="source.kind === 'none' && !playing && !completada"
            class="play-overlay"
            @click.stop="togglePlay"
          >
            <div class="play-circle">
              <IconSet name="play" />
            </div>
          </div>

          <!-- Completion overlay -->
          <div v-if="source.kind === 'none' && completada" class="completion-overlay" @click.stop>
            <div class="completion-inner">
              <div class="completion-circle">
                <IconSet name="check" />
              </div>
              <span class="completion-text display-italic">Leccion completada</span>
            </div>
          </div>

          <!-- Bottom controls (solo si no hay iframe real) -->
          <div v-if="source.kind === 'none'" class="video-controls" @click.stop>
            <div class="controls-progress" @click="seekProgress">
              <div class="controls-progress-fill" :style="{ width: progress * 100 + '%' }" />
            </div>
            <div class="controls-bar">
              <button class="controls-play" @click="togglePlay">
                <IconSet :name="playing ? 'close' : 'play'" />
              </button>
              <span class="controls-time mono"
                >{{ fmtTime(currentTime) }} / {{ fmtTime(totalTime) }}</span
              >
              <span class="controls-status mono">{{
                source.kind === 'hls' ? 'HLS' : 'Simulador (sin URL)'
              }}</span>
            </div>
          </div>
        </div>
        <div v-if="source.kind === 'documento'" class="doc-actions">
          <button
            class="btn btn-primary doc-mark-btn"
            :disabled="!llegoAlFinal || completada"
            @click="marcarLecturaCompletada"
          >
            <template v-if="completada"> ✓ Lección completada </template>
            <template v-else-if="llegoAlFinal"> Marcar como leída </template>
            <template v-else> Desliza hasta el final para habilitar </template>
          </button>
        </div>

        <!-- Entrega de archivo (módulo LMS 3, flag VITE_FEATURE_ENTREGAS) -->
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />

        <!-- Lesson list below video -->
        <div class="lesson-list">
          <div class="lesson-list-header">
            <span class="eyebrow">Modulo 02</span>
            <h3 class="lesson-list-title">Sujetos obligados</h3>
            <span class="lesson-list-progress mono"
              >{{ progressFraction }} &middot; {{ progressPct }}%</span
            >
          </div>
          <ul class="lesson-items">
            <li
              v-for="l in lecciones"
              :key="l.id"
              class="lesson-item"
              :class="{
                'lesson-active': l.id === currentLeccion,
                'lesson-completed': l.completado,
              }"
              @click="selectLesson(l.id)"
            >
              <div class="lesson-status-icon">
                <template v-if="l.completado">
                  <span class="lesson-check"><IconSet name="check" /></span>
                </template>
                <template v-else-if="l.id === currentLeccion">
                  <span class="lesson-playing pulsing"><IconSet name="play" /></span>
                </template>
                <template v-else>
                  <span class="lesson-num mono">{{ l.orden }}</span>
                </template>
              </div>
              <div class="lesson-info">
                <span class="lesson-name">{{ l.titulo }}</span>
                <span class="lesson-meta mono">{{ l.duracion }} &middot; {{ l.tipo }}</span>
              </div>
              <IconSet v-if="l.tipo === 'lectura'" name="doc" />
              <IconSet v-else name="clock" />
            </li>
          </ul>
        </div>
      </div>

      <!-- Chat pane -->
      <div class="chat-pane">
        <div class="chat-header">
          <span class="eyebrow">Aula viva</span>
          <div class="chat-header-row">
            <h3 class="chat-title display">Conversacion</h3>
            <span class="chat-live-dot pulsing" />
          </div>
        </div>
        <div ref="chatContainer" class="chat-messages">
          <div
            v-for="c in comentarios"
            :key="c.id"
            class="chat-msg"
            :class="{ 'chat-msg-incoming': c.incoming, 'chat-msg-destacado': c.destacado }"
          >
            <div class="chat-avatar" :class="{ 'chat-avatar-instructor': c.esInstructor }">
              {{ c.user.charAt(0) }}
            </div>
            <div class="chat-body">
              <div class="chat-meta">
                <span class="chat-name">{{ c.user }}</span>
                <span v-if="c.esInstructor" class="chat-badge-instructor mono">Instructor</span>
                <span class="chat-dep mono">{{ c.dep }}</span>
                <span class="chat-time">{{ c.t }}</span>
              </div>
              <p class="chat-text">
                {{ c.texto }}
              </p>
            </div>
          </div>
        </div>
        <div class="chat-input-bar">
          <input
            v-model="draft"
            type="text"
            placeholder="Escribe un mensaje..."
            @keydown.enter="sendComment"
          />
          <button class="chat-send" @click="sendComment">
            <IconSet name="send" />
          </button>
        </div>
      </div>
    </div>

    <!-- ═══════ VARIANT: STACKED ═══════ -->
    <div v-else-if="variant === 'stacked'" class="layout-stacked">
      <div class="stacked-top">
        <!-- Video -->
        <div
          class="video-surface stacked-video"
          :class="{ 'has-iframe': source.kind === 'youtube' }"
          @click="source.kind === 'none' && togglePlay()"
        >
          <iframe
            v-if="source.kind === 'youtube'"
            class="video-iframe"
            :src="youtubeEmbed"
            title="video"
            frameborder="0"
            allow="
              accelerometer;
              autoplay;
              clipboard-write;
              encrypted-media;
              gyroscope;
              picture-in-picture;
            "
            allowfullscreen
          />
          <video
            v-else-if="source.kind === 'hls'"
            ref="videoEl"
            class="video-native"
            :poster="hlsPoster"
            playsinline
            controls
            @timeupdate="onHlsTimeUpdate"
            @loadedmetadata="onHlsLoadedMetadata"
            @ended="onHlsEnded"
            @play="playing = true"
            @pause="playing = false"
          />
          <DocumentoViewer
            v-else-if="source.kind === 'documento'"
            :leccion-id="source.leccionId"
            @fin-de-lectura="handleFinLectura"
          />
          <EvaluacionPanel
            v-else-if="source.kind === 'examen' && featureEnabled('evaluaciones')"
            :key="source.leccionId"
            :leccion-id="source.leccionId"
            @aprobada="handleEvaluacionAprobada"
          />
          <template v-else>
            <div class="video-bg">
              <div class="video-stripe-overlay" />
              <div class="video-radial" />
            </div>
            <div class="slide-content">
              <span class="slide-eyebrow eyebrow"
                >Plataforma Nacional de Transparencia &middot; 04 / 18</span
              >
              <h2 class="slide-heading display">
                El portal de<br /><em class="slide-accent display-italic">obligaciones</em>
                de<br />transparencia
              </h2>
              <span class="slide-footer mono"
                >Dra. Alejandra Rueda &middot; CONASAMA &middot; 2024</span
              >
            </div>
          </template>
          <div class="video-badges">
            <span class="badge-live"><span class="badge-dot pulsing" /> Aula viva</span>
            <span class="badge-duration">{{ leccion.duracion }}</span>
          </div>
          <div
            v-if="source.kind === 'none' && !playing && !completada"
            class="play-overlay"
            @click.stop="togglePlay"
          >
            <div class="play-circle">
              <IconSet name="play" />
            </div>
          </div>
          <div v-if="source.kind === 'none' && completada" class="completion-overlay" @click.stop>
            <div class="completion-inner">
              <div class="completion-circle">
                <IconSet name="check" />
              </div>
              <span class="completion-text display-italic">Leccion completada</span>
            </div>
          </div>
          <div v-if="source.kind === 'none'" class="video-controls" @click.stop>
            <div class="controls-progress" @click="seekProgress">
              <div class="controls-progress-fill" :style="{ width: progress * 100 + '%' }" />
            </div>
            <div class="controls-bar">
              <button class="controls-play" @click="togglePlay">
                <IconSet :name="playing ? 'close' : 'play'" />
              </button>
              <span class="controls-time mono"
                >{{ fmtTime(currentTime) }} / {{ fmtTime(totalTime) }}</span
              >
              <span class="controls-status mono">{{
                source.kind === 'hls' ? 'HLS' : 'Simulador (sin URL)'
              }}</span>
            </div>
          </div>
        </div>
        <div v-if="source.kind === 'documento'" class="doc-actions">
          <button
            class="btn btn-primary doc-mark-btn"
            :disabled="!llegoAlFinal || completada"
            @click="marcarLecturaCompletada"
          >
            <template v-if="completada"> ✓ Lección completada </template>
            <template v-else-if="llegoAlFinal"> Marcar como leída </template>
            <template v-else> Desliza hasta el final para habilitar </template>
          </button>
        </div>

        <!-- Entrega de archivo (módulo LMS 3, flag VITE_FEATURE_ENTREGAS) -->
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />

        <!-- Lesson list sidebar -->
        <div class="lesson-list stacked-lessons">
          <div class="lesson-list-header">
            <span class="eyebrow">Modulo 02</span>
            <h3 class="lesson-list-title">Sujetos obligados</h3>
            <span class="lesson-list-progress mono"
              >{{ progressFraction }} &middot; {{ progressPct }}%</span
            >
          </div>
          <ul class="lesson-items">
            <li
              v-for="l in lecciones"
              :key="l.id"
              class="lesson-item"
              :class="{
                'lesson-active': l.id === currentLeccion,
                'lesson-completed': l.completado,
              }"
              @click="selectLesson(l.id)"
            >
              <div class="lesson-status-icon">
                <template v-if="l.completado">
                  <span class="lesson-check"><IconSet name="check" /></span>
                </template>
                <template v-else-if="l.id === currentLeccion">
                  <span class="lesson-playing pulsing"><IconSet name="play" /></span>
                </template>
                <template v-else>
                  <span class="lesson-num mono">{{ l.orden }}</span>
                </template>
              </div>
              <div class="lesson-info">
                <span class="lesson-name">{{ l.titulo }}</span>
                <span class="lesson-meta mono">{{ l.duracion }} &middot; {{ l.tipo }}</span>
              </div>
              <IconSet v-if="l.tipo === 'lectura'" name="doc" />
              <IconSet v-else name="clock" />
            </li>
          </ul>
        </div>
      </div>

      <div class="stacked-bottom">
        <!-- Lesson notes -->
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

        <!-- Chat pane -->
        <div class="chat-pane">
          <div class="chat-header">
            <span class="eyebrow">Aula viva</span>
            <div class="chat-header-row">
              <h3 class="chat-title display">Conversacion</h3>
              <span class="chat-live-dot pulsing" />
            </div>
          </div>
          <div ref="chatContainer" class="chat-messages">
            <div
              v-for="c in comentarios"
              :key="c.id"
              class="chat-msg"
              :class="{ 'chat-msg-incoming': c.incoming, 'chat-msg-destacado': c.destacado }"
            >
              <div class="chat-avatar" :class="{ 'chat-avatar-instructor': c.esInstructor }">
                {{ c.user.charAt(0) }}
              </div>
              <div class="chat-body">
                <div class="chat-meta">
                  <span class="chat-name">{{ c.user }}</span>
                  <span v-if="c.esInstructor" class="chat-badge-instructor mono">Instructor</span>
                  <span class="chat-dep mono">{{ c.dep }}</span>
                  <span class="chat-time">{{ c.t }}</span>
                </div>
                <p class="chat-text">
                  {{ c.texto }}
                </p>
              </div>
            </div>
          </div>
          <div class="chat-input-bar">
            <input
              v-model="draft"
              type="text"
              placeholder="Escribe un mensaje..."
              @keydown.enter="sendComment"
            />
            <button class="chat-send" @click="sendComment">
              <IconSet name="send" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════ VARIANT: FOCUS ═══════ -->
    <div v-else class="layout-focus">
      <div class="focus-center">
        <!-- Video -->
        <div
          class="video-surface focus-video"
          :class="{ 'has-iframe': source.kind === 'youtube' }"
          @click="source.kind === 'none' && togglePlay()"
        >
          <iframe
            v-if="source.kind === 'youtube'"
            class="video-iframe"
            :src="youtubeEmbed"
            title="video"
            frameborder="0"
            allow="
              accelerometer;
              autoplay;
              clipboard-write;
              encrypted-media;
              gyroscope;
              picture-in-picture;
            "
            allowfullscreen
          />
          <video
            v-else-if="source.kind === 'hls'"
            ref="videoEl"
            class="video-native"
            :poster="hlsPoster"
            playsinline
            controls
            @timeupdate="onHlsTimeUpdate"
            @loadedmetadata="onHlsLoadedMetadata"
            @ended="onHlsEnded"
            @play="playing = true"
            @pause="playing = false"
          />
          <DocumentoViewer
            v-else-if="source.kind === 'documento'"
            :leccion-id="source.leccionId"
            @fin-de-lectura="handleFinLectura"
          />
          <EvaluacionPanel
            v-else-if="source.kind === 'examen' && featureEnabled('evaluaciones')"
            :key="source.leccionId"
            :leccion-id="source.leccionId"
            @aprobada="handleEvaluacionAprobada"
          />
          <template v-else>
            <div class="video-bg">
              <div class="video-stripe-overlay" />
              <div class="video-radial" />
            </div>
            <div class="slide-content">
              <span class="slide-eyebrow eyebrow"
                >Plataforma Nacional de Transparencia &middot; 04 / 18</span
              >
              <h2 class="slide-heading display">
                El portal de<br /><em class="slide-accent display-italic">obligaciones</em>
                de<br />transparencia
              </h2>
              <span class="slide-footer mono"
                >Dra. Alejandra Rueda &middot; CONASAMA &middot; 2024</span
              >
            </div>
          </template>
          <div class="video-badges">
            <span class="badge-live"><span class="badge-dot pulsing" /> Aula viva</span>
            <span class="badge-duration">{{ leccion.duracion }}</span>
          </div>
          <div
            v-if="source.kind === 'none' && !playing && !completada"
            class="play-overlay"
            @click.stop="togglePlay"
          >
            <div class="play-circle">
              <IconSet name="play" />
            </div>
          </div>
          <div v-if="source.kind === 'none' && completada" class="completion-overlay" @click.stop>
            <div class="completion-inner">
              <div class="completion-circle">
                <IconSet name="check" />
              </div>
              <span class="completion-text display-italic">Leccion completada</span>
            </div>
          </div>
          <div v-if="source.kind === 'none'" class="video-controls" @click.stop>
            <div class="controls-progress" @click="seekProgress">
              <div class="controls-progress-fill" :style="{ width: progress * 100 + '%' }" />
            </div>
            <div class="controls-bar">
              <button class="controls-play" @click="togglePlay">
                <IconSet :name="playing ? 'close' : 'play'" />
              </button>
              <span class="controls-time mono"
                >{{ fmtTime(currentTime) }} / {{ fmtTime(totalTime) }}</span
              >
              <span class="controls-status mono">{{
                source.kind === 'hls' ? 'HLS' : 'Simulador (sin URL)'
              }}</span>
            </div>
          </div>
        </div>
        <div v-if="source.kind === 'documento'" class="doc-actions">
          <button
            class="btn btn-primary doc-mark-btn"
            :disabled="!llegoAlFinal || completada"
            @click="marcarLecturaCompletada"
          >
            <template v-if="completada"> ✓ Lección completada </template>
            <template v-else-if="llegoAlFinal"> Marcar como leída </template>
            <template v-else> Desliza hasta el final para habilitar </template>
          </button>
        </div>

        <!-- Entrega de archivo (módulo LMS 3, flag VITE_FEATURE_ENTREGAS) -->
        <EntregaUploadField
          v-if="featureEnabled('entregas') && leccion?.requiere_entrega && session"
          :key="leccion.id"
          :curso-id="cursoId"
          :leccion="leccion"
        />

        <!-- Title + actions below video -->
        <div class="focus-below">
          <div class="focus-title-block">
            <span class="eyebrow">Modulo 02 &middot; Leccion {{ leccion.orden }}</span>
            <h2 class="display-italic focus-lesson-title">
              {{ leccion.titulo }}
            </h2>
          </div>
          <div class="focus-actions">
            <button class="btn btn-ghost btn-sm" title="Notas (próximamente)" @click="() => {}">
              <IconSet name="doc" />
              Notas
            </button>
            <button class="btn btn-ghost btn-sm" title="Chat (próximamente)" @click="() => {}">
              <IconSet name="chat" />
              Chat
            </button>
            <button v-if="completada" class="btn btn-primary btn-sm" @click="goToNextLesson">
              Siguiente leccion
              <IconSet name="arrow" />
            </button>
          </div>
        </div>
      </div>

      <!-- Horizontal lesson list -->
      <div class="focus-lesson-strip">
        <div class="lesson-strip-header">
          <span class="eyebrow">Modulo 02 &middot; Sujetos obligados</span>
          <span class="lesson-list-progress mono"
            >{{ progressFraction }} &middot; {{ progressPct }}%</span
          >
        </div>
        <div class="lesson-strip-items">
          <div
            v-for="l in lecciones"
            :key="l.id"
            class="lesson-strip-card"
            :class="{
              'lesson-active': l.id === currentLeccion,
              'lesson-completed': l.completado,
            }"
            @click="selectLesson(l.id)"
          >
            <div class="lesson-status-icon">
              <template v-if="l.completado">
                <span class="lesson-check"><IconSet name="check" /></span>
              </template>
              <template v-else-if="l.id === currentLeccion">
                <span class="lesson-playing pulsing"><IconSet name="play" /></span>
              </template>
              <template v-else>
                <span class="lesson-num mono">{{ l.orden }}</span>
              </template>
            </div>
            <div class="lesson-info">
              <span class="lesson-name">{{ l.titulo }}</span>
              <span class="lesson-meta mono">{{ l.duracion }}</span>
            </div>
          </div>
        </div>
      </div>
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
.video-surface {
  position: relative;
  background: #000;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}

.video-surface.has-iframe {
  cursor: default;
}
.video-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

.video-bg {
  position: absolute;
  inset: 0;
}

.video-radial {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 40%, rgba(98, 17, 50, 0.18) 0%, transparent 70%);
}

.video-stripe-overlay {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.03) 0,
    rgba(255, 255, 255, 0.03) 1px,
    transparent 1px,
    transparent 12px
  );
}

/* ─── Slide content ──────────────────────────────── */
.slide-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 48px;
  z-index: 2;
}

.slide-eyebrow {
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 24px;
}

.slide-heading {
  font-size: clamp(28px, 4vw, 52px);
  color: var(--paper);
  line-height: 1;
  margin-bottom: 32px;
}

.slide-accent {
  color: var(--brand-accent);
}

.slide-footer {
  color: rgba(255, 255, 255, 0.3);
  font-size: 10px;
}

/* ─── Video badges ───────────────────────────────── */
.video-badges {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
  z-index: 5;
}

.badge-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--primary);
  color: var(--paper);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--paper);
  display: inline-block;
}

.badge-duration {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.06em;
}

/* ─── Center play button ─────────────────────────── */
.play-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 10;
  background: rgba(0, 0, 0, 0.2);
}

.play-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px);
  display: grid;
  place-items: center;
  color: var(--paper);
  font-size: 24px;
  transition:
    transform 180ms var(--ease),
    background 180ms var(--ease);
}
.play-circle:hover {
  transform: scale(1.08);
  background: rgba(255, 255, 255, 0.22);
}

.play-circle svg {
  width: 24px;
  height: 24px;
}

/* ─── Completion overlay ─────────────────────────── */
.completion-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: grid;
  place-items: center;
  z-index: 10;
}

.completion-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.completion-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--brand-accent);
  color: var(--ink);
  display: grid;
  place-items: center;
}
.completion-circle svg {
  width: 28px;
  height: 28px;
}

.completion-text {
  font-size: 22px;
  color: var(--paper);
}

/* ─── Video controls ─────────────────────────────── */
.video-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 12;
  cursor: default;
}

.controls-progress {
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  cursor: pointer;
  transition: height 120ms var(--ease);
}
.controls-progress:hover {
  height: 6px;
}

.controls-progress-fill {
  height: 100%;
  background: var(--brand-accent);
  transition: width 200ms linear;
}

.controls-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.5);
}

.controls-play {
  color: var(--paper);
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  transition: opacity 120ms;
}
.controls-play:hover {
  opacity: 0.8;
}

.controls-time {
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
}

.controls-status {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.3);
  font-size: 10px;
}

/* ─── Chat pane ──────────────────────────────────── */
.chat-pane {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.03);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.chat-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}
.chat-header .eyebrow {
  color: var(--brand-accent);
  margin-bottom: 4px;
  display: block;
}

.chat-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-title {
  font-size: 24px;
  color: var(--paper);
}

.chat-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
}

/* ─── Chat messages ──────────────────────────────── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-messages::-webkit-scrollbar {
  width: 4px;
}
.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.chat-msg {
  display: flex;
  gap: 10px;
  animation: fadeIn 280ms var(--ease) both;
}

.chat-msg-incoming {
  animation: slideInRight 320ms var(--ease) both;
}

/* Comentario destacado por instructor: barra oro a la izquierda */
.chat-msg-destacado {
  box-shadow: inset 3px 0 0 var(--brand-accent);
  padding-left: 8px;
}

.chat-badge-instructor {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--brand-ink, #161a1d);
  background: var(--brand-accent);
  padding: 1px 6px;
  border-radius: 3px;
}

.chat-avatar-instructor {
  background: var(--brand-accent);
  color: var(--brand-ink, #161a1d);
}

.chat-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--brand-accent);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  font-family: var(--ui);
}

.chat-body {
  min-width: 0;
}

.chat-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 3px;
  flex-wrap: wrap;
}

.chat-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--paper);
}

.chat-dep {
  font-size: 10px;
  color: var(--brand-accent);
}

.chat-time {
  font-size: 11px;
  color: var(--ink-4);
}

.chat-text {
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
}

/* ─── Chat input ─────────────────────────────────── */
.chat-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.chat-input-bar input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--paper);
  outline: none;
  transition: border-color 180ms var(--ease);
}
.chat-input-bar input::placeholder {
  color: var(--ink-4);
  font-family: var(--ui);
  font-style: normal;
}
.chat-input-bar input:focus {
  border-color: rgba(255, 255, 255, 0.2);
}

.chat-send {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--brand-accent);
  color: var(--ink);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition:
    transform 120ms var(--ease),
    opacity 120ms;
}
.chat-send:hover {
  transform: scale(1.06);
}

/* ─── Lesson list ────────────────────────────────── */
.lesson-list {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  overflow-y: auto;
}

.lesson-list-header {
  padding: 20px 20px 12px;
}

.lesson-list-header .eyebrow {
  color: var(--ink-4);
  display: block;
  margin-bottom: 4px;
}

.lesson-list-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--paper);
  margin-bottom: 4px;
}

.lesson-list-progress {
  color: var(--ink-4);
  font-size: 11px;
}

.lesson-items {
  list-style: none;
  padding: 0 8px 8px;
}

.lesson-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 180ms var(--ease);
  border-left: 3px solid transparent;
}
.lesson-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.lesson-active {
  background: rgba(255, 255, 255, 0.06);
  border-left-color: var(--brand-accent);
}

.lesson-completed .lesson-check {
  color: var(--paper);
}

.lesson-status-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.lesson-check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--success);
  display: grid;
  place-items: center;
  color: var(--paper);
}

.lesson-playing {
  color: var(--brand-accent);
}

.lesson-num {
  color: var(--ink-4);
  font-size: 12px;
}

.lesson-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lesson-name {
  font-size: 13px;
  color: var(--paper);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lesson-meta {
  font-size: 10px;
  color: var(--ink-4);
}

.lesson-item > svg {
  color: var(--ink-4);
  flex-shrink: 0;
}

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

.stacked-lessons {
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  overflow-y: auto;
  max-height: calc(100vw * 9 / 16 * (1 / (1 + 320 / 100)));
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
.focus-lesson-strip {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 16px 24px 20px;
  flex-shrink: 0;
}

.lesson-strip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.lesson-strip-header .eyebrow {
  color: var(--ink-4);
}
.lesson-strip-header .lesson-list-progress {
  color: var(--ink-4);
}

.lesson-strip-items {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.lesson-strip-items::-webkit-scrollbar {
  height: 3px;
}
.lesson-strip-items::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.video-native {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
  object-fit: contain;
}

.lesson-strip-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition:
    background 180ms var(--ease),
    border-color 180ms var(--ease);
  border-left: 3px solid transparent;
}
.lesson-strip-card:hover {
  background: rgba(255, 255, 255, 0.07);
}
.lesson-strip-card.lesson-active {
  background: rgba(255, 255, 255, 0.08);
  border-left-color: var(--brand-accent);
}

.doc-actions {
  padding: 16px 24px;
  display: flex;
  justify-content: center;
  background: var(--ink, #1a1a1a);
}
.doc-mark-btn {
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.doc-mark-btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
