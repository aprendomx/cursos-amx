<script setup>
import { ref, computed, onMounted } from 'vue'
import { useForos } from '@/composables/useForos.js'
import { emitirEvento } from '@/services/analytics.js'
import ForoRespuestaItem from '@/components/ForoRespuestaItem.vue'

const props = defineProps({
  cursoId: { type: String, required: true },
  session: { type: Object, default: null },
  perfil: { type: Object, default: null },
  inscrito: { type: Boolean, default: false },
})

const {
  habilitado,
  foros,
  foroActivo,
  hilos,
  hiloActivo,
  arbolRespuestas,
  esInstructorCurso,
  loading,
  error,
  init,
  abrirForo,
  abrirHilo,
  cerrarHilo,
  cerrarForo,
  nuevoForo,
  borrarForo,
  nuevoHilo,
  guardarHilo,
  responder,
  guardarRespuesta,
  moderar,
  puedeEditar,
  esDeInstructor,
} = useForos(props.cursoId, {
  userId: props.session?.user?.id || null,
  esAdmin: props.perfil?.es_admin === true,
})

// Visible para inscritos, instructores del curso y admin.
const visible = computed(
  () => habilitado && props.session && (props.inscrito || esInstructorCurso.value)
)

onMounted(() => {
  if (habilitado && props.session) init()
})

/* Forms */
const creandoForo = ref(false)
const foroTitulo = ref('')
const foroDescripcion = ref('')

async function onCrearForo() {
  const t = foroTitulo.value.trim()
  if (!t) return
  try {
    await nuevoForo(t, foroDescripcion.value.trim())
    foroTitulo.value = ''
    foroDescripcion.value = ''
    creandoForo.value = false
  } catch {
    /* error queda en `error` */
  }
}

const creandoHilo = ref(false)
const hiloTitulo = ref('')
const hiloCuerpo = ref('')

async function onCrearHilo() {
  const t = hiloTitulo.value.trim()
  const c = hiloCuerpo.value.trim()
  if (!t || !c) return
  try {
    await nuevoHilo(t, c)
    try {
      await emitirEvento({
        verb: 'commented',
        objectType: 'forum',
        objectId: foroActivo.value?.id,
      })
    } catch {
      /* best effort */
    }
    hiloTitulo.value = ''
    hiloCuerpo.value = ''
    creandoHilo.value = false
  } catch {
    /* idem */
  }
}

const editandoHilo = ref(false)
const hiloEditTitulo = ref('')
const hiloEditCuerpo = ref('')

function empezarEdicionHilo() {
  hiloEditTitulo.value = hiloActivo.value?.titulo || ''
  hiloEditCuerpo.value = hiloActivo.value?.cuerpo || ''
  editandoHilo.value = true
}

async function onGuardarHilo() {
  if (!hiloActivo.value) return
  try {
    await guardarHilo(hiloActivo.value.id, hiloEditTitulo.value.trim(), hiloEditCuerpo.value.trim())
    editandoHilo.value = false
  } catch {
    /* idem */
  }
}

const draftRaiz = ref('')

async function onResponderRaiz() {
  const texto = draftRaiz.value.trim()
  if (!texto) return
  try {
    await responder(texto, null)
    draftRaiz.value = ''
  } catch {
    /* idem */
  }
}

async function onResponderAnidada({ padreId, cuerpo }) {
  try {
    await responder(cuerpo, padreId)
  } catch {
    /* idem */
  }
}

async function onEditarRespuesta({ id, cuerpo }) {
  try {
    await guardarRespuesta(id, cuerpo)
  } catch {
    /* idem */
  }
}

async function onModerarRespuesta({ id, accion }) {
  if (
    accion === 'eliminar' &&
    !confirm('¿Eliminar esta respuesta? Quedará registrada en el log de moderación.')
  )
    return
  try {
    await moderar('respuesta', id, accion)
  } catch {
    /* idem */
  }
}

async function onModerarHilo(hilo, accion) {
  if (
    accion === 'eliminar' &&
    !confirm('¿Eliminar este hilo y todas sus respuestas? Quedará registrado en el log.')
  )
    return
  try {
    await moderar('hilo', hilo.id, accion)
    if (accion === 'eliminar' && hiloActivo.value?.id === hilo.id) cerrarHilo()
  } catch {
    /* idem */
  }
}

async function onBorrarForo(foro) {
  if (!confirm(`¿Eliminar el foro "${foro.titulo}" con todos sus hilos?`)) return
  try {
    await borrarForo(foro.id)
  } catch {
    /* idem */
  }
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
  <section v-if="visible" class="foros-panel">
    <div class="foros-head">
      <div>
        <p class="eyebrow">Comunidad del curso</p>
        <h2 class="display foros-titulo">Foros</h2>
      </div>
      <button
        v-if="esInstructorCurso && !foroActivo"
        class="btn btn-ghost btn-sm"
        @click="creandoForo = !creandoForo"
      >
        + Nuevo foro
      </button>
    </div>

    <p v-if="error" class="mono foros-error">⚠ {{ error }}</p>

    <!-- Crear foro (instructor) -->
    <div v-if="creandoForo && esInstructorCurso" class="card foros-form">
      <div class="field">
        <label>Título del foro</label>
        <input
          v-model="foroTitulo"
          type="text"
          placeholder="p. ej. Dudas generales"
          maxlength="120"
        />
      </div>
      <div class="field">
        <label>Descripción (opcional)</label>
        <input v-model="foroDescripcion" type="text" placeholder="¿De qué trata este foro?" />
      </div>
      <div class="foros-acciones">
        <button class="btn btn-primary btn-sm" @click="onCrearForo">Crear foro</button>
        <button class="btn btn-ghost btn-sm" @click="creandoForo = false">Cancelar</button>
      </div>
    </div>

    <!-- ── Vista 1: lista de foros ── -->
    <template v-if="!foroActivo">
      <p v-if="!foros.length && !loading" class="foros-vacio">
        Aún no hay foros en este curso.
        <template v-if="esInstructorCurso"> Crea el primero con "+ Nuevo foro". </template>
      </p>
      <div class="foros-lista">
        <div v-for="f in foros" :key="f.id" class="card foro-card" @click="abrirForo(f)">
          <div class="foro-card-info">
            <h3>{{ f.titulo }}</h3>
            <p v-if="f.descripcion">
              {{ f.descripcion }}
            </p>
          </div>
          <div class="foro-card-side">
            <span class="chip"
              >{{ f.hilos_count }} {{ f.hilos_count === 1 ? 'hilo' : 'hilos' }}</span
            >
            <button
              v-if="esInstructorCurso"
              class="btn btn-ghost btn-sm foros-eliminar"
              @click.stop="onBorrarForo(f)"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Vista 2: hilos del foro ── -->
    <template v-else-if="!hiloActivo">
      <div class="foros-breadcrumb">
        <button class="btn btn-ghost btn-sm" @click="cerrarForo">← Foros</button>
        <h3 class="foros-sub">
          {{ foroActivo.titulo }}
        </h3>
        <button class="btn btn-primary btn-sm" @click="creandoHilo = !creandoHilo">
          + Nuevo hilo
        </button>
      </div>

      <div v-if="creandoHilo" class="card foros-form">
        <div class="field">
          <label>Título</label>
          <input
            v-model="hiloTitulo"
            type="text"
            maxlength="200"
            placeholder="Resume tu duda o tema"
          />
        </div>
        <div class="field">
          <label>Mensaje</label>
          <textarea
            v-model="hiloCuerpo"
            rows="4"
            class="foros-textarea"
            placeholder="Describe tu duda con detalle…"
          />
        </div>
        <div class="foros-acciones">
          <button class="btn btn-primary btn-sm" @click="onCrearHilo">Publicar hilo</button>
          <button class="btn btn-ghost btn-sm" @click="creandoHilo = false">Cancelar</button>
        </div>
      </div>

      <p v-if="!hilos.length && !loading" class="foros-vacio">
        Sin hilos todavía. ¡Abre la conversación!
      </p>
      <div class="foros-lista">
        <div
          v-for="h in hilos"
          :key="h.id"
          class="card foro-hilo-card"
          :class="{ 'is-fijado': h.fijado, 'is-oculto': h.oculto }"
          @click="abrirHilo(h)"
        >
          <div class="foro-card-info">
            <div class="foro-hilo-meta">
              <span v-if="h.fijado" class="chip chip-oro">Fijado</span>
              <span v-if="h.oculto" class="chip">Oculto</span>
              <strong>{{ h.titulo }}</strong>
            </div>
            <p class="foro-hilo-autor mono">
              {{ nombre(h.perfiles) }}
              <span v-if="esDeInstructor(h)" class="foro-badge-instructor">Instructor</span>
              · {{ fmtFecha(h.creado_en) }}
            </p>
          </div>
          <div class="foro-card-side">
            <span class="chip">{{ h.respuestas_count }} resp.</span>
            <template v-if="esInstructorCurso">
              <button
                v-if="!h.fijado"
                class="btn btn-ghost btn-sm"
                @click.stop="onModerarHilo(h, 'fijar')"
              >
                Fijar
              </button>
              <button
                v-else
                class="btn btn-ghost btn-sm"
                @click.stop="onModerarHilo(h, 'quitar_fijado')"
              >
                Soltar
              </button>
              <button
                v-if="!h.oculto"
                class="btn btn-ghost btn-sm"
                @click.stop="onModerarHilo(h, 'ocultar')"
              >
                Ocultar
              </button>
              <button v-else class="btn btn-ghost btn-sm" @click.stop="onModerarHilo(h, 'mostrar')">
                Mostrar
              </button>
              <button
                class="btn btn-ghost btn-sm foros-eliminar"
                @click.stop="onModerarHilo(h, 'eliminar')"
              >
                Eliminar
              </button>
            </template>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Vista 3: hilo abierto ── -->
    <template v-else>
      <div class="foros-breadcrumb">
        <button class="btn btn-ghost btn-sm" @click="cerrarHilo">← {{ foroActivo.titulo }}</button>
      </div>

      <article class="card foro-hilo-abierto" :class="{ 'is-oculto': hiloActivo.oculto }">
        <template v-if="!editandoHilo">
          <div class="foro-hilo-meta">
            <span v-if="hiloActivo.fijado" class="chip chip-oro">Fijado</span>
            <span v-if="hiloActivo.oculto" class="chip">Oculto</span>
            <h3>{{ hiloActivo.titulo }}</h3>
          </div>
          <p class="foro-hilo-autor mono">
            {{ nombre(hiloActivo.perfiles) }}
            <span v-if="esDeInstructor(hiloActivo)" class="foro-badge-instructor">Instructor</span>
            · {{ fmtFecha(hiloActivo.creado_en) }}
          </p>
          <p class="foro-hilo-cuerpo">
            {{ hiloActivo.cuerpo }}
          </p>
          <div class="foros-acciones">
            <button
              v-if="puedeEditar(hiloActivo)"
              class="btn btn-ghost btn-sm"
              @click="empezarEdicionHilo"
            >
              Editar
            </button>
          </div>
        </template>
        <template v-else>
          <div class="field">
            <label>Título</label>
            <input v-model="hiloEditTitulo" type="text" maxlength="200" />
          </div>
          <div class="field">
            <label>Mensaje</label>
            <textarea v-model="hiloEditCuerpo" rows="4" class="foros-textarea" />
          </div>
          <div class="foros-acciones">
            <button class="btn btn-primary btn-sm" @click="onGuardarHilo">Guardar</button>
            <button class="btn btn-ghost btn-sm" @click="editandoHilo = false">Cancelar</button>
          </div>
        </template>
      </article>

      <div class="foro-respuestas">
        <ForoRespuestaItem
          v-for="r in arbolRespuestas"
          :key="r.id"
          :respuesta="r"
          :nivel="0"
          :es-instructor-curso="esInstructorCurso"
          :es-de-instructor="esDeInstructor"
          :puede-editar="puedeEditar"
          @responder="onResponderAnidada"
          @editar="onEditarRespuesta"
          @moderar="onModerarRespuesta"
        />
      </div>

      <div class="card foros-form">
        <div class="field">
          <label>Tu respuesta</label>
          <textarea
            v-model="draftRaiz"
            rows="3"
            class="foros-textarea"
            placeholder="Participa en la conversación…"
          />
        </div>
        <div class="foros-acciones">
          <button class="btn btn-primary btn-sm" @click="onResponderRaiz">
            Publicar respuesta
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.foros-panel {
  max-width: 980px;
  margin: 0 auto;
  padding: calc(var(--unit) * 5) calc(var(--unit) * 3);
}
.foros-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: calc(var(--unit) * 2);
  margin-bottom: calc(var(--unit) * 2.5);
}
.foros-titulo {
  font-size: 28px;
  color: var(--ink);
  margin-top: 4px;
}
.foros-sub {
  font-size: 18px;
  color: var(--ink);
  flex: 1;
}
.foros-error {
  color: var(--primary);
  margin-bottom: calc(var(--unit) * 2);
}
.foros-vacio {
  color: var(--ink-4);
  font-size: 14px;
  padding: calc(var(--unit) * 2) 0;
}
.foros-lista {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.foro-card,
.foro-hilo-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: calc(var(--unit) * 2);
  padding: calc(var(--unit) * 2);
  cursor: pointer;
}
.foro-card:hover,
.foro-hilo-card:hover {
  border-color: var(--ink-3);
}
.foro-hilo-card.is-fijado {
  box-shadow: inset 3px 0 0 var(--brand-accent, #a57f2c);
}
.foro-hilo-card.is-oculto,
.foro-hilo-abierto.is-oculto {
  opacity: 0.6;
}
.foro-card-info h3 {
  font-size: 16px;
  color: var(--ink);
}
.foro-card-info p {
  font-size: 13px;
  color: var(--ink-3);
  margin-top: 2px;
}
.foro-card-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.foro-hilo-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.foro-hilo-meta h3 {
  font-size: 20px;
  color: var(--ink);
}
.foro-hilo-autor {
  font-size: 11px;
  color: var(--ink-4);
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.foro-hilo-cuerpo {
  margin-top: calc(var(--unit) * 1.5);
  font-size: 15px;
  color: var(--ink-2);
  white-space: pre-wrap;
}
.foro-hilo-abierto {
  padding: calc(var(--unit) * 2.5);
  margin-bottom: calc(var(--unit) * 2);
}
.foro-respuestas {
  margin-bottom: calc(var(--unit) * 2);
}
.foros-form {
  padding: calc(var(--unit) * 2);
  margin-bottom: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.foros-acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.foros-eliminar {
  color: var(--primary);
}
.foros-breadcrumb {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 1.5);
  margin-bottom: calc(var(--unit) * 2);
  flex-wrap: wrap;
}
.foros-textarea {
  width: 100%;
  font: inherit;
  font-size: 14px;
  padding: 8px 10px;
  border: 1px solid var(--paper-3, #ddd);
  border-radius: 6px;
  resize: vertical;
}
.foro-badge-instructor {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: var(--brand-accent, #a57f2c);
  color: var(--paper, #fff);
  padding: 1px 6px;
  border-radius: 3px;
}
.chip-oro {
  background: var(--brand-accent-soft, #e6d194);
  color: #8a6e3f;
}
</style>
