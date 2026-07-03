<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { useChat } from '@/composables/useChat.js'

const props = defineProps({
  cursoId: { type: String, required: true },
  sesionId: { type: String, default: null }, // null = chat del curso
  session: { type: Object, default: null },
  perfil: { type: Object, default: null },
  // 'claro' para páginas; 'oscuro' dentro del aula virtual
  tema: { type: String, default: 'claro' },
  titulo: { type: String, default: 'Chat del curso' },
})

const {
  habilitado,
  mensajes,
  loading,
  enviando,
  error,
  esInstructorCurso,
  esDeInstructor,
  init,
  enviar,
  eliminar,
  slugMencion,
  sugerencias,
  segmentos,
} = useChat(props.cursoId, {
  sesionId: props.sesionId,
  userId: props.session?.user?.id || null,
  esAdmin: props.perfil?.es_admin === true,
})

const draft = ref('')
const inputRef = ref(null)
const listaRef = ref(null)

/* @menciones: detectar token en el caret y autocompletar */
const menuAbierto = ref(false)
const menuOpciones = ref([])
let tokenInicio = -1

function onInput() {
  const el = inputRef.value
  if (!el) return
  const caret = el.selectionStart ?? draft.value.length
  const antes = draft.value.slice(0, caret)
  const m = antes.match(/@([\p{L}\p{N}_]*)$/u)
  if (m) {
    tokenInicio = caret - m[0].length
    menuOpciones.value = sugerencias(m[1].replace(/_/g, ' '))
    menuAbierto.value = menuOpciones.value.length > 0
  } else {
    menuAbierto.value = false
  }
}

function elegirMencion(p) {
  const el = inputRef.value
  const caret = el?.selectionStart ?? draft.value.length
  const mencion = slugMencion(p.nombre) + ' '
  draft.value = draft.value.slice(0, tokenInicio) + mencion + draft.value.slice(caret)
  menuAbierto.value = false
  nextTick(() => {
    el?.focus()
    const pos = tokenInicio + mencion.length
    el?.setSelectionRange(pos, pos)
  })
}

async function onEnviar() {
  if (menuAbierto.value) return // enter selecciona, no envía
  const msg = await enviar(draft.value)
  if (msg) draft.value = ''
}

function onKeydown(e) {
  if (e.key === 'Escape') menuAbierto.value = false
  if (e.key === 'Enter' && menuAbierto.value && menuOpciones.value.length) {
    e.preventDefault()
    elegirMencion(menuOpciones.value[0])
  }
}

async function onEliminar(msg) {
  if (!confirm('¿Eliminar este mensaje? Quedará registrado en el log de moderación.')) return
  await eliminar(msg.id)
}

watch(
  () => mensajes.value.length,
  async () => {
    await nextTick()
    if (listaRef.value) listaRef.value.scrollTop = listaRef.value.scrollHeight
  }
)

onMounted(() => {
  if (habilitado && props.session) init()
})

const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

const nombre = (p) => (p ? `${p.nombres || ''} ${p.apellido_paterno || ''}`.trim() : '—')
</script>

<template>
  <div v-if="habilitado && session" class="chatp" :data-tema="tema">
    <div class="chatp-header">
      <span class="eyebrow">{{ titulo }}</span>
      <span class="chatp-dot pulsing" />
    </div>

    <p v-if="error" class="chatp-error mono">⚠ {{ error }}</p>

    <div ref="listaRef" class="chatp-mensajes">
      <p v-if="!mensajes.length && !loading" class="chatp-vacio">
        Sin mensajes todavía. ¡Escribe el primero!
      </p>
      <div v-for="m in mensajes" :key="m.id" class="chatp-msg">
        <div class="chatp-avatar" :class="{ 'is-instructor': esDeInstructor(m) }">
          {{ nombre(m.perfiles).charAt(0) || '?' }}
        </div>
        <div class="chatp-cuerpo">
          <div class="chatp-meta">
            <strong>{{ nombre(m.perfiles) }}</strong>
            <span v-if="esDeInstructor(m)" class="chatp-badge mono">Instructor</span>
            <span class="chatp-hora mono">{{ fmtHora(m.creado_en) }}</span>
            <button
              v-if="esInstructorCurso"
              class="chatp-borrar mono"
              title="Eliminar mensaje"
              @click="onEliminar(m)"
            >
              ✕
            </button>
          </div>
          <p class="chatp-texto">
            <template v-for="(seg, i) in segmentos(m.contenido)" :key="i">
              <span v-if="seg.tipo === 'mencion'" class="chatp-mencion">{{ seg.valor }}</span>
              <template v-else>
                {{ seg.valor }}
              </template>
            </template>
          </p>
        </div>
      </div>
    </div>

    <div class="chatp-input-wrap">
      <!-- Autocompletado de @menciones -->
      <ul v-if="menuAbierto" class="chatp-menu">
        <li v-for="p in menuOpciones" :key="p.user_id">
          <button type="button" @mousedown.prevent="elegirMencion(p)">
            {{ p.nombre }}
            <span v-if="p.es_instructor" class="chatp-badge mono">Instructor</span>
          </button>
        </li>
      </ul>
      <div class="chatp-input-bar">
        <input
          ref="inputRef"
          v-model="draft"
          type="text"
          maxlength="1000"
          placeholder="Escribe un mensaje… usa @ para mencionar"
          :disabled="enviando"
          @input="onInput"
          @keydown="onKeydown"
          @keydown.enter="onEnviar"
        />
        <button
          class="chatp-enviar btn btn-primary btn-sm"
          :disabled="enviando || !draft.trim()"
          @click="onEnviar"
        >
          Enviar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chatp {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  --chatp-bg: var(--paper, #fff);
  --chatp-ink: var(--ink, #161a1d);
  --chatp-ink-2: var(--ink-3, #666);
  --chatp-borde: var(--paper-3, #e8e2d6);
  background: var(--chatp-bg);
}
.chatp[data-tema='oscuro'] {
  --chatp-bg: rgba(255, 255, 255, 0.03);
  --chatp-ink: var(--paper, #fff);
  --chatp-ink-2: rgba(255, 255, 255, 0.55);
  --chatp-borde: rgba(255, 255, 255, 0.12);
}
.chatp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--chatp-borde);
}
.chatp-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary, #9b2247);
}
.chatp-error {
  color: var(--primary, #9b2247);
  font-size: 12px;
  padding: 8px 14px;
}
.chatp-mensajes {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.chatp-vacio {
  color: var(--chatp-ink-2);
  font-size: 13px;
}
.chatp-msg {
  display: flex;
  gap: 10px;
}
.chatp-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 600;
  background: var(--paper-2, #f0ece2);
  color: var(--brand-accent, #a57f2c);
}
.chatp[data-tema='oscuro'] .chatp-avatar {
  background: rgba(255, 255, 255, 0.08);
}
.chatp-avatar.is-instructor {
  background: var(--brand-accent, #a57f2c);
  color: var(--paper, #fff);
}
.chatp-cuerpo {
  min-width: 0;
  flex: 1;
}
.chatp-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.chatp-meta strong {
  font-size: 13px;
  color: var(--chatp-ink);
}
.chatp-badge {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: var(--brand-accent, #a57f2c);
  color: var(--paper, #fff);
  padding: 1px 6px;
  border-radius: 3px;
}
.chatp-hora {
  font-size: 10px;
  color: var(--chatp-ink-2);
}
.chatp-borrar {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--chatp-ink-2);
  padding: 0 4px;
}
.chatp-borrar:hover {
  color: var(--primary, #9b2247);
}
.chatp-texto {
  font-size: 14px;
  color: var(--chatp-ink);
  margin-top: 2px;
  word-break: break-word;
}
.chatp-mencion {
  color: var(--brand-accent, #a57f2c);
  font-weight: 600;
}
.chatp-input-wrap {
  position: relative;
  border-top: 1px solid var(--chatp-borde);
}
.chatp-menu {
  position: absolute;
  bottom: 100%;
  left: 10px;
  right: 10px;
  margin: 0 0 4px;
  padding: 4px;
  list-style: none;
  background: var(--paper, #fff);
  border: 1px solid var(--paper-3, #ddd);
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
  z-index: 5;
  max-height: 200px;
  overflow-y: auto;
}
.chatp-menu button {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--ink, #222);
  cursor: pointer;
  border-radius: 5px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.chatp-menu button:hover {
  background: var(--paper-2, #f3efe7);
}
.chatp-input-bar {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
}
.chatp-input-bar input {
  flex: 1;
  font: inherit;
  font-size: 14px;
  padding: 8px 12px;
  border: 1px solid var(--chatp-borde);
  border-radius: 6px;
  background: transparent;
  color: var(--chatp-ink);
  outline: none;
}
.chatp-input-bar input:focus {
  border-color: var(--brand-accent, #a57f2c);
}
.chatp[data-tema='oscuro'] .chatp-input-bar input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}
</style>
