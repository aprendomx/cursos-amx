<!-- src/components/LandingCursoBloque.vue -->
<script setup>
import IconSet from '@/components/IconSet.vue'
import { categoriaVisual, inicialPortada } from '@/lib/categoriaVisual.js'

const props = defineProps({
  curso: { type: Object, required: true },
  index: { type: Number, default: 0 },
})

const emit = defineEmits(['ver-curso', 'ver-modulo', 'probar-curso'])

// El pastel identifica al curso; sus módulos lo heredan para que el bloque se
// lea como una sola familia de color.
const pastel = () => `pastel-${categoriaVisual(props.curso)}`

function statusChip() {
  if (props.curso.progreso === 1) return { label: 'Completado', cls: 'chip chip-verde' }
  if (props.curso.progreso > 0)
    return { label: Math.round(props.curso.progreso * 100) + '%', cls: 'chip chip-primary' }
  return { label: 'Nuevo', cls: 'chip chip-accent' }
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
      <!-- Sin imagen subida, la portada es el pastel de categoría con la
           inicial del curso: se reconoce por color y letra antes que por
           texto, sin depender de ilustración por curso. -->
      <div v-else class="curso-cover-pastel" :class="pastel()" aria-hidden="true">
        <span class="curso-cover-inicial display">{{ inicialPortada(curso.titulo) }}</span>
        <span class="curso-cover-nivel mono">{{ curso.nivel || 'Curso' }}</span>
      </div>
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

      <!-- Resultados de aprendizaje: el argumento de venta de la tarjeta.
           Sin el dato, el bloque no aparece y la tarjeta queda como siempre:
           ninguna instalación se ve obligada a rellenarlo. -->
      <div v-if="curso.resultados?.length" class="curso-resultados" data-test="curso-resultados">
        <span class="eyebrow">Al terminar sabr&aacute;s</span>
        <ul class="curso-resultados-lista">
          <li v-for="r in curso.resultados" :key="r">
            <IconSet name="check" />
            <span>{{ r }}</span>
          </li>
        </ul>
      </div>

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

      <div class="curso-acciones">
        <button class="btn btn-primary curso-btn" @click="emit('ver-curso', curso)">
          {{ btnLabel() }}
          <IconSet name="arrow" />
        </button>
        <!-- La primera lección se puede ver sin registrarse (fase 2 del
             change portada-cursos-primero): probar antes de dar datos. -->
        <button
          v-if="curso.progreso === 0"
          class="btn btn-ghost curso-btn"
          data-test="probar-curso"
          @click="emit('probar-curso', curso)"
        >
          Pru&eacute;bala ahora, sin registro
        </button>
      </div>
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
          class="tarjeta-dura modulo-card"
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
            <div v-else class="modulo-cover-pastel" :class="pastel()" aria-hidden="true">
              <span class="modulo-cover-inicial display">{{ inicialPortada(m.titulo) }}</span>
            </div>
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
  /* Tocable: contorno de tinta, como toda superficie que espera un toque. */
  border: var(--borde-ancho) solid var(--borde-tinta);
  border-radius: var(--radius-md);
}
.curso-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.curso-cover-pastel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--unit) * 0.5);
}
.curso-cover-inicial {
  font-size: clamp(64px, 14vw, 120px);
  line-height: 1;
}
.curso-cover-nivel {
  font-size: var(--text-xs);
  letter-spacing: 0.18em;
  opacity: 0.75;
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
  font-size: var(--text-xs);
}
.curso-title {
  font-size: clamp(28px, 3.6vw, 44px);
  line-height: 1.05;
  color: var(--ink);
}
.curso-desc {
  font-size: var(--text-base);
  line-height: 1.55;
  color: var(--ink-2);
  max-width: 64ch;
}
.curso-resultados {
  margin-top: calc(var(--unit) * 0.5);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
}
.curso-resultados-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 0.75);
  max-width: 64ch;
}
.curso-resultados-lista li {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--unit) * 1);
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--ink-2);
}
.curso-resultados-lista li :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--primary-fg);
}
.curso-meta-row {
  display: flex;
  gap: calc(var(--unit) * 3);
  color: var(--ink-3);
  font-size: var(--text-sm);
  flex-wrap: wrap;
}
.curso-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.curso-acciones {
  display: flex;
  align-items: center;
  gap: calc(var(--unit) * 1.5);
  flex-wrap: wrap;
  margin-top: calc(var(--unit) * 1);
}
.curso-btn {
  align-self: flex-start;
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
  overflow: hidden;
}
.modulo-cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}
.modulo-cover-pastel {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
}
.modulo-cover-inicial {
  font-size: clamp(32px, 6vw, 48px);
  line-height: 1;
}
.modulo-body {
  padding: calc(var(--unit) * 2);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 1);
}
.modulo-meta {
  color: var(--ink-4);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
}
.modulo-title {
  font-family: var(--display);
  font-size: var(--text-base);
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
