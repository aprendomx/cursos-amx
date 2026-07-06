<script setup>
import { ref, watch, onMounted } from 'vue'
import { supabase } from '@/lib/supabase.js'
import {
  fetchPerfilesInstructores,
  buscarPerfiles,
  setEsInstructor,
  fetchAsignacionesInstructor,
  asignarInstructorACurso,
  desasignarInstructorDeCurso,
} from '@/services/instructores.js'

const instructores = ref([])
const instCursosCat = ref([])
const instBusqueda = ref('')
const instResultados = ref([])
const instSel = ref(null)
const instAsignaciones = ref([])
const instCursoSel = ref('')
const instMsg = ref('')
const instLoading = ref(false)

async function loadInstructoresSection() {
  instLoading.value = true
  instMsg.value = ''
  try {
    instructores.value = await fetchPerfilesInstructores()
    const { data } = await supabase.from('cursos').select('id, titulo').order('titulo')
    instCursosCat.value = data || []
  } catch (e) {
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
  } finally {
    instLoading.value = false
  }
}

let instBuscarTimer = null
watch(instBusqueda, (q) => {
  clearTimeout(instBuscarTimer)
  if (!q || q.length < 2) {
    instResultados.value = []
    return
  }
  instBuscarTimer = setTimeout(async () => {
    try {
      instResultados.value = await buscarPerfiles(q)
    } catch {
      instResultados.value = []
    }
  }, 250)
})

async function toggleEsInstructor(p, valor) {
  instMsg.value = ''
  try {
    await setEsInstructor(p.id, valor)
    instBusqueda.value = ''
    instResultados.value = []
    if (instSel.value?.id === p.id && !valor) {
      instSel.value = null
      instAsignaciones.value = []
    }
    await loadInstructoresSection()
  } catch (e) {
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
  }
}

async function selInstructor(p) {
  instSel.value = p
  instCursoSel.value = ''
  try {
    instAsignaciones.value = await fetchAsignacionesInstructor(p.id)
  } catch (e) {
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
  }
}

async function asignarCursoSel() {
  if (!instSel.value || !instCursoSel.value) return
  instMsg.value = ''
  try {
    await asignarInstructorACurso(instCursoSel.value, instSel.value.id)
    instAsignaciones.value = await fetchAsignacionesInstructor(instSel.value.id)
    instCursoSel.value = ''
  } catch (e) {
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
  }
}

async function quitarCursoSel(cursoId) {
  if (!instSel.value) return
  instMsg.value = ''
  try {
    await desasignarInstructorDeCurso(cursoId, instSel.value.id)
    instAsignaciones.value = await fetchAsignacionesInstructor(instSel.value.id)
  } catch (e) {
    instMsg.value = '\u26a0 ' + (e?.message || String(e))
  }
}

onMounted(loadInstructoresSection)
</script>

<template>
  <div class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">
          Gesti&oacute;n
        </p>
        <h1
          class="display"
          :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }"
        >
          Instructores
        </h1>
      </div>
    </div>
    <p
      v-if="instMsg"
      class="mono"
      :style="{ color: 'var(--primary)', marginBottom: 'calc(var(--unit) * 2)' }"
    >
      {{ instMsg }}
    </p>
    <div
      class="field"
      :style="{ maxWidth: '420px', marginBottom: 'calc(var(--unit) * 2)' }"
    >
      <label>Agregar instructor (buscar por nombre o correo)</label>
      <input
        v-model="instBusqueda"
        type="text"
        placeholder="M\u00ednimo 2 caracteres..."
      >
    </div>
    <div
      v-if="instResultados.length"
      class="card"
      :style="{
        maxWidth: '560px',
        marginBottom: 'calc(var(--unit) * 3)',
        padding: 'calc(var(--unit) * 1.5)',
      }"
    >
      <table class="admin-table admin-table-full">
        <tbody>
          <tr
            v-for="p in instResultados"
            :key="p.id"
          >
            <td :style="{ fontWeight: '500' }">
              {{ p.nombres }} {{ p.apellido_paterno }}
            </td>
            <td
              class="mono"
              :style="{ color: 'var(--ink-3)' }"
            >
              {{ p.correo }}
            </td>
            <td>
              <button
                v-if="!p.es_instructor"
                class="btn btn-primary btn-sm"
                @click="toggleEsInstructor(p, true)"
              >
                Hacer instructor
              </button>
              <span
                v-else
                class="chip"
              >Ya es instructor</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      :style="{
        display: 'grid',
        gridTemplateColumns: instSel ? '1fr 1fr' : '1fr',
        gap: 'calc(var(--unit) * 2)',
        alignItems: 'start',
      }"
    >
      <div
        class="card"
        :style="{ overflow: 'auto' }"
      >
        <table class="admin-table admin-table-full">
          <thead>
            <tr>
              <th class="mono">
                Nombre
              </th>
              <th class="mono">
                Correo
              </th>
              <th class="mono" />
              <th class="mono" />
            </tr>
          </thead>
          <tbody>
            <tr v-if="!instructores.length && !instLoading">
              <td
                colspan="4"
                :style="{ color: 'var(--ink-4)' }"
              >
                Sin instructores. Busca un perfil arriba para dar de alta.
              </td>
            </tr>
            <tr
              v-for="p in instructores"
              :key="p.id"
              :class="{ 'is-selected': instSel?.id === p.id }"
            >
              <td :style="{ fontWeight: '500' }">
                {{ p.nombres }} {{ p.apellido_paterno }}
              </td>
              <td
                class="mono"
                :style="{ color: 'var(--ink-3)' }"
              >
                {{ p.correo }}
              </td>
              <td>
                <button
                  class="btn btn-ghost btn-sm"
                  @click="selInstructor(p)"
                >
                  Cursos
                </button>
              </td>
              <td>
                <button
                  class="btn btn-ghost btn-sm"
                  :style="{ color: 'var(--primary)' }"
                  @click="
                    () =>
                      confirm('\u00bfQuitar rol de instructor a ' + p.nombres + '?') &&
                      toggleEsInstructor(p, false)
                  "
                >
                  Quitar rol
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        v-if="instSel"
        class="card"
        :style="{ padding: 'calc(var(--unit) * 2)' }"
      >
        <p class="eyebrow">
          Cursos de {{ instSel.nombres }} {{ instSel.apellido_paterno }}
        </p>
        <ul
          :style="{
            listStyle: 'none',
            padding: '0',
            margin: 'calc(var(--unit) * 1.5) 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }"
        >
          <li
            v-if="!instAsignaciones.length"
            :style="{ color: 'var(--ink-4)', fontSize: '14px' }"
          >
            Sin cursos asignados.
          </li>
          <li
            v-for="a in instAsignaciones"
            :key="a.curso_id"
            :style="{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }"
          >
            <span>{{ a.cursos?.titulo || a.curso_id }}</span>
            <button
              class="btn btn-ghost btn-sm"
              @click="quitarCursoSel(a.curso_id)"
            >
              Quitar
            </button>
          </li>
        </ul>
        <div class="field">
          <label>Asignar curso</label>
          <div :style="{ display: 'flex', gap: '8px' }">
            <select
              v-model="instCursoSel"
              :style="{ flex: '1' }"
            >
              <option
                value=""
                disabled
              >
                Selecciona un curso…
              </option>
              <option
                v-for="c in instCursosCat.filter(
                  (c) => !instAsignaciones.some((a) => a.curso_id === c.id)
                )"
                :key="c.id"
                :value="c.id"
              >
                {{ c.titulo }}
              </option>
            </select>
            <button
              class="btn btn-primary btn-sm"
              :disabled="!instCursoSel"
              @click="asignarCursoSel"
            >
              Asignar
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
