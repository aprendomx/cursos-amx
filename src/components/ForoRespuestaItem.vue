<script setup>
import { ref } from 'vue'

const props = defineProps({
  respuesta: { type: Object, required: true }, // con .hijas si es raíz
  nivel: { type: Number, default: 0 }, // 0 = raíz, 1 = anidada
  esInstructorCurso: { type: Boolean, default: false },
  esDeInstructor: { type: Function, required: true },
  puedeEditar: { type: Function, required: true },
})

const emit = defineEmits(['responder', 'editar', 'moderar'])

const respondiendo = ref(false)
const draftRespuesta = ref('')
const editando = ref(false)
const draftEdicion = ref('')

function enviarRespuesta() {
  const texto = draftRespuesta.value.trim()
  if (!texto) return
  emit('responder', { padreId: props.respuesta.id, cuerpo: texto })
  draftRespuesta.value = ''
  respondiendo.value = false
}

function empezarEdicion() {
  draftEdicion.value = props.respuesta.cuerpo
  editando.value = true
}

function guardarEdicion() {
  const texto = draftEdicion.value.trim()
  if (!texto) return
  emit('editar', { id: props.respuesta.id, cuerpo: texto })
  editando.value = false
}

const fmtFecha = (iso) =>
  new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

const nombre = (p) => (p ? `${p.nombres || ''} ${p.apellido_paterno || ''}`.trim() : '—')
</script>

<template>
  <div
    class="foro-resp"
    :class="{
      'is-anidada': nivel > 0,
      'is-destacada': respuesta.destacado,
      'is-oculta': respuesta.oculto,
    }"
  >
    <div class="foro-resp-meta">
      <strong>{{ nombre(respuesta.perfiles) }}</strong>
      <span v-if="esDeInstructor(respuesta)" class="foro-badge-instructor mono">Instructor</span>
      <span v-if="respuesta.destacado" class="chip chip-oro">Destacada</span>
      <span v-if="respuesta.oculto" class="chip">Oculta</span>
      <span class="mono foro-fecha">{{ fmtFecha(respuesta.creado_en) }}</span>
    </div>

    <template v-if="!editando">
      <p class="foro-resp-cuerpo">
        {{ respuesta.cuerpo }}
      </p>
    </template>
    <template v-else>
      <textarea v-model="draftEdicion" rows="3" class="foro-textarea" />
      <div class="foro-acciones">
        <button class="btn btn-primary btn-sm" @click="guardarEdicion">Guardar</button>
        <button class="btn btn-ghost btn-sm" @click="editando = false">Cancelar</button>
      </div>
    </template>

    <div v-if="!editando" class="foro-acciones">
      <button v-if="nivel === 0" class="btn btn-ghost btn-sm" @click="respondiendo = !respondiendo">
        Responder
      </button>
      <button v-if="puedeEditar(respuesta)" class="btn btn-ghost btn-sm" @click="empezarEdicion">
        Editar
      </button>

      <template v-if="esInstructorCurso">
        <button
          v-if="!respuesta.destacado"
          class="btn btn-ghost btn-sm"
          @click="emit('moderar', { id: respuesta.id, accion: 'destacar' })"
        >
          Destacar
        </button>
        <button
          v-else
          class="btn btn-ghost btn-sm"
          @click="emit('moderar', { id: respuesta.id, accion: 'quitar_destacado' })"
        >
          Quitar destacado
        </button>
        <button
          v-if="!respuesta.oculto"
          class="btn btn-ghost btn-sm"
          @click="emit('moderar', { id: respuesta.id, accion: 'ocultar' })"
        >
          Ocultar
        </button>
        <button
          v-else
          class="btn btn-ghost btn-sm"
          @click="emit('moderar', { id: respuesta.id, accion: 'mostrar' })"
        >
          Mostrar
        </button>
        <button
          class="btn btn-ghost btn-sm foro-eliminar"
          @click="emit('moderar', { id: respuesta.id, accion: 'eliminar' })"
        >
          Eliminar
        </button>
      </template>
    </div>

    <div v-if="respondiendo" class="foro-form-respuesta">
      <textarea
        v-model="draftRespuesta"
        rows="2"
        class="foro-textarea"
        placeholder="Escribe tu respuesta…"
      />
      <div class="foro-acciones">
        <button class="btn btn-primary btn-sm" @click="enviarRespuesta">Publicar</button>
        <button class="btn btn-ghost btn-sm" @click="respondiendo = false">Cancelar</button>
      </div>
    </div>

    <!-- Hijas (nivel 2, máximo) -->
    <div v-if="respuesta.hijas?.length" class="foro-hijas">
      <ForoRespuestaItem
        v-for="h in respuesta.hijas"
        :key="h.id"
        :respuesta="h"
        :nivel="1"
        :es-instructor-curso="esInstructorCurso"
        :es-de-instructor="esDeInstructor"
        :puede-editar="puedeEditar"
        @responder="emit('responder', $event)"
        @editar="emit('editar', $event)"
        @moderar="emit('moderar', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.foro-resp {
  padding: calc(var(--unit) * 1.5) 0;
  border-bottom: 1px solid var(--paper-3, #eee);
}
.foro-resp.is-anidada {
  border-bottom: none;
  border-left: 2px solid var(--paper-3, #e5e0d8);
  padding-left: calc(var(--unit) * 2);
  margin-top: calc(var(--unit) * 1);
}
.foro-resp.is-destacada {
  box-shadow: inset 3px 0 0 var(--oro, #a57f2c);
  padding-left: calc(var(--unit) * 1.5);
}
.foro-resp.is-oculta {
  opacity: 0.55;
}
.foro-resp-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--ink-3);
}
.foro-resp-meta strong {
  color: var(--ink);
}
.foro-resp-cuerpo {
  margin: 6px 0 8px;
  font-size: 14px;
  color: var(--ink-2);
  white-space: pre-wrap;
}
.foro-fecha {
  font-size: 11px;
  color: var(--ink-4);
}
.foro-badge-instructor {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: var(--oro, #a57f2c);
  color: var(--paper, #fff);
  padding: 1px 6px;
  border-radius: 3px;
}
.chip-oro {
  background: var(--dorado-200, #e6d194);
  color: #8a6e3f;
}
.foro-acciones {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.foro-eliminar {
  color: var(--primary);
}
.foro-textarea {
  width: 100%;
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border: 1px solid var(--paper-3, #ddd);
  border-radius: 6px;
  resize: vertical;
}
.foro-form-respuesta {
  margin-top: calc(var(--unit) * 1);
}
.foro-hijas {
  margin-top: calc(var(--unit) * 0.5);
}
</style>
