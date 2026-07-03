<!-- src/components/LandingEstrategiaABC.vue
     Sección de Estrategia ABC de las emociones — cursos por perfil
     (Servidor Público / Brigadista). -->
<script setup>
const emit = defineEmits(['seleccionar-perfil'])

function selecciona(perfil) {
  emit('seleccionar-perfil', perfil)
}
</script>

<template>
  <section class="abc-section" aria-labelledby="abc-titulo">
    <!-- Banda superior verde oscuro con título -->
    <header class="abc-band">
      <div class="abc-band-inner">
        <h2 id="abc-titulo" class="abc-band-title">Cursos Estrategia el "ABC de las emociones"</h2>
      </div>
    </header>

    <!-- Card principal -->
    <div class="abc-wrap container">
      <article class="abc-card">
        <!-- Lado izquierdo: contenido textual -->
        <div class="abc-card-left">
          <div class="abc-card-header">
            <img
              src="/img/logo-abc.png"
              alt="El ABC de las Emociones — Salud Mental para las y los Jóvenes — Estrategia Nacional de Salud Mental"
              class="abc-logo"
            />
          </div>

          <div class="abc-body">
            <p>
              En esta sección, las personas servidoras públicas y brigadistas podrán acceder a los
              materiales de capacitación necesarios para conocer la estrategia, preparar la sesión y
              replicar la plática de manera clara, sensible y participativa en las escuelas.
            </p>
            <p>
              Selecciona el perfil que corresponde para ingresar a la capacitación y consultar los
              recursos disponibles.
            </p>
          </div>

          <div class="abc-actions">
            <button
              type="button"
              class="abc-pill abc-pill-primary"
              @click="selecciona('servidor-publico')"
            >
              Servidor Público
            </button>
            <button
              type="button"
              class="abc-pill abc-pill-secondary"
              @click="selecciona('brigadista')"
            >
              Brigadista
            </button>
          </div>
        </div>

        <!-- Lado derecho: foto + sticker -->
        <div class="abc-card-right">
          <div class="abc-photo">
            <img
              src="/img/abc-foto.webp"
              alt="Sesión de capacitación de la estrategia ABC de las emociones"
              class="abc-photo-img"
              loading="lazy"
              width="450"
              height="800"
            />
            <!-- Sticker overlay -->
            <aside class="abc-sticker" aria-label="Ingreso al curso por perfil">
              <header class="abc-sticker-head">
                <svg class="abc-sticker-ico" viewBox="0 0 24 24" aria-hidden="true">
                  <circle
                    cx="9"
                    cy="8"
                    r="3"
                    stroke="currentColor"
                    stroke-width="1.6"
                    fill="none"
                  />
                  <circle
                    cx="16"
                    cy="9"
                    r="2.4"
                    stroke="currentColor"
                    stroke-width="1.6"
                    fill="none"
                  />
                  <path
                    d="M3.5 18.5c.7-2.8 3-4.5 5.5-4.5s4.8 1.7 5.5 4.5"
                    stroke="currentColor"
                    stroke-width="1.6"
                    fill="none"
                    stroke-linecap="round"
                  />
                  <path
                    d="M14.5 18.5c.5-2 2-3.2 3.8-3.2s3.3 1.2 3.7 3.2"
                    stroke="currentColor"
                    stroke-width="1.6"
                    fill="none"
                    stroke-linecap="round"
                  />
                </svg>
                <span><strong>Tu participación</strong><br />es importante</span>
              </header>
              <p>Ingresa al curso para las personas Servidoras Públicas y Brigadistas</p>
            </aside>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.abc-section {
  padding: calc(var(--unit) * 6) 0 calc(var(--unit) * 8);
  background: var(--paper-2);
}

/* === Banda superior === */
.abc-band {
  background: var(--brand-secondary-dark);
  border-top: 2px solid var(--brand-accent);
  border-bottom: 2px solid var(--brand-accent);
}
.abc-band-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: calc(var(--unit) * 4) calc(var(--unit) * 6);
  text-align: center;
}
.abc-band-title {
  font-family: var(--display);
  font-style: italic;
  font-weight: 500;
  font-variation-settings:
    'opsz' 144,
    'wght' 500;
  font-size: clamp(28px, 3.6vw, 48px);
  line-height: 1.05;
  letter-spacing: -0.015em;
  color: var(--paper);
}

/* === Card principal === */
.abc-wrap {
  margin-top: calc(var(--unit) * 5);
}
.abc-card {
  background: var(--brand-secondary-dark);
  color: var(--paper);
  border-radius: 28px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  box-shadow: 0 18px 60px rgba(0, 47, 42, 0.18);
}

/* Izquierda: texto + botones */
.abc-card-left {
  padding: calc(var(--unit) * 5) calc(var(--unit) * 5) calc(var(--unit) * 4);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
}
.abc-card-header {
  display: flex;
  align-items: center;
}
.abc-logo {
  height: clamp(54px, 6vw, 76px);
  width: auto;
  flex-shrink: 0;
}

.abc-body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.abc-body p {
  font-family: var(--ui);
  font-size: clamp(14px, 1.1vw, 16px);
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.92);
}

.abc-actions {
  display: flex;
  gap: calc(var(--unit) * 2);
  flex-wrap: wrap;
  margin-top: calc(var(--unit) * 1);
}
.abc-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 30px;
  border-radius: 999px;
  border: none;
  font-family: var(--ui);
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
  transition:
    background 160ms var(--ease),
    transform 160ms var(--ease);
  min-width: 180px;
}
.abc-pill-primary {
  background: var(--brand-accent-soft);
  color: var(--brand-ink);
}
.abc-pill-primary:hover {
  background: var(--brand-accent);
  color: var(--paper);
  transform: translateY(-1px);
}
.abc-pill-secondary {
  background: var(--paper);
  color: var(--brand-ink);
}
.abc-pill-secondary:hover {
  background: var(--gris-20);
  transform: translateY(-1px);
}

/* Derecha: foto + sticker */
.abc-card-right {
  position: relative;
  background: var(--brand-secondary-dark);
  min-height: 360px;
}
.abc-photo {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.abc-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Encuadre del retrato: la cara queda en el tercio superior.
     Si necesita más pelo o más cuello, ajustar la Y entre 10% y 30%. */
  object-position: center 20%;
  display: block;
}

/* Sticker overlay */
.abc-sticker {
  position: absolute;
  top: 20px;
  right: 20px;
  width: clamp(220px, 22vw, 280px);
  background: var(--brand-secondary-dark);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  padding: 0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.abc-sticker-head {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--brand-accent);
  color: var(--brand-secondary-dark);
  padding: 10px 14px;
}
.abc-sticker-ico {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
}
.abc-sticker-head span {
  font-family: var(--ui);
  font-size: 13px;
  line-height: 1.2;
}
.abc-sticker-head strong {
  font-weight: 700;
}
.abc-sticker p {
  font-family: var(--ui);
  font-size: 13px;
  line-height: 1.45;
  color: var(--paper);
  padding: 12px 14px;
}

/* ============ Responsive ============ */
@media (max-width: 880px) {
  .abc-card {
    grid-template-columns: 1fr;
    border-radius: 20px;
  }
  .abc-card-left {
    padding: calc(var(--unit) * 4);
    gap: calc(var(--unit) * 2.5);
  }
  .abc-card-right {
    min-height: 280px;
    order: 2;
  }
  .abc-card-left {
    order: 1;
  }
  .abc-actions {
    flex-direction: column;
  }
  .abc-actions .abc-pill {
    width: 100%;
  }
  .abc-sticker {
    top: 12px;
    right: 12px;
    width: 180px;
  }
  .abc-sticker-head span {
    font-size: 11px;
  }
  .abc-sticker p {
    font-size: 11.5px;
    padding: 8px 12px;
  }
}
</style>
