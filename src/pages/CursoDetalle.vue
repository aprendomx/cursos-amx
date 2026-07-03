<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { sbSelect } from '@/lib/sbRest.js'
import { inscribirse } from '@/services/progreso.js'
import IconSet from '@/components/IconSet.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import ForosPanel from '@/components/ForosPanel.vue'
import SesionesVirtualesPanel from '@/components/SesionesVirtualesPanel.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import { featureEnabled } from '@/lib/featureFlags.js'

const props = defineProps({
  cursoId: { type: String, required: true },
  anchor: { type: String, default: null },
})

const router = useRouter()
const auth = useAuthStore()

// Perfil del usuario autenticado desde el store; lo usa el módulo de foros.
const perfilApp = computed(() => auth.perfil)

const cursoData = ref(null)
const modulosData = ref([])
const loading = ref(true)
const loadError = ref(null)
const inscrito = ref(null) // null = no logueado, false = no inscrito, true = inscrito
const inscribiendo = ref(false) // estado de loading durante la llamada
const inscripcionError = ref(null) // mensaje inline si la inscripción falla

function isUrl(v) {
  if (!v || typeof v !== 'string') return false
  return /^(https?:|\/)/.test(v)
}

function fmtMinutes(min) {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m > 0 ? m + 'min' : ''}`.trim() : `${m} min`
}

async function loadCurso(cursoId) {
  loading.value = true
  loadError.value = null
  const token = auth.session?.access_token
  try {
    const { data: cursoRows } = await sbSelect(`cursos?select=*&id=eq.${cursoId}`, token)
    const cursoRow = cursoRows?.[0]
    if (!cursoRow) throw new Error('Curso no encontrado.')

    cursoData.value = {
      id: cursoRow.id,
      slug: cursoRow.slug,
      titulo: cursoRow.titulo,
      descripcion: cursoRow.descripcion,
      duracion: fmtMinutes(cursoRow.duracion_min) || '\u2014',
      nivel: cursoRow.nivel || 'Fundamental',
      imagen: cursoRow.imagen_portada || cursoRow.titulo?.split(' ')[0] || '',
      lecciones: 0,
      modulos: 0,
      inscritos: 0,
      instructor: '',
      instructor_cargo: '',
      progreso: 0,
    }

    // Modulos + lecciones (un solo query embebido)
    const { data: modulosRows } = await sbSelect(
      `modulos?select=id,orden,titulo,descripcion,imagen_portada,requiere_previo,lecciones(id,duracion_seg)&curso_id=eq.${cursoId}&order=orden.asc`,
      token
    )

    let progresoByLeccion = new Set()
    if (auth.session?.user?.id) {
      try {
        const { data: prog } = await sbSelect(
          `progreso?select=leccion_id&user_id=eq.${auth.session.user.id}&completado=eq.true&limit=10000`,
          token
        )
        progresoByLeccion = new Set((prog || []).map((p) => p.leccion_id))
      } catch (e) {
        console.warn('No se pudo cargar progreso:', e)
      }
    }

    // Verificar si el usuario ya está inscrito en este curso.
    if (auth.session?.user?.id) {
      try {
        const { data: insRows } = await sbSelect(
          `inscripciones?select=id&user_id=eq.${auth.session.user.id}&curso_id=eq.${cursoId}&limit=1`,
          token
        )
        inscrito.value = (insRows || []).length > 0
      } catch (e) {
        console.warn('No se pudo cargar estado de inscripción:', e)
        inscrito.value = null
      }
    } else {
      inscrito.value = null
    }

    const enriched = (modulosRows || []).map((m) => {
      const lecs = m.lecciones || []
      const totalSeg = lecs.reduce((s, l) => s + (l.duracion_seg || 0), 0)
      const done = lecs.filter((l) => progresoByLeccion.has(l.id)).length
      return {
        id: m.id,
        orden: m.orden,
        titulo: m.titulo,
        descripcion: m.descripcion || '',
        imagen_portada: m.imagen_portada || '',
        duracion: totalSeg > 0 ? fmtMinutes(Math.round(totalSeg / 60)) : `${lecs.length} lecciones`,
        lecciones_count: lecs.length,
        completado: lecs.length > 0 ? done / lecs.length : 0,
        requiere_previo: m.requiere_previo,
      }
    })

    modulosData.value = enriched
    const totalLessons = enriched.reduce((s, m) => s + m.lecciones_count, 0)
    const doneLessons = enriched.reduce(
      (s, m) => s + Math.round(m.lecciones_count * m.completado),
      0
    )
    cursoData.value.modulos = enriched.length
    cursoData.value.lecciones = totalLessons
    cursoData.value.progreso = totalLessons > 0 ? doneLessons / totalLessons : 0
  } catch (err) {
    console.error('Error cargando curso:', err)
    loadError.value = err?.message || 'No se pudo cargar el curso.'
    cursoData.value = null
    modulosData.value = []
  } finally {
    loading.value = false
  }
}

let scrollTimer = null
let highlightTimer = null

async function scrollToAnchor() {
  if (!props.anchor) return
  await nextTick()
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    const el = document.getElementById(props.anchor)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('modulo-highlight')
    clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => el.classList.remove('modulo-highlight'), 2000)
  }, 50)
}

watch(() => props.anchor, scrollToAnchor)

onBeforeUnmount(() => {
  clearTimeout(scrollTimer)
  clearTimeout(highlightTimer)
})

onMounted(async () => {
  await loadCurso(props.cursoId)
  scrollToAnchor()
})
watch(
  () => props.cursoId,
  async (newId) => {
    if (newId) {
      await loadCurso(newId)
      scrollToAnchor()
    }
  }
)

const curso = computed(
  () =>
    cursoData.value || {
      titulo: '',
      descripcion: '',
      duracion: '',
      nivel: '',
      imagen: '',
      lecciones: 0,
      modulos: 0,
      inscritos: 0,
      instructor: '',
      instructor_cargo: '',
      progreso: 0,
    }
)

const modulos = computed(() => {
  const source = modulosData.value
  return source.map((mod, index) => {
    const prevMod = index > 0 ? source[index - 1] : null
    const bloqueado = mod.requiere_previo && prevMod && prevMod.completado < 1
    let status = 'locked'
    if (mod.completado === 1) status = 'completed'
    else if (mod.completado > 0) status = 'in-progress'
    else if (!bloqueado) status = 'available'
    return { ...mod, bloqueado, status }
  })
})

const lessonsCompleted = computed(() => {
  const source = modulosData.value
  const total = source.reduce((sum, m) => sum + m.lecciones_count, 0)
  const done = source.reduce((sum, m) => sum + Math.round(m.lecciones_count * m.completado), 0)
  return `${done} / ${total}`
})

function goBack() {
  router.push({ name: 'home' })
}

async function handleCtaClick() {
  // No logueado → ir a login
  if (!auth.session?.user?.id) {
    router.push({ name: 'login' })
    return
  }

  // No inscrito → inscribir, luego abrir player
  if (inscrito.value === false) {
    inscribiendo.value = true
    inscripcionError.value = null
    try {
      await inscribirse(props.cursoId, auth.session)
      inscrito.value = true
      await continueCurso()
    } catch (err) {
      // Caso edge: doble clic muy rápido → 23505 duplicate key (PostgREST: 409).
      // Lo tratamos como éxito silencioso porque la inscripción ya existe.
      const msg = err?.message || ''
      if (err?.code === '23505' || /duplicate key|409/i.test(msg)) {
        inscrito.value = true
        try {
          await continueCurso()
        } catch (e) {
          console.warn('continueCurso post-dup:', e)
        }
      } else {
        // Detalle crudo a consola; mensaje friendly al usuario.
        console.error('Error al inscribirse:', err)
        inscripcionError.value = 'No se pudo procesar la inscripción. Intenta de nuevo.'
      }
    } finally {
      inscribiendo.value = false
    }
    return
  }

  // Inscrito → comportamiento actual
  await continueCurso()
}

async function continueCurso() {
  let leccionId = ''
  const token = auth.session?.access_token
  try {
    const { data: lecRows } = await sbSelect(
      `lecciones?select=id,orden,modulos!inner(curso_id,orden)&modulos.curso_id=eq.${props.cursoId}&order=orden.asc&limit=1000`,
      token
    )
    if (lecRows?.length) {
      lecRows.sort((a, b) => a.modulos.orden - b.modulos.orden || a.orden - b.orden)
      if (auth.session?.user?.id) {
        const { data: prog } = await sbSelect(
          `progreso?select=leccion_id&user_id=eq.${auth.session.user.id}&completado=eq.true&limit=10000`,
          token
        )
        const doneIds = new Set((prog || []).map((p) => p.leccion_id))
        const first = lecRows.find((l) => !doneIds.has(l.id))
        leccionId = first?.id || lecRows[0].id
      } else {
        leccionId = lecRows[0].id
      }
    }
  } catch (e) {
    console.warn('continueCurso fallback:', e)
  }
  router.push({ name: 'player', params: { cursoId: props.cursoId, leccionId } })
}
</script>

<template>
  <div>
    <!-- Breadcrumb bar -->
    <div
      :style="{
        borderBottom: '1px solid var(--line)',
        padding: 'calc(var(--unit) * 1.5) 0',
      }"
    >
      <div
        class="container"
        :style="{ display: 'flex', alignItems: 'center', gap: 'calc(var(--unit) * 1.5)' }"
      >
        <button
          class="btn btn-ghost btn-sm"
          :style="{ padding: 'calc(var(--unit)) calc(var(--unit) * 1.5)' }"
          @click="goBack"
        >
          <IconSet name="arrowLeft" />
        </button>
        <span class="mono" :style="{ color: 'var(--ink-3)' }">
          Inicio &middot; Cat&aacute;logo &middot; {{ curso.titulo }}
        </span>
      </div>
    </div>

    <!-- Estados de carga / error -->
    <div
      v-if="loading"
      class="container"
      :style="{ padding: 'calc(var(--unit) * 8) 0', textAlign: 'center', color: 'var(--ink-3)' }"
    >
      <span class="mono">Cargando curso&hellip;</span>
    </div>
    <div
      v-else-if="loadError"
      class="container"
      :style="{ padding: 'calc(var(--unit) * 8) 0', textAlign: 'center' }"
    >
      <p class="eyebrow" :style="{ color: 'var(--danger)' }">No se pudo cargar el curso</p>
      <p :style="{ marginTop: '8px', color: 'var(--ink-2)' }">
        {{ loadError }}
      </p>
    </div>
    <template v-else>
      <!-- Hero -->
      <section
        class="container"
        :style="{
          display: 'grid',
          gridTemplateColumns: '7fr 5fr',
          gap: 'calc(var(--unit) * 8)',
          paddingTop: 'calc(var(--unit) * 8)',
          paddingBottom: 'calc(var(--unit) * 8)',
          alignItems: 'start',
        }"
      >
        <!-- Left: course info -->
        <div :style="{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--unit) * 3)' }">
          <p class="eyebrow">
            {{ curso.nivel }}
          </p>

          <h1
            class="display"
            :style="{
              fontSize: 'clamp(40px, 4vw, 60px)',
              lineHeight: '0.95',
              color: 'var(--ink)',
            }"
          >
            {{ curso.titulo }}
          </h1>

          <p
            :style="{
              fontSize: '16px',
              lineHeight: '1.6',
              color: 'var(--ink-2)',
              maxWidth: '540px',
            }"
          >
            {{ curso.descripcion }}
          </p>

          <!-- Meta row -->
          <div
            :style="{
              display: 'flex',
              gap: 'calc(var(--unit) * 4)',
              paddingTop: 'calc(var(--unit) * 2)',
              borderTop: '1px solid var(--line)',
              flexWrap: 'wrap',
            }"
          >
            <div>
              <div class="eyebrow" :style="{ marginBottom: '4px' }">Duraci&oacute;n</div>
              <div :style="{ fontSize: '15px', fontWeight: '500' }">
                {{ curso.duracion }}
              </div>
            </div>
            <div>
              <div class="eyebrow" :style="{ marginBottom: '4px' }">Nivel</div>
              <div :style="{ fontSize: '15px', fontWeight: '500' }">
                {{ curso.nivel }}
              </div>
            </div>
            <div>
              <div class="eyebrow" :style="{ marginBottom: '4px' }">Inscritos</div>
              <div :style="{ fontSize: '15px', fontWeight: '500' }">
                {{ curso.inscritos.toLocaleString() }}
              </div>
            </div>
            <div>
              <div class="eyebrow" :style="{ marginBottom: '4px' }">Idioma</div>
              <div :style="{ fontSize: '15px', fontWeight: '500' }">Espa&ntilde;ol</div>
            </div>
          </div>
        </div>

        <!-- Right: side card -->
        <div
          class="card"
          :style="{
            padding: 'calc(var(--unit) * 4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'calc(var(--unit) * 3)',
          }"
        >
          <!-- Progress percentage -->
          <div :style="{ textAlign: 'center' }">
            <div
              class="display"
              :style="{ fontSize: '56px', color: 'var(--primary)', lineHeight: '1' }"
            >
              {{ Math.round(curso.progreso * 100) }}%
            </div>
            <div class="eyebrow" :style="{ marginTop: 'calc(var(--unit) * 1)' }">
              Progreso del curso
            </div>
          </div>

          <!-- Progress bar -->
          <ProgressBar :value="curso.progreso" />

          <!-- Stats -->
          <div
            :style="{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--unit) * 1.5)' }"
          >
            <div :style="{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }">
              <span :style="{ color: 'var(--ink-3)' }">Lecciones completadas</span>
              <span :style="{ fontWeight: '500' }">{{ lessonsCompleted }}</span>
            </div>
            <hr class="hairline" />
            <div :style="{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }">
              <span :style="{ color: 'var(--ink-3)' }">&Uacute;ltima actividad</span>
              <span :style="{ fontWeight: '500' }">Hace 2 d&iacute;as</span>
            </div>
            <hr class="hairline" />
            <div :style="{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }">
              <span :style="{ color: 'var(--ink-3)' }">Constancia</span>
              <span :style="{ fontWeight: '500' }">
                <template v-if="curso.progreso === 1">Disponible</template>
                <template v-else>Al completar</template>
              </span>
            </div>
          </div>

          <!-- CTA button -->
          <button
            class="btn btn-primary"
            :style="{ width: '100%', justifyContent: 'center' }"
            :disabled="inscribiendo"
            @click="handleCtaClick"
          >
            <template v-if="inscribiendo"> Inscribiendo&hellip; </template>
            <template v-else-if="inscrito === null">
              Inicia sesi&oacute;n para inscribirte
            </template>
            <template v-else-if="inscrito === false"> Inscribirme al curso </template>
            <template v-else-if="curso.progreso === 0"> Comenzar curso </template>
            <template v-else-if="curso.progreso === 1"> Revisar curso </template>
            <template v-else> Continuar </template>
            <IconSet name="arrow" />
          </button>

          <!-- Inline error si falla la inscripción -->
          <p
            v-if="inscripcionError"
            :style="{
              fontSize: '13px',
              color: 'var(--danger)',
              marginTop: 'calc(var(--unit) * -1)',
              textAlign: 'center',
            }"
          >
            {{ inscripcionError }}
          </p>

          <!-- Instructor info -->
          <div
            :style="{
              display: 'flex',
              alignItems: 'center',
              gap: 'calc(var(--unit) * 1.5)',
              paddingTop: 'calc(var(--unit) * 1.5)',
              borderTop: '1px solid var(--line)',
            }"
          >
            <!-- Avatar circle -->
            <div
              :style="{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--primary-100)',
                color: 'var(--primary)',
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--display)',
                fontSize: '18px',
                fontStyle: 'italic',
                flexShrink: '0',
              }"
            >
              {{ curso.instructor.charAt(0) }}
            </div>
            <div>
              <div :style="{ fontSize: '14px', fontWeight: '500' }">
                {{ curso.instructor }}
              </div>
              <div class="mono" :style="{ color: 'var(--ink-3)' }">
                {{ curso.instructor_cargo }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Learning path section -->
      <section
        :style="{
          background: 'var(--paper-2)',
          paddingTop: 'calc(var(--unit) * 8)',
          paddingBottom: 'calc(var(--unit) * 12)',
        }"
      >
        <div class="container">
          <!-- Section header -->
          <div :style="{ marginBottom: 'calc(var(--unit) * 6)' }">
            <h2
              class="display"
              :style="{
                fontSize: '36px',
                color: 'var(--ink)',
                marginBottom: 'calc(var(--unit) * 1)',
              }"
            >
              {{ modulos.length }} m&oacute;dulos. En orden.
            </h2>
            <p :style="{ color: 'var(--ink-3)', fontSize: '15px' }">
              Completa cada m&oacute;dulo para desbloquear el siguiente.
            </p>
          </div>

          <!-- Vertical node layout -->
          <div :style="{ display: 'flex', flexDirection: 'column' }">
            <div
              v-for="(mod, index) in modulos"
              :id="'modulo-' + mod.id"
              :key="mod.id"
              class="fade-in"
              :style="{
                display: 'grid',
                gridTemplateColumns: '64px 1fr',
                gap: 'calc(var(--unit) * 3)',
                animationDelay: index * 80 + 'ms',
                opacity: mod.bloqueado ? 0.6 : 1,
                cursor: mod.bloqueado ? 'not-allowed' : 'default',
              }"
            >
              <!-- Left column: node + connecting line -->
              <div
                :style="{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }"
              >
                <!-- Circular node -->
                <div
                  :style="{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: '0',
                    ...(mod.status === 'completed'
                      ? {
                          background: 'var(--primary)',
                          color: 'var(--paper)',
                        }
                      : mod.status === 'in-progress'
                        ? {
                            background: 'transparent',
                            border: '3px solid var(--primary)',
                            color: 'var(--primary)',
                          }
                        : mod.status === 'locked'
                          ? {
                              background: 'var(--paper-3)',
                              color: 'var(--ink-4)',
                              border: '1px solid var(--line)',
                            }
                          : {
                              background: 'var(--paper)',
                              color: 'var(--ink-2)',
                              border: '1px solid var(--line)',
                            }),
                  }"
                  :class="{ pulsing: mod.status === 'in-progress' }"
                >
                  <IconSet v-if="mod.status === 'completed'" name="check" />
                  <IconSet v-else-if="mod.status === 'locked'" name="lock" />
                  <span v-else class="display" :style="{ fontSize: '22px' }">{{ mod.orden }}</span>
                </div>

                <!-- Vertical hairline connecting to next -->
                <div
                  v-if="index < modulos.length - 1"
                  :style="{
                    width: '1px',
                    flex: '1',
                    minHeight: 'calc(var(--unit) * 3)',
                    background: mod.status === 'completed' ? 'var(--primary)' : 'var(--line)',
                  }"
                />
              </div>

              <!-- Right column: card with module info -->
              <div
                class="card"
                :style="{
                  padding: 'calc(var(--unit) * 3)',
                  marginBottom: index < modulos.length - 1 ? 'calc(var(--unit) * 2)' : '0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'calc(var(--unit) * 1.5)',
                }"
              >
                <!-- Cover banner (solo si el módulo tiene portada) -->
                <div
                  v-if="isUrl(mod.imagen_portada)"
                  class="modulo-cover"
                  :style="{
                    margin: 'calc(var(--unit) * -3) calc(var(--unit) * -3) 0',
                    height: '160px',
                    borderRadius: 'var(--radius, 8px) var(--radius, 8px) 0 0',
                    overflow: 'hidden',
                  }"
                >
                  <img
                    :src="mod.imagen_portada"
                    :alt="mod.titulo"
                    loading="lazy"
                    :style="{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }"
                  />
                </div>

                <!-- Top row: module label + chips -->
                <div
                  :style="{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 'calc(var(--unit))',
                  }"
                >
                  <span class="mono" :style="{ color: 'var(--ink-4)' }">
                    M&oacute;dulo {{ mod.orden }}
                  </span>
                  <span v-if="mod.status === 'completed'" class="chip chip-verde">
                    <IconSet name="check" />
                    Completado
                  </span>
                  <span v-else-if="mod.status === 'in-progress'" class="chip chip-primary">
                    <span class="chip-dot" />
                    {{ Math.round(mod.completado * 100) }}%
                  </span>
                  <span v-else-if="mod.status === 'locked'" class="chip">
                    <IconSet name="lock" />
                    Bloqueado
                  </span>
                  <span v-else class="chip chip-accent">
                    <span class="chip-dot" />
                    Disponible
                  </span>
                </div>

                <!-- Title -->
                <h3
                  class="display"
                  :style="{ fontSize: '22px', lineHeight: '1.15', color: 'var(--ink)' }"
                >
                  {{ mod.titulo }}
                </h3>

                <!-- Description -->
                <p :style="{ fontSize: '14px', lineHeight: '1.5', color: 'var(--ink-3)' }">
                  {{ mod.descripcion }}
                </p>

                <!-- Meta -->
                <div
                  :style="{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'calc(var(--unit) * 2)',
                    color: 'var(--ink-3)',
                    fontSize: '13px',
                  }"
                >
                  <span :style="{ display: 'inline-flex', alignItems: 'center', gap: '5px' }">
                    <IconSet name="clock" />
                    {{ mod.duracion }}
                  </span>
                  <span :style="{ display: 'inline-flex', alignItems: 'center', gap: '5px' }">
                    <IconSet name="doc" />
                    {{ mod.lecciones_count }} lecciones
                  </span>
                </div>

                <!-- Action button -->
                <div :style="{ paddingTop: 'calc(var(--unit) * 0.5)' }">
                  <!-- Si no está inscrito (o no logueado), bloqueamos todos los botones de módulo -->
                  <button
                    v-if="inscrito !== true"
                    class="btn btn-ghost btn-sm"
                    :style="{ opacity: '0.5', cursor: 'not-allowed' }"
                    disabled
                  >
                    <IconSet name="lock" />
                    Inscr&iacute;bete al curso para acceder
                  </button>
                  <button
                    v-else-if="mod.status === 'completed'"
                    class="btn btn-ghost btn-sm"
                    @click="router.push({ name: 'player', params: { cursoId } })"
                  >
                    Revisar
                    <IconSet name="arrow" />
                  </button>
                  <button
                    v-else-if="mod.status === 'in-progress'"
                    class="btn btn-primary btn-sm"
                    @click="router.push({ name: 'player', params: { cursoId } })"
                  >
                    Continuar
                    <IconSet name="arrow" />
                  </button>
                  <button
                    v-else-if="mod.status === 'available'"
                    class="btn btn-ghost btn-sm"
                    @click="router.push({ name: 'player', params: { cursoId } })"
                  >
                    Comenzar
                    <IconSet name="arrow" />
                  </button>
                  <button
                    v-else
                    class="btn btn-ghost btn-sm"
                    :style="{ opacity: '0.5', cursor: 'not-allowed' }"
                    disabled
                  >
                    <IconSet name="lock" />
                    Completa el anterior
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Aulas virtuales (módulo LMS 4, feature-flag VITE_FEATURE_AULAS) -->
      <SesionesVirtualesPanel
        v-if="featureEnabled('aulas') && cursoData && inscrito !== null"
        :curso-id="cursoId"
        :session="session"
        :perfil="perfilApp"
      />

      <!-- Foros del curso (módulo LMS 2, feature-flag VITE_FEATURE_FOROS).
         El panel decide su propia visibilidad: inscritos + instructores. -->
      <ForosPanel
        v-if="featureEnabled('foros') && cursoData"
        :curso-id="cursoId"
        :session="session"
        :perfil="perfilApp"
        :inscrito="inscrito === true"
      />

      <!-- Chat del curso (módulo LMS 5, feature-flag VITE_FEATURE_CHAT) -->
      <section
        v-if="
          featureEnabled('chat') &&
          cursoData &&
          (inscrito === true || perfilApp?.es_instructor || perfilApp?.es_admin)
        "
        class="chat-curso-wrap"
      >
        <ChatPanel
          :curso-id="cursoId"
          :session="session"
          :perfil="perfilApp"
          titulo="Chat del curso"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.chat-curso-wrap {
  max-width: 980px;
  margin: 0 auto;
  padding: 0 calc(var(--unit) * 3) calc(var(--unit) * 5);
  height: 480px;
  display: flex;
  flex-direction: column;
}
.chat-curso-wrap > * {
  border: 1px solid var(--paper-3, #e8e2d6);
  border-radius: 10px;
  overflow: hidden;
}
.modulo-highlight {
  outline: 2px solid var(--primary);
  outline-offset: 4px;
  transition: outline-color 0.3s ease;
}
</style>
