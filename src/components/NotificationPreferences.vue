<script setup>
import { computed } from 'vue'
import { useNotificaciones } from '@/composables/useNotificaciones'

const { preferencias, guardarPrefs } = useNotificaciones()

const TIPOS = [
  { key: 'curso_asignado', label: 'Curso asignado' },
  { key: 'evaluacion_calificada', label: 'Evaluación calificada' },
  { key: 'badge_desbloqueado', label: 'Insignia desbloqueada' },
  { key: 'foro_respuesta', label: 'Respuesta en foro' },
  { key: 'certificacion_lista', label: 'Certificación lista' },
  { key: 'deadline_proximo', label: 'Deadline próximo' },
  { key: 'anuncio_instructor', label: 'Anuncio del instructor' },
]

const CANALES = [
  { key: 'all', label: 'Todos' },
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
  { key: 'app', label: 'Solo app' },
]

const canalDefault = computed(() => preferencias.value?.canal_default || 'all')

const silenciados = computed(() =>
  Array.isArray(preferencias.value?.silenciados) ? preferencias.value.silenciados : []
)

function isSilenciado(key) {
  return silenciados.value.includes(key)
}

function toggleSilenciado(key) {
  const next = isSilenciado(key)
    ? silenciados.value.filter((k) => k !== key)
    : [...silenciados.value, key]
  guardarPrefs({ silenciados: next })
}

function setCanal(key) {
  guardarPrefs({ canal_default: key })
}
</script>

<template>
  <div class="nprefs">
    <section class="nprefs-section">
      <h3 class="nprefs-section-title">Canal por defecto</h3>
      <div class="nprefs-canales">
        <button
          v-for="c in CANALES"
          :key="c.key"
          class="nprefs-canal-btn"
          :class="{ active: canalDefault === c.key }"
          :data-test="`canal-${c.key}`"
          @click="setCanal(c.key)"
        >
          {{ c.label }}
        </button>
      </div>
    </section>

    <section class="nprefs-section">
      <h3 class="nprefs-section-title">Silenciar tipos</h3>
      <ul class="nprefs-list">
        <li v-for="t in TIPOS" :key="t.key" class="nprefs-item">
          <label class="nprefs-label">
            <input
              type="checkbox"
              class="nprefs-checkbox"
              :checked="isSilenciado(t.key)"
              :data-test="`silenciar-${t.key}`"
              @change="toggleSilenciado(t.key)"
            />
            <span class="nprefs-label-text">{{ t.label }}</span>
          </label>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.nprefs {
  padding: calc(var(--unit) * 2);
}
.nprefs-section {
  margin-bottom: calc(var(--unit) * 3);
}
.nprefs-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  margin: 0 0 calc(var(--unit) * 1.5) 0;
}
.nprefs-canales {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.nprefs-canal-btn {
  font-size: 13px;
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
  transition:
    background 160ms var(--ease),
    border-color 160ms var(--ease);
}
.nprefs-canal-btn:hover {
  background: var(--paper-2);
}
.nprefs-canal-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.nprefs-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.nprefs-item {
  padding: calc(var(--unit) * 1) 0;
  border-bottom: 1px solid var(--line);
}
.nprefs-item:last-child {
  border-bottom: none;
}
.nprefs-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--ink);
}
.nprefs-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--primary);
}
.nprefs-label-text {
  user-select: none;
}
</style>
