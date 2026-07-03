<!-- src/components/LandingCursoBloque.vue -->
<script setup>
import IconSet from '@/components/IconSet.vue'
import PlaceholderImage from '@/components/PlaceholderImage.vue'

const props = defineProps({
  curso: { type: Object, required: true },
  index: { type: Number, default: 0 },
})

const emit = defineEmits(['ver-curso', 'ver-modulo'])

function statusChip() {
  if (props.curso.progreso === 1) return { label: 'Completado', cls: 'chip chip-verde' }
  if (props.curso.progreso > 0)
    return { label: Math.round(props.curso.progreso * 100) + '%', cls: 'chip chip-primary' }
  return { label: 'Nuevo', cls: 'chip chip-dorado' }
}

function btnLabel() {
  if (props.curso.progreso === 1) return 'Revisar'
  if (props.curso.progreso > 0) return 'Continuar'
  return 'Comenzar'
}

// Una "imagen real" es algo subido al bucket (URL absoluta) o un asset
// relativo (/img/...). Cualquier otra cosa (un slug, una palabra) cae al
// PlaceholderImage que renderiza un patrón de stripes con label.
function isUrl(v) {
  if (!v || typeof v !== 'string') return false
  return /^(https?:|\/)/.test(v)
}
</script>

<template>
  <article class="curso-bloque">
    <!-- Header vertical: imagen full-width + meta -->
    <div class="curso-cover" @click="emit('ver-curso', curso)">
      <img
        v-if="isUrl(curso.imagen)"
        :src="curso.imagen"
        :alt="curso.titulo"
        class="curso-cover-img"
        loading="lazy"
      />
      <PlaceholderImage v-else :label="curso.imagen || curso.titulo" />
    </div>

    <div class="curso-body">
      <div class="curso-top">
        <span class="mono curso-meta">
          {{ String(index + 1).padStart(2, '0') }} &middot; {{ curso.nivel }}
        </span>
        <span :class="statusChip().cls">
          <span v-if="curso.progreso === 1" :style="{ display: 'inline-flex' }">
            <IconSet name="check" />
          </span>
          <span v-else class="chip-dot" />
          {{ statusChip().label }}
        </span>
      </div>

      <h2 class="display curso-title">
        {{ curso.titulo }}
      </h2>
      <p class="curso-desc">
        {{ curso.descripcion }}
      </p>

      <div class="curso-meta-row">
        <span class="curso-meta-item">
          <IconSet name="clock" />
          {{ curso.duracion || '—' }}
        </span>
        <span class="curso-meta-item">
          <IconSet name="doc" />
          {{ curso.lecciones }} lecciones
        </span>
        <span class="curso-meta-item">
          <IconSet name="doc" />
          {{ curso.modulosCount }} m&oacute;dulos
        </span>
      </div>

      <button class="btn btn-primary curso-btn" @click="emit('ver-curso', curso)">
        {{ btnLabel() }}
        <IconSet name="arrow" />
      </button>
    </div>

    <!-- Grid de módulos -->
    <div v-if="curso.modulos.length > 0" class="modulos">
      <div class="modulos-label">
        <span class="eyebrow">M&oacute;dulos</span>
      </div>
      <div class="modulos-grid">
        <div
          v-for="m in curso.modulos"
          :key="m.id"
          class="card modulo-card"
          @click="emit('ver-modulo', { curso, modulo: m })"
        >
          <div class="modulo-cover">
            <img
              v-if="isUrl(m.imagen_portada)"
              :src="m.imagen_portada"
              :alt="m.titulo"
              class="modulo-cover-img"
              loading="lazy"
            />
            <PlaceholderImage v-else :label="m.imagen_portada || m.titulo" />
          </div>
          <div class="modulo-body">
            <span class="mono modulo-meta">
              M&Oacute;DULO {{ String(m.orden).padStart(2, '0') }} &middot;
              {{ m.lecciones }} lecciones
            </span>
            <h3 class="modulo-title">
              {{ m.titulo }}
            </h3>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.curso-bloque {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
  padding-top: calc(var(--unit) * 6);
  padding-bottom: calc(var(--unit) * 6);
  border-bottom: 1px solid var(--line);
}
.curso-bloque:last-child {
  border-bottom: none;
}

.curso-cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  cursor: pointer;
  overflow: hidden;
}
.curso-cover :deep(.ph-stripe),
.curso-cover :deep(.ph-stripe-dark) {
  width: 100%;
  height: 100%;
}
.curso-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.modulo-cover {
  position: relative;
  overflow: hidden;
}
.modulo-cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.curso-body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1.5);
}
.curso-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.curso-meta {
  color: var(--ink-4);
  font-size: 12px;
}
.curso-title {
  font-size: clamp(28px, 3.6vw, 44px);
  line-height: 1.05;
  color: var(--ink);
}
.curso-desc {
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink-2);
  max-width: 64ch;
}
.curso-meta-row {
  display: flex;
  gap: calc(var(--unit) * 3);
  color: var(--ink-3);
  font-size: 13px;
  flex-wrap: wrap;
}
.curso-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.curso-btn {
  align-self: flex-start;
  margin-top: calc(var(--unit) * 1);
}

.modulos {
  margin-top: calc(var(--unit) * 2);
}
.modulos-label {
  margin-bottom: calc(var(--unit) * 2);
  padding-bottom: calc(var(--unit) * 1);
  border-bottom: 1px solid var(--line);
}
.modulos-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--unit) * 2.5);
}
.modulo-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
.modulo-cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}
.modulo-cover :deep(.ph-stripe),
.modulo-cover :deep(.ph-stripe-dark) {
  width: 100%;
  height: 100%;
}
.modulo-body {
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
}
.modulo-meta {
  color: var(--ink-4);
  font-size: 11px;
  letter-spacing: 0.08em;
}
.modulo-title {
  font-family: var(--display);
  font-size: 16px;
  line-height: 1.3;
  color: var(--ink);
  font-weight: 500;
  margin: 0;
}

@media (max-width: 1023px) {
  .modulos-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 720px) {
  .modulos-grid {
    grid-template-columns: 1fr;
  }
  .curso-meta-row {
    gap: calc(var(--unit) * 2);
  }
}
</style>
