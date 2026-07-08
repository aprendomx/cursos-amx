<script setup>
import { ref, computed, watch } from 'vue'
import { useEntregas } from '@/composables/useEntregas.js'
import LessonRichTextEditor from '@/components/LessonRichTextEditor.vue'
import RubricaAlumnoView from '@/components/RubricaAlumnoView.vue'

const props = defineProps({
  tareaId: { type: String, required: true },
  userId: { type: String, required: true },
})

const emit = defineEmits(['entregar', 'nuevaVersion'])

const leccion = computed(() => ({
  id: props.tareaId,
  entrega_tipos: ['pdf', 'docx', 'zip', 'png', 'jpg'],
  entrega_max_mb: 10,
}))

const { entrega, historial, subiendo, error, accept, maxMb, subir, cargar } = useEntregas(
  '',
  leccion
)

watch(
  () => props.tareaId,
  () => cargar(),
  { immediate: true }
)

const contenido = ref(null)
const fileSeleccionado = ref(null)
const mostrarHistorial = ref(false)

const estado = computed(() => entrega.value?.estado || 'pendiente')

const puedeEntregar = computed(() => {
  if (estado.value === 'pendiente' || estado.value === 'devuelta') return true
  if (estado.value === 'entregada') return entrega.value?.puede_entregar !== false
  return false
})

const ESTADO_BANNER = {
  pendiente: {
    label: 'Pendiente de entrega',
    color: 'var(--ink-3)',
    bg: 'var(--paper-2)',
    border: 'var(--line)',
  },
  entregada: {
    label: 'Entregada',
    color: 'var(--primary)',
    bg: 'var(--primary-100)',
    border: 'var(--primary-100)',
  },
  calificada: {
    label: 'Calificada',
    color: 'var(--brand-secondary)',
    bg: 'var(--brand-secondary-soft)',
    border: 'var(--brand-secondary-soft)',
  },
  devuelta: {
    label: 'Devuelta para corrección',
    color: 'var(--brand-accent)',
    bg: 'var(--brand-accent-soft)',
    border: 'var(--brand-accent-soft)',
  },
}

const banner = computed(() => ESTADO_BANNER[estado.value] || ESTADO_BANNER.pendiente)

const fmtFecha = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const diasRestantes = computed(() => {
  const limite = entrega.value?.fecha_limite || leccion.value?.fecha_limite
  if (!limite || estado.value !== 'pendiente') return null
  const diff = Math.ceil((new Date(limite) - Date.now()) / (1000 * 60 * 60 * 24))
  return diff
})

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (file) fileSeleccionado.value = file
}

async function onEntregar() {
  if (fileSeleccionado.value) {
    await subir(fileSeleccionado.value)
  }
  emit('entregar', {
    tareaId: props.tareaId,
    contenido: contenido.value,
    file: fileSeleccionado.value,
  })
}
</script>

<template>
  <div class="card">
    <!-- Banner de estado -->
    <div
      :style="{
        padding: 'calc(var(--unit) * 1.5) calc(var(--unit) * 2.5)',
        background: banner.bg,
        color: banner.color,
        borderBottom: `1px solid ${banner.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }"
    >
      <span class="mono" :style="{ fontSize: '11px' }">
        {{ banner.label }}
      </span>
      <span v-if="diasRestantes != null" class="mono" :style="{ fontSize: '11px' }">
        {{ diasRestantes > 0 ? `${diasRestantes} días restantes` : 'Venció la fecha límite' }}
      </span>
    </div>

    <div
      :style="{
        padding: 'calc(var(--unit) * 2.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--unit) * 2)',
      }"
    >
      <p v-if="error" class="mono" :style="{ color: 'var(--primary)', fontSize: '12px' }">
        ⚠ {{ error }}
      </p>

      <!-- Formulario de entrega (pendiente / devuelta) -->
      <template v-if="estado === 'pendiente' || estado === 'devuelta'">
        <div :style="{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--unit) * 1)' }">
          <p class="eyebrow">Tu respuesta / comentarios</p>
          <LessonRichTextEditor v-model="contenido" data-test="tiptap-editor" />
        </div>

        <div :style="{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--unit) * 1)' }">
          <p class="eyebrow">Adjuntar archivo</p>
          <div :style="{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }">
            <input type="file" :accept="accept" @change="onFileChange" />
            <span class="mono" :style="{ fontSize: '11px', color: 'var(--ink-4)' }">
              Máx {{ maxMb }} MB
            </span>
          </div>
          <p
            v-if="fileSeleccionado"
            class="mono"
            :style="{ fontSize: '12px', color: 'var(--ink-2)' }"
          >
            📎 {{ fileSeleccionado.name }}
          </p>
        </div>

        <button class="btn btn-primary btn-sm" :disabled="subiendo" @click="onEntregar">
          {{ subiendo ? 'Entregando…' : 'Entregar' }}
        </button>
      </template>

      <!-- Vista entregada -->
      <template v-else-if="estado === 'entregada'">
        <div :style="{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--unit) * 1)' }">
          <p class="eyebrow">Entrega actual</p>
          <div :style="{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }">
            <span class="mono" :style="{ fontSize: '13px' }">
              v{{ entrega.version }} · {{ fmtFecha(entrega.creado_en) }}
            </span>
          </div>
          <button
            v-if="puedeEntregar"
            class="btn btn-secondary btn-sm"
            @click="emit('nuevaVersion', entrega)"
          >
            Nueva versión
          </button>
        </div>
      </template>

      <!-- Vista calificada -->
      <template v-else-if="estado === 'calificada'">
        <div :style="{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--unit) * 2)' }">
          <RubricaAlumnoView
            v-if="entrega?.rubrica"
            :rubrica="entrega.rubrica"
            :calificaciones="entrega.calificaciones || []"
            :puntaje-final="entrega.puntaje_final ?? entrega.puntaje ?? 0"
            data-test="rubrica-view"
          />
          <div
            v-if="entrega?.comentario_instructor"
            :style="{
              background: 'var(--paper-2)',
              padding: 'calc(var(--unit) * 1.5)',
              borderLeft: '3px solid var(--brand-accent)',
              borderRadius: '4px',
            }"
          >
            <p class="eyebrow" :style="{ marginBottom: '4px' }">Comentario del instructor</p>
            <p :style="{ fontSize: '13px', color: 'var(--ink-2)' }">
              {{ entrega.comentario_instructor }}
            </p>
          </div>
          <div
            :style="{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderTop: '1px solid var(--line)',
              paddingTop: 'calc(var(--unit) * 1.5)',
            }"
          >
            <span class="eyebrow">Puntaje final</span>
            <span
              :style="{
                fontSize: '28px',
                fontWeight: '600',
                color:
                  (entrega?.puntaje_final ?? entrega?.puntaje ?? 0) >= 80
                    ? 'var(--brand-secondary)'
                    : (entrega?.puntaje_final ?? entrega?.puntaje ?? 0) >= 60
                      ? 'var(--brand-accent)'
                      : 'var(--primary)',
              }"
            >
              {{ entrega?.puntaje_final ?? entrega?.puntaje ?? 0 }}
            </span>
          </div>
        </div>
      </template>

      <!-- Historial de versiones -->
      <div v-if="historial.length > 0">
        <button class="btn btn-ghost btn-sm" @click="mostrarHistorial = !mostrarHistorial">
          {{ mostrarHistorial ? 'Ocultar' : 'Ver' }} historial de versiones ({{ historial.length }})
        </button>
        <ul
          v-if="mostrarHistorial"
          :style="{
            listStyle: 'none',
            margin: '6px 0 0',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }"
        >
          <li
            v-for="h in historial"
            :key="h.id"
            class="mono"
            :style="{ fontSize: '11px', color: 'var(--ink-4)' }"
          >
            v{{ h.version }} · {{ fmtFecha(h.creado_en) }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
