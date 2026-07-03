<!-- src/components/LandingHero.vue — Hero institucional V1.24 (layout mockup) -->
<script setup>
import { ref } from 'vue'

defineProps({
  hasRegistered: { type: Boolean, default: false },
  stats: {
    type: Object,
    required: true,
  },
  showStats: { type: Boolean, default: false },
  porcentajeAprobacion: { type: Number, default: null },
})

const emit = defineEmits(['registro', 'catalogo', 'buscar'])

const query = ref('')

function submitSearch() {
  emit('buscar', query.value.trim())
}

function fmt(n) {
  return new Intl.NumberFormat('es-MX').format(n || 0)
}
</script>

<template>
  <section class="site-hero" aria-labelledby="hero-titulo">
    <div class="site-hero-inner">
      <!-- Velo guinda para legibilidad sobre la foto -->
      <div class="hero-overlay" aria-hidden="true" />

      <div class="hero-grid">
        <!-- FILA 1 — search (top-right) -->
        <form class="hero-search" role="search" @submit.prevent="submitSearch">
          <label for="hero-search-input" class="sr-only">Buscar cursos</label>
          <input
            id="hero-search-input"
            v-model="query"
            type="search"
            placeholder="Buscar cursos…"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="submit" class="hero-search-btn">Buscar</button>
        </form>

        <!-- FILA 2 — logo plataforma (top, alineado a la derecha) -->
        <div class="hero-brand">
          <img
            src="/img/logo-plataforma.png"
            alt="Plataforma de Capacitación"
            class="hero-brand-logo"
            width="720"
            height="166"
            fetchpriority="high"
          />
        </div>

        <!-- FILA 3 — columna izquierda: título principal -->
        <div class="hero-left">
          <p class="hero-eyebrow">Cursos especializados en Salud Mental y Adicciones</p>
          <h1 id="hero-titulo" class="hero-title">Capacitación en Salud Mental y Adicciones</h1>
        </div>

        <!-- FILA 3 — columna derecha: ABC + Estrategia + descripción + CTA -->
        <div class="hero-right">
          <div class="hero-partners">
            <img
              src="/img/logo-abc.png"
              alt="El ABC de las Emociones — Salud Mental para las y los Jóvenes — Estrategia Nacional de Salud Mental"
              class="hero-partner-abc"
            />
          </div>

          <p class="hero-desc">
            Si eres persona servidora pública o has sido asignado como Brigadista en la Estrategia
            Nacional del "ABC de las Emociones", conoce aquí los cursos y materiales.
          </p>

          <div class="hero-actions">
            <button class="hero-pill" type="button" @click="emit('catalogo')">
              Ver oferta educativa
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Stats por debajo del hero, en banda institucional clara -->
    <aside v-if="showStats" class="site-stats-band" aria-label="Indicadores de la plataforma">
      <div class="site-stats-band-inner">
        <div v-if="stats.servidoresInscritos > 0" class="site-stat">
          <strong>{{ fmt(stats.servidoresInscritos) }}</strong>
          <span>Servidores inscritos</span>
        </div>
        <div v-if="stats.cursosDisponibles > 0" class="site-stat">
          <strong>{{ fmt(stats.cursosDisponibles) }}</strong>
          <span>Cursos disponibles</span>
        </div>
        <div v-if="stats.constanciasEmitidas > 0" class="site-stat">
          <strong>{{ fmt(stats.constanciasEmitidas) }}</strong>
          <span>Constancias emitidas</span>
        </div>
        <div v-if="porcentajeAprobacion !== null && porcentajeAprobacion > 0" class="site-stat">
          <strong>{{ porcentajeAprobacion }}%</strong>
          <span>Tasa de finalización</span>
        </div>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.site-hero {
  background: var(--brand-primary-dark);
}

.site-hero-inner {
  position: relative;
  display: block;
  padding: 0;
  background-image: url('/img/fiinicio.webp');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  min-height: clamp(580px, 88vh, 820px);
  overflow: hidden;
}

/* Velo guinda+negro para legibilidad sobre la foto */
.hero-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(97, 18, 50, 0.35) 0%, rgba(22, 26, 29, 0.85) 100%),
    radial-gradient(60% 80% at 35% 50%, rgba(155, 34, 71, 0.45) 0%, transparent 70%);
  pointer-events: none;
}

.hero-grid {
  position: relative;
  z-index: 1;
  max-width: 1440px;
  margin: 0 auto;
  padding: calc(var(--unit) * 4) calc(var(--unit) * 6) calc(var(--unit) * 8);
  min-height: clamp(580px, 88vh, 820px);
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto 1fr;
  column-gap: calc(var(--unit) * 6);
  row-gap: calc(var(--unit) * 5);
  color: var(--paper);
}

/* === Search top-right === */
.hero-search {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
  display: flex;
  align-items: stretch;
  width: 100%;
  max-width: 560px;
  background: var(--paper);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}
.hero-search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 14px 18px;
  font-family: var(--ui);
  font-size: 15px;
  color: var(--ink);
}
.hero-search input::placeholder {
  color: var(--gris-50);
}
.hero-search input::-webkit-search-cancel-button {
  display: none;
}
.hero-search-btn {
  background: var(--brand-accent-soft);
  color: var(--brand-ink);
  border: none;
  padding: 0 calc(var(--unit) * 3);
  font-family: var(--ui);
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition: background 160ms var(--ease);
  flex-shrink: 0;
}
.hero-search-btn:hover {
  background: var(--brand-accent);
  color: var(--paper);
}

/* === Logo plataforma (fila 2, derecha) === */
.hero-brand {
  grid-column: 2;
  grid-row: 2;
  justify-self: end;
  align-self: center;
}
.hero-brand-logo {
  width: clamp(280px, 36vw, 560px);
  height: auto;
  display: block;
  filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.45));
}

/* === Columna izquierda: título principal === */
.hero-left {
  grid-column: 1;
  grid-row: 3;
  align-self: center;
  padding-top: calc(var(--unit) * 2);
  max-width: 560px;
}
.hero-eyebrow {
  font-family: var(--ui);
  font-size: 14px;
  font-weight: 500;
  color: var(--paper);
  margin-bottom: calc(var(--unit) * 3);
  letter-spacing: 0.02em;
  max-width: 50ch;
}
.hero-title {
  font-family: var(--display);
  font-weight: 600;
  font-variation-settings:
    'opsz' 144,
    'wght' 600;
  font-size: clamp(40px, 5.4vw, 78px);
  line-height: 1.05;
  letter-spacing: -0.015em;
  color: var(--paper);
}

/* === Columna derecha: ABC + Estrategia + descripción + CTA === */
.hero-right {
  grid-column: 2;
  grid-row: 3;
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
  padding-top: calc(var(--unit) * 2);
  max-width: 560px;
}

.hero-partners {
  display: flex;
  align-items: center;
}
.hero-partner-abc {
  height: clamp(56px, 7vw, 86px);
  width: auto;
  display: block;
  flex-shrink: 0;
}

.hero-desc {
  font-family: var(--ui);
  font-size: clamp(15px, 1.3vw, 18px);
  line-height: 1.55;
  color: var(--paper);
  max-width: 52ch;
}

.hero-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: calc(var(--unit) * 1);
}

/* Botón pill arena (rompe con el resto del DS, intencional para CTA hero) */
.hero-pill {
  background: var(--brand-accent-soft);
  color: var(--brand-ink);
  border: none;
  border-radius: 999px;
  padding: 16px 36px;
  font-family: var(--ui);
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition:
    background 160ms var(--ease),
    transform 160ms var(--ease);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}
.hero-pill:hover {
  background: var(--brand-accent);
  color: var(--paper);
  transform: translateY(-1px);
}

/* === Banda de stats debajo del hero === */
.site-stats-band {
  background: var(--paper);
  border-top: 2px solid var(--brand-accent);
  border-bottom: 1px solid var(--line);
}
.site-stats-band-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: calc(var(--unit) * 5) calc(var(--unit) * 6);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: calc(var(--unit) * 4);
}
.site-stats-band .site-stat strong {
  display: block;
  font-family: var(--display);
  font-weight: 500;
  font-variation-settings:
    'opsz' 144,
    'wght' 500;
  font-size: clamp(36px, 4vw, 56px);
  line-height: 1;
  color: var(--brand-primary);
  margin-bottom: 6px;
}
.site-stats-band .site-stat span {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--gris-70);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ============ Responsive ============ */

/* Tablet: 1 sola columna pero conserva orden visual de la PC */
@media (max-width: 980px) {
  .hero-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    row-gap: calc(var(--unit) * 4);
    padding: calc(var(--unit) * 3) calc(var(--unit) * 4) calc(var(--unit) * 6);
  }
  .hero-search,
  .hero-brand,
  .hero-left,
  .hero-right {
    grid-column: 1;
    grid-row: auto;
    justify-self: stretch;
    max-width: 100%;
  }
  .hero-search {
    max-width: 100%;
  }
  .hero-brand {
    justify-self: center;
  }
  .hero-brand-logo {
    margin: 0 auto;
  }
  .hero-left {
    padding-top: 0;
    text-align: left;
  }
  .hero-right {
    padding-top: 0;
  }
}

@media (max-width: 720px) {
  .site-hero-inner {
    background-image: url('/img/fiinicio-mobile.webp');
    min-height: clamp(640px, 100vh, 900px);
  }
  .hero-grid {
    padding: calc(var(--unit) * 3) calc(var(--unit) * 3) calc(var(--unit) * 5);
    min-height: clamp(640px, 100vh, 900px);
  }
  .hero-actions {
    justify-content: stretch;
  }
  .hero-pill {
    width: 100%;
    padding: 14px 24px;
    font-size: 15px;
  }
  .hero-search input {
    padding: 12px 14px;
    font-size: 14px;
  }
  .hero-search-btn {
    padding: 0 calc(var(--unit) * 2);
    font-size: 14px;
  }
  .site-stats-band-inner {
    padding: calc(var(--unit) * 4) calc(var(--unit) * 3);
    gap: calc(var(--unit) * 3);
  }
}
</style>
