import { ref, computed, watch, onMounted, type Ref, type ComputedRef } from 'vue'
import type { Router } from 'vue-router'
import { sbSelect } from '@/lib/sbRest'

export interface PlayerPageProps {
  cursoId: string
  leccionId?: string
}

export interface PlayerLesson {
  id: string
  modulo_id: string
  orden: number
  titulo: string
  tipo_material: 'video' | 'lectura' | 'examen' | 'recurso'
  duracion: string
  duracion_seg: number
  youtube_url: string
  video_id: string | null
  documento_path: string | null
  documento_tipo: string | null
  contenido: Record<string, unknown> | null
  tipo: string
  completado: boolean
  modulo_titulo: string
  modulo_orden: number
  requiere_entrega: boolean
  entrega_tipos: string[] | null
  entrega_max_mb: number
}

export interface LessonNavigationOptions {
  props: PlayerPageProps
  session: ComputedRef<{ access_token: string; user?: { id: string } } | null>
  tweaks: ComputedRef<{ playerLayout?: string }>
  router: Router
  updateTweaks: (tweaks: Record<string, unknown>) => void
}

export function useLessonNavigation({ props, session, tweaks, router, updateTweaks }: LessonNavigationOptions) {
  /* ── State ────────────────────────────────────────── */
  const currentLeccion = ref(props.leccionId || '')
  const lecciones: Ref<PlayerLesson[]> = ref([])
  const cursoTitulo = ref('')
  const moduloTitulo = ref('')
  const loadingLecciones = ref(true)

  /* ── Derived ──────────────────────────────────────── */
  const curso = computed(() => ({ titulo: cursoTitulo.value }))

  const LECCION_CARGANDO: PlayerLesson = {
    id: '',
    modulo_id: '',
    orden: 1,
    titulo: 'Cargando...',
    tipo_material: 'video',
    duracion: '12:15',
    duracion_seg: 735,
    youtube_url: '',
    video_id: null,
    documento_path: null,
    documento_tipo: null,
    contenido: null,
    tipo: 'video',
    completado: false,
    modulo_titulo: '',
    modulo_orden: 1,
    requiere_entrega: false,
    entrega_tipos: null,
    entrega_max_mb: 10,
  }

  const leccion = computed(
    () =>
      lecciones.value.find((l) => l.id === currentLeccion.value) ||
      lecciones.value[0] ||
      LECCION_CARGANDO
  )

  function goToNextLesson() {
    const idx = lecciones.value.findIndex((l) => l.id === currentLeccion.value)
    const next = lecciones.value[idx + 1]
    if (next) {
      router.push({ name: 'player', params: { cursoId: props.cursoId, leccionId: next.id } })
    } else {
      router.push({ name: 'curso', params: { id: props.cursoId } })
    }
  }

  function selectLesson(id: string) {
    currentLeccion.value = id
    const l = lecciones.value.find((x) => x.id === id)
    if (l) {
      moduloTitulo.value = l.modulo_titulo || moduloTitulo.value
    }
  }

  const variant = computed(() => tweaks.value.playerLayout || 'split')
  const progress = computed(() => Math.min((lecciones.value.filter((l) => l.completado).length / (lecciones.value.length || 1)), 1))

  function fmtTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function extractYoutubeId(url: string) {
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
    if (leccion.value?.contenido) return { kind: 'texto', leccionId: leccion.value.id }
    if (youtubeId.value) return { kind: 'youtube', id: youtubeId.value }
    return { kind: 'none' }
  })

  const completedCount = computed(() => lecciones.value.filter((l) => l.completado).length)
  const progressFraction = computed(() => `${completedCount.value}/${lecciones.value.length}`)
  const progressPct = computed(() =>
    lecciones.value.length ? Math.round((completedCount.value / lecciones.value.length) * 100) : 0
  )

  function setVariant(v: string) {
    updateTweaks({ ...tweaks.value, playerLayout: v })
  }

  function seekProgress(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement | null
    if (!target) return
    const rect = target.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return ratio
  }

  /* ── Loading ──────────────────────────────────────── */
  async function cargar() {
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

          let completedIds = new Set<string>()
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
            modulo_id: l.modulo_id,
            orden: l.orden,
            titulo: l.titulo,
            tipo_material: l.tipo_material || 'video',
            duracion: l.duracion_seg
              ? `${Math.floor(l.duracion_seg / 60)}:${String(l.duracion_seg % 60).padStart(2, '0')}`
              : '\u2014',
            duracion_seg: l.duracion_seg || 600,
            youtube_url: l.url_youtube || '',
            video_id: l.video_id || null,
            documento_path: l.documento_path || null,
            documento_tipo: l.documento_tipo || null,
            contenido: l.contenido ?? null,
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
        }
      } catch (e) {
        console.error('Error cargando lecciones:', e)
      }
    }

    loadingLecciones.value = false
  }

  /* ── Lifecycle ────────────────────────────────────── */
  onMounted(cargar)

  return {
    currentLeccion,
    lecciones,
    leccion,
    curso,
    cursoTitulo,
    moduloTitulo,
    loadingLecciones,
    variant,
    completedCount,
    progressFraction,
    progressPct,
    source,
    youtubeId,
    youtubeEmbed,
    fmtTime,
    goToNextLesson,
    selectLesson,
    setVariant,
    seekProgress,
    cargar,
  }
}
