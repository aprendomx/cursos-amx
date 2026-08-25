<!-- src/components/PlayerTabsPanel.vue
     Pestañas bajo la superficie de visionado: Notas · Recursos · Dudas.
     Sustituye al bloque de «notas» con texto clavado (mentía el mismo
     contenido en toda lección) y a los botones muertos de la variante de
     enfoque. Vive sobre el shell oscuro del reproductor. -->
<script setup>
import { ref, computed } from 'vue'
import PlayerChatPane from '@/components/PlayerChatPane.vue'
import DownloadButton from '@/components/DownloadButton.vue'
import IconSet from '@/components/IconSet.vue'

const props = defineProps({
  lecciones: { type: Array, default: () => [] },
  comentarios: { type: Array, default: () => [] },
  draft: { type: String, default: '' },
  offlineEnabled: { type: Boolean, default: false },
  source: { type: Object, default: null },
  hlsMasterUrl: { type: String, default: '' },
  leccionId: { type: String, default: '' },
})

const emit = defineEmits(['send', 'update:draft', 'select'])

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
      <!-- Notas por lección: el dato aún no existe (llega con la fase de
           hábito y recompensa). Se dice, en vez de rellenar con texto de
           utilería. -->
      <p v-if="activa === 'notas'" class="player-tab-vacio" role="tabpanel">
        Aquí vivirán tus notas de esta lección, con el minuto del video en que las tomaste. Estamos
        construyéndolo.
      </p>

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
