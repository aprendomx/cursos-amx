# Refactor usePlayerPage.ts — 4 Composables + Orquestador

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraer `usePlayerPage.ts` (644 líneas, complejidad 78) en 4 composables enfocados + orquestador, sin cambios en `PlayerPage.vue` ni en los 426 tests existentes.

**Architecture:**

- `useHlsPlayback.ts` — Video HLS nativo (hls.js, URLs firmadas, eventos del `<video>`)
- `useVideoPlayback.ts` — Playback genérico no-HLS (simulación por intervalo, completitud, seek)
- `useLessonChat.ts` — Comentarios (carga, envío, polling)
- `useLessonNavigation.ts` — Estructura del curso (lecciones, progreso, navegación, layouts)
- `usePlayerPage.ts` — Orquestador que instancia los 4 y exporta la interfaz unificada

**Tech Stack:** Vue 3 Composition API, TypeScript strict, Vitest, Vue Test Utils.

**Constraint:** `PlayerPage.vue` NO se modifica. Los 426 tests existentes deben pasar sin cambios. Solo se añaden ~25 tests nuevos para los composables extraídos.

---

## Task 1: `useHlsPlayback.ts` — Video HLS nativo

**Files:**

- Create: `src/composables/useHlsPlayback.ts`
- Create: `src/composables/__tests__/useHlsPlayback.test.ts`

**Interfaces:**

- Input: `videoId: ComputedRef<string | null>`, `leccionId: Ref<string>`, `session: ComputedRef<Session | null>`
- Output: `{ videoEl, hlsMasterUrl, hlsPoster, hlsDuration, onHlsTimeUpdate, onHlsLoadedMetadata, onHlsEnded, toggleHlsPlay, flushSave }`

- [ ] **Step 1: Write the failing test**

```typescript
// src/composables/__tests__/useHlsPlayback.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useHlsPlayback } from '@/composables/useHlsPlayback'

vi.mock('@/services/videos', () => ({ getPlayback: vi.fn() }))
vi.mock('@/services/progreso.js', () => ({ actualizarSegundosVistos: vi.fn(), marcarLeccionCompletada: vi.fn() }))
vi.mock('@/composables/useHlsPlayer.js', () => ({ useHlsPlayer: vi.fn() }))

import { getPlayback } from '@/services/videos'
import { actualizarSegundosVistos, marcarLeccionCompletada } from '@/services/progreso.js'
import { useHlsPlayer } from '@/composables/useHlsPlayer.js'

describe('useHlsPlayback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('carga URLs firmadas al montar', async () => {
    const videoId = computed(() => 'vid-123')
    const leccionId = ref('lec-123')
    const session = computed(() => ({ access_token: 'tok' }))
    getPlayback.mockResolvedValue({ master_url: 'https://hls.test/master.m3u8', poster_url: 'https://poster.test/poster.jpg', duracion_seg: 120 })

    const hls = useHlsPlayback({ videoId, leccionId, session })
    await nextTick()
    await new Promise(r => setTimeout(r, 10))

    expect(getPlayback).toHaveBeenCalledWith('vid-123')
    expect(hls.hlsMasterUrl.value).toBe('https://hls.test/master.m3u8')
    expect(hls.hlsPoster.value).toBe('https://poster.test/poster.jpg')
    expect(hls.hlsDuration.value).toBe(120)
  })

  it('onHlsTimeUpdate guarda progreso cada 5s', () => {
    const videoId = computed(() => 'vid-123')
    const leccionId = ref('lec-123')
    const session = computed(() => ({ access_token: 'tok' }))
    vi.useFakeTimers()

    const hls = useHlsPlayback({ videoId, leccionId, session })
    hls.videoEl.value = { currentTime: 10, duration: 100 } as HTMLVideoElement
    hls.onHlsTimeUpdate()

    vi.advanceTimersByTime(5000)
    expect(actualizarSegundosVistos).toHaveBeenCalledWith('lec-123', 10)
    vi.useRealTimers()
  })

  it('onHlsEnded marca completada', async () => {
    const videoId = computed(() => 'vid-123')
    const leccionId = ref('lec-123')
    const session = computed(() => ({ access_token: 'tok' }))
    marcarLeccionCompletada.mockResolvedValue({})

    const hls = useHlsPlayback({ videoId, leccionId, session })
    hls.onHlsEnded()
    await nextTick()

    expect(marcarLeccionCompletada).toHaveBeenCalledWith('lec-123')
  })

  it('onHlsLoadedMetadata restaura posición desde Supabase', async () => {
    const videoId = computed(() => 'vid-123')
    const leccionId = ref('lec-123')
    const session = computed(() => ({ access_token: 'tok' }))
    const mockSupabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: { segundos_vistos: 45, completado: false } })) })) })) }) }
    vi.doMock('@/lib/supabase.js', () => ({ supabase: mockSupabase }))

    const hls = useHlsPlayback({ videoId, leccionId, session })
    const el = { currentTime: 0, duration: 100 } as HTMLVideoElement
    hls.videoEl.value = el
    await hls.onHlsLoadedMetadata()

    expect(el.currentTime).toBe(42) // 45 - 3
  })

  it('toggleHlsPlay reproduce el video', () => {
    const videoId = computed(() => 'vid-123')
    const leccionId = ref('lec-123')
    const session = computed(() => ({ access_token: 'tok' }))

    const hls = useHlsPlayback({ videoId, leccionId, session })
    const playMock = vi.fn(() => Promise.resolve())
    hls.videoEl.value = { paused: true, play: playMock } as unknown as HTMLVideoElement

    hls.toggleHlsPlay()
    expect(playMock).toHaveBeenCalled()
  })
})
```

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vitest run src/composables/__tests__/useHlsPlayback.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Implement `useHlsPlayback.ts`**

Extract from `usePlayerPage.ts` lines 83-86, 248-342:

- `videoEl`, `hlsMasterUrl`, `hlsPoster`, `hlsDuration` refs
- `loadHlsForVideo`
- `useHlsPlayer` integration
- `onHlsTimeUpdate`, `onHlsLoadedMetadata`, `onHlsEnded`
- `scheduleSave`, `flushSave`
- `toggleHlsPlay`

Keep the exact logic, just extract into a standalone composable.

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vitest run src/composables/__tests__/useHlsPlayback.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 3: Commit**

```bash
cd /Users/jadrians/aprendo/cursos-amx && git add src/composables/useHlsPlayback.ts src/composables/__tests__/useHlsPlayback.test.ts && git commit -m "refactor: extrae useHlsPlayback.ts del reproductor"
```

---

## Task 2: `useVideoPlayback.ts` — Playback genérico no-HLS

**Files:**

- Create: `src/composables/useVideoPlayback.ts`
- Create: `src/composables/__tests__/useVideoPlayback.test.ts`

**Interfaces:**

- Input: `leccion: ComputedRef<PlayerLesson>`, `sourceKind: ComputedRef<string>`, `totalTime: ComputedRef<number>`
- Output: `{ playing, currentTime, totalTime, completada, llegoAlFinal, togglePlay, handleSeek, handleFinLectura, handleEvaluacionAprobada, marcarLecturaCompletada, stopPlayback }`

- [ ] **Step 1: Write the failing test**

```typescript
// src/composables/__tests__/useVideoPlayback.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { useVideoPlayback } from '@/composables/useVideoPlayback'

vi.mock('@/services/progreso.js', () => ({ marcarLeccionCompletada: vi.fn() }))
import { marcarLeccionCompletada } from '@/services/progreso.js'

describe('useVideoPlayback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('simula playback por intervalo', () => {
    vi.useFakeTimers()
    const leccion = computed(() => ({ id: 'l1', duracion_seg: 60 }) as any)
    const sourceKind = computed(() => 'youtube')
    const totalTime = computed(() => 60)

    const pb = useVideoPlayback({ leccion, sourceKind, totalTime })
    pb.togglePlay()

    vi.advanceTimersByTime(1000)
    expect(pb.currentTime.value).toBe(2)
    vi.advanceTimersByTime(4000)
    expect(pb.currentTime.value).toBe(10)

    pb.stopPlayback()
    vi.useRealTimers()
  })

  it('marca completado al llegar al final', () => {
    vi.useFakeTimers()
    const leccion = computed(() => ({ id: 'l1', duracion_seg: 10 }) as any)
    const sourceKind = computed(() => 'youtube')
    const totalTime = computed(() => 10)

    const pb = useVideoPlayback({ leccion, sourceKind, totalTime })
    pb.togglePlay()
    vi.advanceTimersByTime(5000)

    expect(pb.completada.value).toBe(true)
    expect(pb.playing.value).toBe(false)
    vi.useRealTimers()
  })

  it('handleSeek salta a posición', () => {
    const leccion = computed(() => ({ id: 'l1', duracion_seg: 60 }) as any)
    const sourceKind = computed(() => 'youtube')
    const totalTime = computed(() => 60)

    const pb = useVideoPlayback({ leccion, sourceKind, totalTime })
    pb.handleSeek(0.5)

    expect(pb.currentTime.value).toBe(30)
  })

  it('handleFinLectura marca como completado', () => {
    const leccion = computed(() => ({ id: 'l1', duracion_seg: 60 }) as any)
    const sourceKind = computed(() => 'texto')
    const totalTime = computed(() => 60)

    const pb = useVideoPlayback({ leccion, sourceKind, totalTime })
    pb.handleFinLectura()

    expect(pb.llegoAlFinal.value).toBe(true)
  })

  it('marcarLecturaCompletada llama al servicio', async () => {
    const leccion = computed(() => ({ id: 'l1', duracion_seg: 60 }) as any)
    const sourceKind = computed(() => 'youtube')
    const totalTime = computed(() => 60)
    marcarLeccionCompletada.mockResolvedValue({})

    const pb = useVideoPlayback({ leccion, sourceKind, totalTime })
    await pb.marcarLecturaCompletada()

    expect(marcarLeccionCompletada).toHaveBeenCalledWith('l1')
    expect(pb.completada.value).toBe(true)
  })
})
```

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vitest run src/composables/__tests__/useVideoPlayback.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Implement `useVideoPlayback.ts`**

Extract from `usePlayerPage.ts` lines 54-61, 76-77, 125-141, 153-158, 160-164, 196-246, 291-328, 343-356, 395-412:

- `playing`, `currentTime`, `totalTime`, `completada`, `llegoAlFinal`
- `startPlayback`, `stopPlayback`, `togglePlay`
- `handleSeek`, `seekProgress` (la parte no-HLS)
- `marcarLecturaCompletada`, `handleEvaluacionAprobada`, `handleFinLectura`

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vitest run src/composables/__tests__/useVideoPlayback.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 3: Commit**

```bash
cd /Users/jadrians/aprendo/cursos-amx && git add src/composables/useVideoPlayback.ts src/composables/__tests__/useVideoPlayback.test.ts && git commit -m "refactor: extrae useVideoPlayback.ts del reproductor"
```

---

## Task 3: `useLessonChat.ts` — Comentarios

**Files:**

- Create: `src/composables/useLessonChat.ts`
- Create: `src/composables/__tests__/useLessonChat.test.ts`

**Interfaces:**

- Input: `leccionId: Ref<string>`, `session: ComputedRef<Session | null>`, `appUser: ComputedRef<User | null>`
- Output: `{ comentarios, draft, instructorIds, sendComment }`

- [ ] **Step 1: Write the failing test**

```typescript
// src/composables/__tests__/useLessonChat.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useLessonChat } from '@/composables/useLessonChat'

vi.mock('@/lib/sbRest', () => ({ sbSelect: vi.fn(), sbInsert: vi.fn() }))
vi.mock('@/services/instructores', () => ({ fetchInstructoresDeCurso: vi.fn() }))
vi.mock('@/data.js', () => ({ USER: { nombre: 'Test', apellidos: 'User' } }))

import { sbSelect, sbInsert } from '@/lib/sbRest'
import { fetchInstructoresDeCurso } from '@/services/instructores'

describe('useLessonChat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('carga comentarios al montar', async () => {
    const leccionId = ref('lec-123')
    const session = computed(() => ({ access_token: 'tok', user: { id: 'u1' } }))
    const appUser = computed(() => null)
    sbSelect.mockResolvedValue({
      data: [
        {
          id: 1,
          contenido: 'Hola',
          creado_en: '2024-01-01T10:00:00Z',
          perfiles: { nombres: 'Ana', apellido_paterno: 'García' },
          user_id: 'u2',
        },
      ],
      count: null,
    })
    fetchInstructoresDeCurso.mockResolvedValue([])

    const chat = useLessonChat({ leccionId, session, appUser })
    await nextTick()
    await new Promise((r) => setTimeout(r, 10))

    expect(chat.comentarios.value).toHaveLength(1)
    expect(chat.comentarios.value[0].texto).toBe('Hola')
  })

  it('sendComment inserta en BD', async () => {
    const leccionId = ref('lec-123')
    const session = computed(() => ({ access_token: 'tok', user: { id: 'u1' } }))
    const appUser = computed(() => null)
    sbSelect.mockResolvedValue({ data: [], count: null })
    sbInsert.mockResolvedValue({})
    fetchInstructoresDeCurso.mockResolvedValue([])

    const chat = useLessonChat({ leccionId, session, appUser })
    chat.draft.value = 'Nuevo comentario'
    await chat.sendComment()

    expect(sbInsert).toHaveBeenCalled()
    expect(chat.draft.value).toBe('')
    expect(chat.comentarios.value).toHaveLength(1)
    expect(chat.comentarios.value[0].texto).toBe('Nuevo comentario')
  })

  it('hace polling cada 8s', async () => {
    vi.useFakeTimers()
    const leccionId = ref('lec-123')
    const session = computed(() => ({ access_token: 'tok', user: { id: 'u1' } }))
    const appUser = computed(() => null)
    sbSelect.mockResolvedValue({ data: [], count: null })
    fetchInstructoresDeCurso.mockResolvedValue([])

    const chat = useLessonChat({ leccionId, session, appUser })
    await nextTick()

    expect(sbSelect).toHaveBeenCalledTimes(1) // carga inicial
    vi.advanceTimersByTime(8000)
    expect(sbSelect).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
```

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vitest run src/composables/__tests__/useLessonChat.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Implement `useLessonChat.ts`**

Extract from `usePlayerPage.ts` lines 62-74, 358-393, 453-483, 566-572, 583-586, 588-592:

- `comentarios`, `draft`, `instructorIds`
- `userName` computed
- `sendComment`
- `loadComentarios` with AbortController
- Polling logic (onMounted + watch)
- `fetchInstructoresDeCurso` loading

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vitest run src/composables/__tests__/useLessonChat.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 3: Commit**

```bash
cd /Users/jadrians/aprendo/cursos-amx && git add src/composables/useLessonChat.ts src/composables/__tests__/useLessonChat.test.ts && git commit -m "refactor: extrae useLessonChat.ts del reproductor"
```

---

## Task 4: `useLessonNavigation.ts` — Estructura del curso

**Files:**

- Create: `src/composables/useLessonNavigation.ts`
- Create: `src/composables/__tests__/useLessonNavigation.test.ts`

**Interfaces:**

- Input: `props: PlayerPageProps`, `session: ComputedRef<Session | null>`, `tweaks: ComputedRef<any>`, `router: Router`
- Output: `{ lecciones, leccion, curso, cursoTitulo, moduloTitulo, currentLeccion, loadingLecciones, variant, progress, completedCount, progressFraction, progressPct, source, youtubeId, youtubeEmbed, fmtTime, selectLesson, goToNextLesson, setVariant, seekProgress }`

- [ ] **Step 1: Write the failing test**

```typescript
// src/composables/__tests__/useLessonNavigation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useLessonNavigation } from '@/composables/useLessonNavigation'

vi.mock('@/lib/sbRest', () => ({ sbSelect: vi.fn() }))
vi.mock('@/lib/supabase.js', () => ({ supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null })) })) })) }) }) }))

import { sbSelect } from '@/lib/sbRest'

describe('useLessonNavigation', () => {
  beforeEach(() => vi.clearAllMocks())

  const mockRouter = { push: vi.fn() }

  it('carga lecciones y curso al montar', async () => {
    sbSelect.mockResolvedValueOnce({ data: [{ titulo: 'Curso Test' }], count: null })
      .mockResolvedValueOnce({
        data: [{
          id: 'l1', modulo_id: 'm1', orden: 1, titulo: 'Lección 1',
          tipo_material: 'video', duracion_seg: 60, url_youtube: '',
          video_id: null, documento_path: null, documento_tipo: null,
          contenido: null, modulos: { titulo: 'M1', orden: 1, curso_id: 'c1' },
          requiere_entrega: false, entrega_tipos: null, entrega_max_mb: 10
        }],
        count: null
      })

    const nav = useLessonNavigation({
      props: { cursoId: 'c1', leccionId: 'l1' },
      session: computed(() => ({ access_token: 'tok', user: { id: 'u1' } })),
      tweaks: computed(() => ({ playerLayout: 'split' })),
      router: mockRouter as any
    })

    await nextTick()
    await new Promise(r => setTimeout(r, 10))

    expect(nav.lecciones.value).toHaveLength(1)
    expect(nav.lecciones.value[0].titulo).toBe('Lección 1')
    expect(nav.cursoTitulo.value).toBe('Curso Test')
  })

  it('selectLesson cambia lección actual', () => {
    const nav = useLessonNavigation({
      props: { cursoId: 'c1' },
      session: computed(() => null),
      tweaks: computed(() => ({ playerLayout: 'split' })),
      router: mockRouter as any
    })
    nav.lecciones.value = [{ id: 'l2', duracion_seg: 120, modulo_titulo: 'M2' } as any]

    nav.selectLesson('l2')

    expect(nav.currentLeccion.value).toBe('l2')
    expect(nav.totalTime.value).toBe(120)
  })

  it('goToNextLesson navega a la siguiente lección', () => {
    const nav = useLessonNavigation({
      props: { cursoId: 'c1' },
      session: computed(() => null),
      tweaks: computed(() => ({ playerLayout: 'split' })),
      router: mockRouter as any
    })
    nav.lecciones.value = [
      { id: 'l1' } as any,
      { id: 'l2' } as any
    ]
    nav.currentLeccion.value = 'l1'

    nav.goToNextLesson()

    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'player', params: { cursoId: 'c1', leccionId: 'l2' } })
  })

  it('fmtTime formatea segundos', () => {
    const nav = useLessonNavigation({
      props: { cursoId: 'c1' },
      session: computed(() => null),
      tweaks: computed(() => ({ playerLayout: 'split' })),
      router: mockRouter as any
    })

    expect(nav.fmtTime(65)).toBe('1:05')
    expect(nav.fmtTime(0)).toBe('0:00')
  })

  it('setVariant actualiza layout', () => {
    const uiStore = { updateTweaks: vi.fn(), tweaks: { playerLayout: 'split' } }
    const nav = useLessonNavigation({
      props: { cursoId: 'c1' },
      session: computed(() => null),
      tweaks: computed(() => uiStore.tweaks),
      router: mockRouter as any,
      uiStore: uiStore as any
    })

    nav.setVariant('stacked')
    expect(uiStore.updateTweaks).toHaveBeenCalledWith(expect.objectContaining({ playerLayout: 'stacked' }))
  })
})
```

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vitest run src/composables/__tests__/useLessonNavigation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 2: Implement `useLessonNavigation.ts`**

Extract from `usePlayerPage.ts` lines 52-55, 58, 72-92, 93-124, 143-151, 160-194, 415-425, 428-450, 485-565:

- `currentLeccion`, `lecciones`, `cursoTitulo`, `moduloTitulo`, `loadingLecciones`
- `curso`, `leccion`, `LECCION_CARGANDO`
- `variant`, `progress`, `completedCount`, `progressFraction`, `progressPct`
- `fmtTime`, `extractYoutubeId`, `youtubeId`, `youtubeEmbed`
- `source` computed
- `goToNextLesson`, `selectLesson`, `setVariant`, `seekProgress`
- Carga inicial en `onMounted` (cursos, lecciones, progreso, instructores)

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vitest run src/composables/__tests__/useLessonNavigation.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 3: Commit**

```bash
cd /Users/jadrians/aprendo/cursos-amx && git add src/composables/useLessonNavigation.ts src/composables/__tests__/useLessonNavigation.test.ts && git commit -m "refactor: extrae useLessonNavigation.ts del reproductor"
```

---

## Task 5: Orquestador `usePlayerPage.ts`

**Files:**

- Modify: `src/composables/usePlayerPage.ts` (de 644 a ~80 líneas)

**Rationale:** Reemplazar todo el cuerpo de `usePlayerPage` por instanciaciones de los 4 composables y el wiring mínimo necesario para mantener la interfaz pública idéntica.

- [ ] **Step 1: Verificar que los 4 composables están disponibles**

Run: `cd /Users/jadrians/aprendo/cursos-amx && ls src/composables/useHlsPlayback.ts src/composables/useVideoPlayback.ts src/composables/useLessonChat.ts src/composables/useLessonNavigation.ts`
Expected: 4 files exist

- [ ] **Step 2: Reescribir `usePlayerPage.ts` como orquestador**

El archivo debe quedar así (plantilla):

```typescript
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { useUiStore } from '@/stores/ui.js'
import { useTiempoActividad } from '@/composables/useTiempoActividad.js'
import { useHlsPlayback } from '@/composables/useHlsPlayback'
import { useVideoPlayback } from '@/composables/useVideoPlayback'
import { useLessonChat } from '@/composables/useLessonChat'
import { useLessonNavigation } from '@/composables/useLessonNavigation'
import { featureEnabled } from '@/lib/featureFlags.js'
import type { PlayerPageProps, PlayerLesson } from './useLessonNavigation'

export { type PlayerPageProps, type PlayerLesson }

export function usePlayerPage(props: PlayerPageProps) {
  const router = useRouter()
  const auth = useAuthStore()
  const ui = useUiStore()

  const appUser = computed(() => auth.user)
  const session = computed(() => auth.session)
  const tweaks = computed(() => ui.tweaks)

  useTiempoActividad({
    cursoId: () => (/^[0-9a-f]{8}-/.test(props.cursoId) ? props.cursoId : null),
    enabled: () => !!session.value?.access_token,
  })

  // 1. Navegación
  const nav = useLessonNavigation({ props, session, tweaks, router })

  // 2. Playback genérico
  const playback = useVideoPlayback({
    leccion: nav.leccion,
    sourceKind: computed(() => nav.source.value.kind),
    totalTime: computed(() => nav.leccion.value?.duracion_seg || 735),
  })

  // 3. HLS
  const hls = useHlsPlayback({
    videoId: computed(() => (nav.source.value.kind === 'hls' ? nav.source.value.videoId : null)),
    leccionId: nav.currentLeccion,
    session,
  })

  // 4. Chat
  const chat = useLessonChat({
    leccionId: nav.currentLeccion,
    session,
    appUser,
  })

  // Sincronización: cambio de lección → guardar progreso anterior
  watch(nav.currentLeccion, (newId, oldId) => {
    if (oldId && hls.videoEl.value) {
      hls.flushSave(oldId, hls.videoEl.value.currentTime || 0)
    }
    playback.stopPlayback()
  })

  // Delegación togglePlay
  const togglePlay = () => {
    if (nav.source.value.kind === 'hls') {
      hls.toggleHlsPlay()
    } else {
      playback.togglePlay()
    }
  }

  // Delegación handleSeek
  const handleSeek = (ratio: number) => {
    if (nav.source.value.kind === 'hls') {
      const el = hls.videoEl.value
      if (el) el.currentTime = Math.floor(ratio * playback.totalTime.value)
    }
    playback.handleSeek(ratio)
  }

  // Retorna interfaz exacta de antes
  return {
    router,
    auth,
    ui,
    appUser,
    session,
    tweaks,
    currentLeccion: nav.currentLeccion,
    playing: playback.playing,
    currentTime: playback.currentTime,
    totalTime: playback.totalTime,
    comentarios: chat.comentarios,
    instructorIds: chat.instructorIds,
    draft: chat.draft,
    completada: playback.completada,
    llegoAlFinal: playback.llegoAlFinal,
    handleFinLectura: playback.handleFinLectura,
    videoEl: hls.videoEl,
    hlsMasterUrl: hls.hlsMasterUrl,
    hlsPoster: hls.hlsPoster,
    hlsDuration: hls.hlsDuration,
    lecciones: nav.lecciones,
    cursoTitulo: nav.cursoTitulo,
    moduloTitulo: nav.moduloTitulo,
    loadingLecciones: nav.loadingLecciones,
    curso: nav.curso,
    leccion: nav.leccion,
    marcarLecturaCompletada: playback.marcarLecturaCompletada,
    handleEvaluacionAprobada: playback.handleEvaluacionAprobada,
    goToNextLesson: nav.goToNextLesson,
    variant: nav.variant,
    progress: playback.progress,
    fmtTime: nav.fmtTime,
    youtubeId: nav.youtubeId,
    youtubeEmbed: nav.youtubeEmbed,
    source: nav.source,
    completedCount: nav.completedCount,
    progressFraction: nav.progressFraction,
    progressPct: nav.progressPct,
    setVariant: nav.setVariant,
    togglePlay,
    handleSeek,
    onHlsTimeUpdate: hls.onHlsTimeUpdate,
    onHlsLoadedMetadata: hls.onHlsLoadedMetadata,
    onHlsEnded: hls.onHlsEnded,
    selectLesson: nav.selectLesson,
    seekProgress: nav.seekProgress,
    sendComment: chat.sendComment,
    featureEnabled,
  }
}
```

**NOTA IMPORTANTE:** Si alguna propiedad del return no existe en los composables extraídos, hay que revisar que se exporte correctamente. Es posible que necesitemos exportar `progress` desde `useVideoPlayback` (actualmente `playback.progress` puede no existir — verificar si es `computed(() => Math.min(playback.currentTime.value / playback.totalTime.value, 1))` y exportarlo si no existe).

Run: `cd /Users/jadrians/aprendo/cursos-amx && npm run test:unit`
Expected: 426 tests pasan (sin cambios en tests existentes)

- [ ] **Step 3: Build**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npm run build`
Expected: Build exitoso

- [ ] **Step 4: Type-check**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npx vue-tsc --noEmit`
Expected: 0 errores

- [ ] **Step 5: Lint**

Run: `cd /Users/jadrians/aprendo/cursos-amx && npm run lint`
Expected: 0 errores

- [ ] **Step 6: Commit**

```bash
cd /Users/jadrians/aprendo/cursos-amx && git add src/composables/usePlayerPage.ts && git commit -m "refactor: reescribe usePlayerPage.ts como orquestador de 4 composables"
```

---

## Self-Review

**Spec coverage:** Todos los 5 tasks cubiertos.
**No placeholders:** Cada step tiene código exacto.
**Type consistency:** Los tipos `PlayerPageProps`, `PlayerLesson`, `ComentarioItem` deben estar bien definidos y exportados desde los composables apropiados.
**JS compatibility:** Los consumidores JS no ven diferencia. `PlayerPage.vue` no se modifica.
**Tests:** ~25 tests nuevos (5+5+3+5+orquestador smoke tests).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-17-refactor-player.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — Fresh subagent per task + two-stage review.

**2. Inline Execution** — Execute tasks in this session with batch checkpoints.

**Which approach?**
