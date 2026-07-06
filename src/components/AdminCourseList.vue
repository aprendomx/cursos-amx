<script setup>
import IconSet from '@/components/IconSet.vue'
import PlaceholderImage from '@/components/PlaceholderImage.vue'
import AdminCourseEditor from '@/components/AdminCourseEditor.vue'
import { sbDelete } from '@/lib/sbRest.js'

const props = defineProps({
  cursos: { type: Array, default: () => [] },
  session: { type: Object, default: null },
  editingCurso: { type: Object, default: null },
})

const emit = defineEmits(['create', 'edit', 'deleted', 'published', 'cancel'])

const isUrl = (v) => typeof v === 'string' && /^(https?:|\/)/.test(v)

async function deleteCurso(curso) {
  if (!props.session?.access_token) return
  if ((curso.inscritos || 0) > 0) {
    alert(`No se puede borrar: este curso tiene ${curso.inscritos} inscrito(s).`)
    return
  }
  if (
    !confirm(
      `\u00bfBorrar el curso "${curso.titulo}"?\n\nEsto elimina tambi\u00e9n sus m\u00f3dulos y lecciones. La acci\u00f3n no se puede deshacer.`
    )
  ) {
    return
  }
  try {
    await sbDelete(`cursos?id=eq.${curso.id}`, props.session.access_token)
    emit('deleted', curso)
  } catch (err) {
    console.error('Error deleting curso:', err)
    alert('Error al borrar: ' + (err?.message || 'desconocido'))
  }
}
</script>

<template>
  <AdminCourseEditor
    v-if="editingCurso"
    :session="session"
    :initial-curso="editingCurso"
    @published="emit('published')"
    @cancel="emit('cancel')"
  />
  <div v-else class="admin-content fade-in">
    <div class="admin-content-header">
      <div>
        <p class="eyebrow">Cat&aacute;logo</p>
        <h1 class="display" :style="{ fontSize: '32px', color: 'var(--ink)', marginTop: '4px' }">
          Cursos
        </h1>
      </div>
      <button class="btn btn-primary btn-sm" @click="emit('create')">
        + Nuevo curso
        <IconSet name="arrow" />
      </button>
    </div>
    <div class="card" :style="{ overflow: 'auto' }">
      <table class="admin-table admin-table-full">
        <thead>
          <tr>
            <th class="mono" />
            <th class="mono">Curso</th>
            <th class="mono">Nivel</th>
            <th class="mono">Inscritos</th>
            <th class="mono">Estructura</th>
            <th class="mono" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in cursos" :key="c.id">
            <td :style="{ width: '56px' }">
              <img
                v-if="isUrl(c.imagen)"
                :src="c.imagen"
                :alt="c.titulo || 'Portada'"
                :style="{
                  width: '48px',
                  height: '36px',
                  borderRadius: '2px',
                  objectFit: 'cover',
                  display: 'block',
                }"
              />
              <PlaceholderImage
                v-else
                :label="c.imagen"
                :style="{ width: '48px', height: '36px', borderRadius: '2px' }"
              />
            </td>
            <td>
              <div :style="{ display: 'flex', flexDirection: 'column', gap: '2px' }">
                <span :style="{ fontWeight: '500' }">{{ c.titulo }}</span>
                <span class="mono" :style="{ color: 'var(--ink-4)' }"> /{{ c.slug }} </span>
              </div>
            </td>
            <td>
              <span class="chip">{{ c.nivel }}</span>
            </td>
            <td>{{ c.inscritos.toLocaleString() }}</td>
            <td class="mono" :style="{ color: 'var(--ink-3)' }">
              {{ c.modulos }} m&oacute;d &middot; {{ c.lecciones }} lec
            </td>
            <td :style="{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }">
              <button class="btn btn-ghost btn-sm" @click="emit('edit', c)">Editar</button>
              <button
                class="btn btn-ghost btn-sm btn-danger"
                :disabled="(c.inscritos || 0) > 0"
                :title="(c.inscritos || 0) > 0 ? `Tiene ${c.inscritos} inscritos` : 'Borrar curso'"
                @click="deleteCurso(c)"
              >
                Borrar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
