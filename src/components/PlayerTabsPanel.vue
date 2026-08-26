<!-- src/components/PlayerTabsPanel.vue
     Pestañas bajo la superficie de visionado: Notas · Recursos · Dudas.
     Sustituye al bloque de «notas» con texto clavado (mentía el mismo
     contenido en toda lección) y a los botones muertos de la variante de
     enfoque. Vive sobre el shell oscuro del reproductor. -->
<script setup>
import { ref, computed, watch } from 'vue'
import PlayerChatPane from '@/components/PlayerChatPane.vue'
import DownloadButton from '@/components/DownloadButton.vue'
import IconSet from '@/components/IconSet.vue'
import { listarNotas, crearNota, eliminarNota } from '@/services/notasLeccion.js'

const props = defineProps({
  lecciones: { type: Array, default: () => [] },
  comentarios: { type: Array, default: () => [] },
  draft: { type: String, default: '' },
  offlineEnabled: { type: Boolean, default: false },
  source: { type: Object, default: null },
  hlsMasterUrl: { type: String, default: '' },
  leccionId: { type: String, default: '' },
  currentTime: { type: Number, default: 0 },
  conSesion: { type: Boolean, default: false },
})

const emit = defineEmits(['send', 'update:draft', 'select', 'ir-a-segundo'])

const TABS = [
  { id: 'notas', label: 'Notas' },
  { id: 'recursos', label: 'Recursos' },
  { id: 'dudas', label: 'Dudas' },
]
const activa = ref('notas')

// Los materiales tipo «recurso» del curso son lecciones: se listan y el clic
// navega a ellas. La descarga sin conexión del video también es un recurso.
const recursos = computed(() => props.lecciones.filter((l) => l.tipo === 'recurso'))
const hayDescarga = computed(() => props.offlineEnabled && props.source?.kind === 'hls')
const esVideo = computed(() => props.source?.kind === 'hls')

/* ── Notas por lección (migración 002) ── */
const notas = ref([])
const notasCargando = ref(false)
const notasError = ref('')
const notaDraft = ref('')
const notaGuardando = ref(false)

async function cargarNotas(leccionId) {
  if (!leccionId || !props.conSesion) {
    notas.value = []
    return
  }
  notasCargando.value = true
  notasError.value = ''
  try {
    notas.value = await listarNotas(leccionId)
  } catch (e) {
    notasError.value = e?.message || 'No se pudieron cargar tus notas.'
  } finally {
    notasCargando.value = false
  }
}

watch(() => props.leccionId, cargarNotas, { immediate: true })

async function guardarNota() {
  const contenido = notaDraft.value.trim()
  if (!contenido || notaGuardando.value) return
  notaGuardando.value = true
  notasError.value = ''
  try {
    // El sello de tiempo solo tiene sentido con línea de tiempo (video).
    const segundo = esVideo.value ? Math.floor(props.currentTime || 0) : null
    const nota = await crearNota({ leccionId: props.leccionId, contenido, segundoVideo: segundo })
    notas.value = [...notas.value, nota]
    notaDraft.value = ''
  } catch (e) {
    notasError.value = e?.message || 'No se pudo guardar la nota.'
  } finally {
    notaGuardando.value = false
  }
}

async function borrarNota(id) {
  try {
    await eliminarNota(id)
    notas.value = notas.value.filter((n) => n.id !== id)
  } catch (e) {
    notasError.value = e?.message || 'No se pudo borrar la nota.'
  }
}

function fmtSegundo(s) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
</script>

<template>
  <div class="player-tabs">
    <div class="player-tabs-bar" role="tablist" aria-label="Material de la lección">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="player-tab"
        role="tab"
        :aria-selected="activa === t.id"
        @click="activa = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div class="player-tabs-body">
      <!-- Notas privadas, con el minuto del video en que se tomaron. -->
      <div v-if="activa === 'notas'" class="player-tab-notas" role="tabpanel">
        <p v-if="!conSesion" class="player-tab-vacio">Inicia sesión para tomar notas.</p>
        <template v-else>
          <p v-if="notasCargando" class="player-tab-vacio">Cargando tus notas…</p>
          <p v-else-if="notas.length === 0 && !notasError" class="player-tab-vacio">
            Aún no tienes notas en esta lección. Lo que escribas aquí es tuyo: nadie más lo ve.
          </p>
          <ul v-if="notas.length" class="player-notas-lista">
            <li v-for="n in notas" :key="n.id" class="player-nota">
              <button
                v-if="n.segundo_video != null && esVideo"
                class="player-nota-sello"
                :title="`Ir al minuto ${fmtSegundo(n.segundo_video)}`"
                @click="emit('ir-a-segundo', n.segundo_video)"
              >
                {{ fmtSegundo(n.segundo_video) }}
              </button>
              <span v-else-if="n.segundo_video != null" class="player-nota-sello is-static">
                {{ fmtSegundo(n.segundo_video) }}
              </span>
              <p class="player-nota-texto">
                {{ n.contenido }}
              </p>
              <button
                class="player-nota-borrar"
                :aria-label="`Borrar nota`"
                title="Borrar nota"
                @click="borrarNota(n.id)"
              >
                ✕
              </button>
            </li>
          </ul>
          <p v-if="notasError" class="player-tab-error" role="alert">
            {{ notasError }}
          </p>
          <form class="player-nota-form" @submit.prevent="guardarNota">
            <textarea
              v-model="notaDraft"
              rows="2"
              maxlength="4000"
              :placeholder="
                esVideo ? 'Escribe una nota; se guarda con el minuto actual…' : 'Escribe una nota…'
              "
            />
            <button
              class="btn btn-primary btn-sm"
              type="submit"
              :disabled="!notaDraft.trim() || notaGuardando"
            >
              <template v-if="notaGuardando"> Guardando… </template>
              <template v-else-if="esVideo">
                Guardar en {{ fmtSegundo(currentTime || 0) }}
              </template>
              <template v-else> Guardar nota </template>
            </button>
          </form>
        </template>
      </div>

      <div v-else-if="activa === 'recursos'" class="player-tab-recursos" role="tabpanel">
        <DownloadButton
          v-if="hayDescarga"
          :video-id="source.videoId"
          :leccion-id="leccionId"
          :playlist-url="hlsMasterUrl"
        />
        <button
          v-for="r in recursos"
          :key="r.id"
          class="player-tab-recurso-item"
          type="button"
          @click="emit('select', r.id)"
        >
          <IconSet name="doc" />
          {{ r.titulo }}
        </button>
        <p v-if="!hayDescarga && recursos.length === 0" class="player-tab-vacio">
          Esta lección no tiene recursos descargables.
        </p>
      </div>

      <PlayerChatPane
        v-else
        :draft="draft"
        :comentarios="comentarios"
        role="tabpanel"
        @update:draft="(v) => emit('update:draft', v)"
        @send="emit('send')"
      />
    </div>
  </div>
</template>
