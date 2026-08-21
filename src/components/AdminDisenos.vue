<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  listarDisenos,
  guardarDiseno,
  subirAssetDiseno,
  urlAsset,
} from '@/services/constanciaDisenos.js'

const disenos = ref([])
const cargando = ref(true)
const guardando = ref(false)
const subiendo = ref('')
const error = ref('')
const aviso = ref('')
const editando = ref(null)

// Los tres assets que puede llevar un diseño. Se declaran una vez para que el
// formulario y la previsualización no puedan desincronizarse.
const ASSETS = [
  {
    campo: 'fondo_path',
    etiqueta: 'Fondo',
    ayuda: 'Ocupa la hoja completa. Idealmente A4 apaisado.',
  },
  { campo: 'pleca_path', etiqueta: 'Pleca', ayuda: 'Banda decorativa; se repite arriba y abajo.' },
  {
    campo: 'logo_path',
    etiqueta: 'Logotipo',
    ayuda: 'Va sobre el encabezado. PNG con transparencia.',
  },
]

function nuevo() {
  editando.value = {
    clave: '',
    nombre: '',
    descripcion: '',
    fondo_path: null,
    pleca_path: null,
    logo_path: null,
    color_primario: '',
    color_texto: '',
    activo: true,
  }
}

// La clave es el identificador estable del diseño: se deriva del nombre para
// no pedir dos cosas, pero deja de seguirlo en cuanto el diseño ya existe,
// porque cambiarla rompería los cursos que la referencian.
const claveAuto = computed(() =>
  (editando.value?.nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
)

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    disenos.value = await listarDisenos()
  } catch (e) {
    error.value = e?.message || 'No se pudieron cargar los diseños.'
  } finally {
    cargando.value = false
  }
}

async function onAsset(campo, evento) {
  const archivo = evento.target.files?.[0]
  if (!archivo || !editando.value) return
  subiendo.value = campo
  error.value = ''
  try {
    editando.value[campo] = await subirAssetDiseno(archivo)
    aviso.value = 'Imagen cargada. Recuerda guardar.'
  } catch (e) {
    error.value = e?.message || 'No se pudo subir la imagen.'
  } finally {
    subiendo.value = ''
  }
}

function quitarAsset(campo) {
  if (editando.value) editando.value[campo] = null
}

async function guardar() {
  const d = editando.value
  if (!d?.nombre?.trim()) {
    error.value = 'El nombre es obligatorio.'
    return
  }
  if (!d.clave?.trim()) d.clave = claveAuto.value
  if (!d.clave) {
    error.value = 'No se pudo derivar una clave del nombre. Escríbela a mano.'
    return
  }
  guardando.value = true
  error.value = ''
  try {
    await guardarDiseno(d)
    editando.value = null
    aviso.value = 'Diseño guardado.'
    await cargar()
  } catch (e) {
    error.value = /duplicate|unique/i.test(e?.message || '')
      ? `Ya existe un diseño con la clave «${d.clave}».`
      : e?.message || 'No se pudo guardar.'
  } finally {
    guardando.value = false
  }
}

async function alternarActivo(d) {
  error.value = ''
  try {
    await guardarDiseno({ ...d, activo: !d.activo })
    await cargar()
  } catch (e) {
    error.value = e?.message || 'No se pudo cambiar el estado.'
  }
}

onMounted(cargar)
</script>

<template>
  <section class="adm-dis">
    <header>
      <h2>Diseños de constancia</h2>
      <p class="adm-dis-intro">
        Un diseño define <strong>cómo se ve</strong> la constancia: fondo, pleca, logotipo y
        colores. Los textos no van aquí — se configuran por curso, en el paso «Constancia» del
        editor. Desactivar un diseño lo retira del desplegable, pero
        <strong>no altera las constancias ya emitidas</strong>: cada una guarda su copia.
      </p>
    </header>

    <p v-if="error" class="adm-dis-error" role="alert">
      {{ error }}
    </p>
    <p v-if="aviso" class="adm-dis-aviso" role="status">
      {{ aviso }}
    </p>

    <button v-if="!editando" class="btn btn-primary btn-sm" type="button" @click="nuevo">
      Nuevo diseño
    </button>

    <div v-if="editando" class="adm-dis-editor">
      <div class="adm-dis-form">
        <label for="d-nombre">Nombre</label>
        <input id="d-nombre" v-model="editando.nombre" type="text" autocomplete="off" />

        <label for="d-clave">Clave</label>
        <input
          id="d-clave"
          v-model="editando.clave"
          type="text"
          autocomplete="off"
          :placeholder="claveAuto"
        />
        <p class="adm-dis-hint">
          Identificador estable. Si lo dejas vacío se deriva del nombre. Evita cambiarlo después:
          los cursos lo referencian.
        </p>

        <label for="d-desc">Descripción</label>
        <input id="d-desc" v-model="editando.descripcion" type="text" autocomplete="off" />

        <div v-for="a in ASSETS" :key="a.campo" class="adm-dis-asset">
          <label :for="`d-${a.campo}`">{{ a.etiqueta }}</label>
          <input
            :id="`d-${a.campo}`"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            :disabled="subiendo === a.campo"
            @change="(e) => onAsset(a.campo, e)"
          />
          <p class="adm-dis-hint">
            {{ a.ayuda }}
          </p>
          <div v-if="editando[a.campo]" class="adm-dis-asset-preview">
            <img :src="urlAsset(editando[a.campo])" :alt="`Vista previa de ${a.etiqueta}`" />
            <button class="btn btn-ghost btn-sm" type="button" @click="quitarAsset(a.campo)">
              Quitar
            </button>
          </div>
        </div>

        <label for="d-color1">Color primario</label>
        <input id="d-color1" v-model="editando.color_primario" type="text" placeholder="#1e40af" />

        <label for="d-color2">Color del texto</label>
        <input id="d-color2" v-model="editando.color_texto" type="text" placeholder="#161a1d" />

        <div class="adm-dis-acciones">
          <button class="btn btn-ghost btn-sm" type="button" @click="editando = null">
            Cancelar
          </button>
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="guardando"
            @click="guardar"
          >
            {{ guardando ? 'Guardando…' : 'Guardar diseño' }}
          </button>
        </div>
      </div>

      <!-- Previsualización. Un diseño se juzga viéndolo: sin esto habría que
           guardar, emitir una constancia y abrirla para saber si el fondo
           quedó bien. -->
      <figure class="adm-dis-preview">
        <figcaption>Vista previa</figcaption>
        <div
          class="adm-dis-hoja"
          :style="{
            backgroundImage: editando.fondo_path ? `url(${urlAsset(editando.fondo_path)})` : 'none',
            color: editando.color_texto || 'var(--ink)',
          }"
        >
          <img
            v-if="editando.pleca_path"
            :src="urlAsset(editando.pleca_path)"
            alt=""
            class="adm-dis-hoja-pleca"
          />
          <img
            v-if="editando.logo_path"
            :src="urlAsset(editando.logo_path)"
            alt=""
            class="adm-dis-hoja-logo"
          />
          <p class="adm-dis-hoja-pre">Otorga el presente</p>
          <p class="adm-dis-hoja-titulo" :style="{ color: editando.color_primario || 'inherit' }">
            CONSTANCIA
          </p>
          <p class="adm-dis-hoja-nombre">Ana Alumna Ejemplo</p>
          <img
            v-if="editando.pleca_path"
            :src="urlAsset(editando.pleca_path)"
            alt=""
            class="adm-dis-hoja-pleca es-pie"
          />
        </div>
      </figure>
    </div>

    <p v-if="cargando">Cargando…</p>
    <ul v-else-if="disenos.length" class="adm-dis-lista">
      <li v-for="d in disenos" :key="d.id" :class="{ 'es-inactivo': !d.activo }">
        <div
          class="adm-dis-mini"
          :style="{
            backgroundImage: d.fondo_path ? `url(${urlAsset(d.fondo_path)})` : 'none',
          }"
        />
        <div class="adm-dis-datos">
          <strong>{{ d.nombre }}</strong>
          <code>{{ d.clave }}</code>
          <span v-if="d.descripcion" class="adm-dis-desc">{{ d.descripcion }}</span>
          <span v-if="!d.activo" class="adm-dis-badge">inactivo</span>
        </div>
        <div class="adm-dis-fila-acciones">
          <button class="btn btn-ghost btn-sm" type="button" @click="editando = { ...d }">
            Editar
          </button>
          <button class="btn btn-ghost btn-sm" type="button" @click="alternarActivo(d)">
            {{ d.activo ? 'Desactivar' : 'Activar' }}
          </button>
        </div>
      </li>
    </ul>
    <p v-else>No hay diseños. Crea uno para poder asignarlo a los cursos.</p>
  </section>
</template>

<style scoped>
.adm-dis-intro {
  color: var(--muted, #555);
  max-width: 66ch;
  margin-bottom: 1rem;
}
.adm-dis-hint {
  color: var(--muted, #666);
  font-size: 0.85em;
  margin: 0 0 0.35rem;
}
.adm-dis-editor {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  margin: 1rem 0;
}
.adm-dis-form {
  flex: 1 1 22rem;
  min-width: 18rem;
  border: 1px solid var(--border, #ddd);
  border-radius: 0.5rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.adm-dis-form label {
  margin-top: 0.6rem;
  font-weight: 500;
}
.adm-dis-asset {
  margin-top: 0.5rem;
}
.adm-dis-asset-preview {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.35rem 0;
}
.adm-dis-asset-preview img {
  max-height: 3rem;
  max-width: 10rem;
  object-fit: contain;
  background: #fff;
}
.adm-dis-acciones {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

.adm-dis-preview {
  flex: 1 1 20rem;
  min-width: 16rem;
  margin: 0;
}
.adm-dis-preview figcaption {
  font-size: 0.85em;
  color: var(--muted, #666);
  margin-bottom: 0.35rem;
}
.adm-dis-hoja {
  aspect-ratio: 1.414;
  background-size: cover;
  background-position: center;
  background-color: #fff;
  border: 1px solid var(--border, #ddd);
  border-radius: 0.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 1rem;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.adm-dis-hoja-pleca {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}
.adm-dis-hoja-pleca.es-pie {
  top: auto;
  bottom: 0;
}
.adm-dis-hoja-logo {
  max-height: 2.2rem;
  margin-bottom: 0.3rem;
}
.adm-dis-hoja-pre {
  font-size: 0.75rem;
  font-style: italic;
}
.adm-dis-hoja-titulo {
  font-size: 1.5rem;
  letter-spacing: 0.1em;
}
.adm-dis-hoja-nombre {
  font-size: 1rem;
  font-weight: 600;
}

.adm-dis-lista {
  list-style: none;
  padding: 0;
  margin-top: 1rem;
}
.adm-dis-lista li {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border-soft, #eee);
}
.adm-dis-lista li.es-inactivo {
  opacity: 0.55;
}
.adm-dis-mini {
  width: 4.5rem;
  aspect-ratio: 1.414;
  background-size: cover;
  background-position: center;
  background-color: var(--paper-3, #f3f3f3);
  border: 1px solid var(--border, #ddd);
  border-radius: 0.2rem;
  flex: none;
}
.adm-dis-datos {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
}
.adm-dis-datos code {
  font-size: 0.8em;
  color: var(--muted, #666);
}
.adm-dis-desc {
  font-size: 0.85em;
  color: var(--muted, #666);
}
.adm-dis-badge {
  align-self: flex-start;
  font-size: 0.72em;
  border: 1px solid currentColor;
  border-radius: var(--radius-full);
  padding: 0 0.5em;
  color: var(--warn, var(--brand-accent));
}
.adm-dis-fila-acciones {
  display: flex;
  gap: 0.35rem;
}
.adm-dis-error {
  color: var(--danger);
}
.adm-dis-aviso {
  color: var(--brand-secondary, var(--brand-secondary));
}
</style>
