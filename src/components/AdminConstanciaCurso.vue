<script setup>
import { ref, computed, watch } from 'vue'
import {
  listarDisenos,
  listarFuncionarios,
  configDeCurso,
  overridesDeCurso,
  guardarConfigCurso,
  firmantesDeCurso,
  guardarFirmantesDeCurso,
  urlFirma,
} from '@/services/constanciaDisenos.js'
import { aplicarMarcadores, marcadoresDesconocidos, MARCADORES } from '@/lib/constanciaTextos.js'

const props = defineProps({
  cursoId: { type: String, required: true },
  cursoTitulo: { type: String, default: '' },
  cursoDuracion: { type: String, default: '' },
})

const disenos = ref([])
const funcionarios = ref([])
const efectiva = ref(null)
const overrides = ref({
  diseno_id: null,
  lugar: '',
  texto_pre: '',
  texto_titulo: '',
  texto_cuerpo: '',
})
const seleccionados = ref([])
const cargando = ref(true)
const guardando = ref(false)
const error = ref('')
const aviso = ref('')

// Un campo vacío hereda del default de la instalación. Se muestra el valor
// heredado como placeholder para que el administrador vea qué saldría si no
// escribe nada, en vez de tener que adivinarlo.
const heredado = computed(() => ({
  lugar: efectiva.value?.lugar || '',
  texto_pre: efectiva.value?.texto_pre || '',
  texto_titulo: efectiva.value?.texto_titulo || '',
  texto_cuerpo: efectiva.value?.texto_cuerpo || '',
}))

const vistaPrevia = computed(() => {
  const valores = {
    nombre: 'Ana Alumna Ejemplo',
    curso: props.cursoTitulo || 'Nombre del curso',
    duracion: props.cursoDuracion || '4 horas',
    fecha: '30 de abril de 2026',
    folio: 'CON-2026-A3F1-9B2C-7D04',
  }
  const t = (campo) => overrides.value[campo]?.trim() || heredado.value[campo]
  return {
    pre: aplicarMarcadores(t('texto_pre'), valores),
    titulo: aplicarMarcadores(t('texto_titulo'), valores),
    cuerpo: aplicarMarcadores(t('texto_cuerpo'), valores),
  }
})

// La etiqueta se arma aquí: un literal con llaves anidadas dentro de la
// plantilla rompe el parser de Vue.
function etiqueta(m) {
  return `{{${m.clave}}}`
}

const avisosMarcadores = computed(() => {
  const malos = new Set()
  for (const c of ['texto_pre', 'texto_titulo', 'texto_cuerpo']) {
    marcadoresDesconocidos(overrides.value[c] || '').forEach((m) => malos.add(m))
  }
  return [...malos]
})

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const [d, f, cfg, ov, firm] = await Promise.all([
      listarDisenos({ soloActivos: true }),
      listarFuncionarios({ soloActivos: true }),
      configDeCurso(props.cursoId),
      overridesDeCurso(props.cursoId),
      firmantesDeCurso(props.cursoId),
    ])
    disenos.value = d
    funcionarios.value = f
    efectiva.value = cfg
    overrides.value = {
      diseno_id: ov?.diseno_id || null,
      lugar: ov?.lugar || '',
      texto_pre: ov?.texto_pre || '',
      texto_titulo: ov?.texto_titulo || '',
      texto_cuerpo: ov?.texto_cuerpo || '',
    }
    seleccionados.value = firm.map((x) => x.funcionario_id)
  } catch (e) {
    error.value = e?.message || 'No se pudo cargar la configuración.'
  } finally {
    cargando.value = false
  }
}

function alternarFirmante(id) {
  const i = seleccionados.value.indexOf(id)
  if (i >= 0) seleccionados.value.splice(i, 1)
  else seleccionados.value.push(id)
}

function mover(i, delta) {
  const j = i + delta
  if (j < 0 || j >= seleccionados.value.length) return
  const copia = [...seleccionados.value]
  ;[copia[i], copia[j]] = [copia[j], copia[i]]
  seleccionados.value = copia
}

function nombreDe(id) {
  const f = funcionarios.value.find((x) => x.id === id)
  return f ? `${f.nombre} — ${f.cargo}` : id
}

async function guardar() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    await guardarConfigCurso(props.cursoId, overrides.value)
    await guardarFirmantesDeCurso(props.cursoId, seleccionados.value)
    aviso.value = 'Guardado. Aplica a las constancias que se emitan a partir de ahora.'
    await cargar()
  } catch (e) {
    error.value = e?.message || 'No se pudo guardar.'
  } finally {
    guardando.value = false
  }
}

watch(() => props.cursoId, cargar, { immediate: true })
</script>

<template>
  <section class="cc">
    <h3>Constancia de este curso</h3>
    <p class="cc-intro">
      Los campos que dejes vacíos heredan la configuración general de la instalación —el valor
      heredado se muestra en gris—. Lo que guardes aquí aplica a las constancias que se emitan
      <strong>a partir de ahora</strong>: las ya expedidas conservan lo que se firmó.
    </p>

    <p v-if="error" class="cc-error" role="alert">
      {{ error }}
    </p>
    <p v-if="aviso" class="cc-aviso" role="status">
      {{ aviso }}
    </p>
    <p v-if="cargando">Cargando…</p>

    <template v-else>
      <label for="cc-diseno">Diseño</label>
      <select id="cc-diseno" v-model="overrides.diseno_id">
        <option :value="null">Heredar el general</option>
        <option v-for="d in disenos" :key="d.id" :value="d.id">
          {{ d.nombre }}
        </option>
      </select>

      <label for="cc-lugar">Lugar</label>
      <input id="cc-lugar" v-model="overrides.lugar" type="text" :placeholder="heredado.lugar" />

      <label for="cc-pre">Texto superior</label>
      <input
        id="cc-pre"
        v-model="overrides.texto_pre"
        type="text"
        :placeholder="heredado.texto_pre"
      />

      <label for="cc-titulo">Título</label>
      <input
        id="cc-titulo"
        v-model="overrides.texto_titulo"
        type="text"
        :placeholder="heredado.texto_titulo"
      />

      <label for="cc-cuerpo">Cuerpo</label>
      <textarea
        id="cc-cuerpo"
        v-model="overrides.texto_cuerpo"
        rows="3"
        :placeholder="heredado.texto_cuerpo"
      />

      <p class="cc-marcadores">
        Marcadores disponibles:
        <code v-for="m in MARCADORES" :key="m.clave" :title="m.descripcion">{{ etiqueta(m) }}</code>
      </p>
      <p v-if="avisosMarcadores.length" class="cc-error">
        Marcador desconocido: {{ avisosMarcadores.join(', ') }}. Saldrá impreso tal cual.
      </p>

      <div class="cc-preview">
        <p class="cc-preview-pre">
          {{ vistaPrevia.pre }}
        </p>
        <p class="cc-preview-titulo">
          {{ vistaPrevia.titulo }}
        </p>
        <p class="cc-preview-cuerpo">
          {{ vistaPrevia.cuerpo }}
        </p>
      </div>

      <h4>Firmantes</h4>
      <p v-if="!funcionarios.length" class="cc-hint">
        No hay funcionarios dados de alta. Agrégalos en Administración → Funcionarios.
      </p>
      <ul v-else class="cc-lista">
        <li v-for="f in funcionarios" :key="f.id">
          <label>
            <input
              type="checkbox"
              :checked="seleccionados.includes(f.id)"
              @change="alternarFirmante(f.id)"
            />
            {{ f.nombre }} — {{ f.cargo }}
          </label>
          <img v-if="f.firma_path" :src="urlFirma(f.firma_path)" alt="" class="cc-firma-mini" />
        </li>
      </ul>

      <template v-if="seleccionados.length">
        <p class="cc-hint">Orden en que aparecen, de izquierda a derecha:</p>
        <ol class="cc-orden">
          <li v-for="(id, i) in seleccionados" :key="id">
            <span>{{ nombreDe(id) }}</span>
            <button
              class="btn btn-ghost btn-sm"
              type="button"
              :disabled="i === 0"
              @click="mover(i, -1)"
            >
              ↑
            </button>
            <button
              class="btn btn-ghost btn-sm"
              type="button"
              :disabled="i === seleccionados.length - 1"
              @click="mover(i, 1)"
            >
              ↓
            </button>
          </li>
        </ol>
      </template>

      <button
        class="btn btn-primary btn-sm cc-guardar"
        type="button"
        :disabled="guardando"
        @click="guardar"
      >
        {{ guardando ? 'Guardando…' : 'Guardar configuración' }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.cc {
  max-width: 44rem;
}
.cc-intro,
.cc-hint {
  color: var(--muted, #555);
  max-width: 62ch;
}
.cc label {
  display: block;
  margin-top: 0.85rem;
  font-weight: 500;
}
.cc input[type='text'],
.cc select,
.cc textarea {
  width: 100%;
  max-width: 34rem;
}
.cc-marcadores {
  margin-top: 0.5rem;
  font-size: 0.85em;
  color: var(--muted, #666);
}
.cc-marcadores code {
  margin-right: 0.4rem;
}
.cc-preview {
  border: 1px dashed var(--border, #ccc);
  border-radius: 0.4rem;
  padding: 1rem;
  margin: 1rem 0;
  text-align: center;
  background: var(--paper-2, #fafafa);
}
.cc-preview-titulo {
  font-size: 1.6em;
  letter-spacing: 0.08em;
  margin: 0.35rem 0;
}
.cc-lista {
  list-style: none;
  padding: 0;
}
.cc-lista li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.3rem 0;
}
.cc-orden {
  padding-left: 1.25rem;
}
.cc-orden li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0;
}
.cc-firma-mini {
  max-height: 1.6rem;
  background: #fff;
}
.cc-guardar {
  margin-top: 1.25rem;
}
.cc-error {
  color: var(--danger);
}
.cc-aviso {
  color: var(--brand-secondary, var(--brand-secondary));
}
</style>
