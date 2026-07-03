<!-- src/components/LandingComoConstancia.vue
     Sección "Como obtener tu constancia" — 4 pasos + preview del certificado. -->
<script setup>
const emit = defineEmits(['descargar-constancia'])

const pasos = [
  { n: 1, titulo: 'Completa el curso', desc: 'Revisa todos los módulos y contenidos del curso.' },
  { n: 2, titulo: 'Aprueba el curso', desc: 'Obtén la calificación mínima requerida en el curso.' },
  {
    n: 3,
    titulo: 'Verifica tus datos',
    desc: 'Confirma que tu nombre y dependencia estén correctos en tu perfil.',
  },
  {
    n: 4,
    titulo: 'Descarga la constancia',
    desc: 'Genera y descarga tu PDF firmado electrónicamente.',
  },
]
</script>

<template>
  <section class="cc-section" aria-labelledby="cc-titulo">
    <!-- Banda superior guinda con título -->
    <header class="cc-band">
      <div class="cc-band-inner">
        <h2 id="cc-titulo" class="cc-band-title">Como obtener tu constancia</h2>
      </div>
    </header>

    <!-- Card principal -->
    <div class="cc-wrap container">
      <article class="cc-card">
        <!-- Lado izquierdo: pasos + descripción -->
        <div class="cc-left">
          <h3 class="cc-headline">Obtén tu constancia</h3>
          <p class="cc-intro">
            Para recibir tu constancia de participación en el curso, debes cumplir los siguientes
            pasos:
          </p>

          <div class="cc-pasos">
            <div v-for="p in pasos" :key="p.n" class="cc-paso">
              <span class="cc-paso-num">{{ p.n }}</span>
              <div class="cc-paso-body">
                <strong>{{ p.titulo }}</strong>
                <span>{{ p.desc }}</span>
              </div>
            </div>
          </div>

          <p class="cc-outro">
            Al cumplir los requisitos, ingresa al apartado para generar tu constancia.
          </p>

          <div class="cc-actions">
            <button type="button" class="cc-pill" @click="emit('descargar-constancia')">
              Descargar Constancia
            </button>
          </div>
        </div>

        <!-- Lado derecho: preview del certificado -->
        <div class="cc-right">
          <img
            src="/img/constancia-preview.webp"
            alt="Vista previa de la constancia oficial"
            class="cc-preview"
            loading="lazy"
            width="1200"
            height="1610"
          />
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.cc-section {
  padding: 0 0 calc(var(--unit) * 8);
  background: var(--paper-2);
}

/* Banda superior guinda */
.cc-band {
  background: var(--guinda);
  border-top: 2px solid var(--oro);
  border-bottom: 2px solid var(--oro);
}
.cc-band-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: calc(var(--unit) * 4) calc(var(--unit) * 6);
  text-align: center;
}
.cc-band-title {
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

/* Card principal */
.cc-wrap {
  margin-top: calc(var(--unit) * 5);
}
.cc-card {
  background: var(--verde-oscuro);
  color: var(--paper);
  border-radius: 28px;
  overflow: hidden;
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 0;
  box-shadow: 0 18px 60px rgba(0, 47, 42, 0.18);
}

.cc-left {
  padding: calc(var(--unit) * 5) calc(var(--unit) * 5) calc(var(--unit) * 5);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 3);
}

.cc-headline {
  font-family: var(--display);
  font-style: italic;
  font-weight: 500;
  font-variation-settings:
    'opsz' 144,
    'wght' 500;
  font-size: clamp(34px, 4vw, 52px);
  line-height: 1.05;
  letter-spacing: -0.015em;
  color: var(--paper);
}

.cc-intro,
.cc-outro {
  font-family: var(--ui);
  font-size: clamp(14px, 1.1vw, 16px);
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.9);
  max-width: 48ch;
}

/* Grid 2x2 de pasos */
.cc-pasos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--unit) * 2);
}
.cc-paso {
  background: var(--paper);
  color: var(--negro);
  border-radius: 14px;
  padding: calc(var(--unit) * 2);
  display: flex;
  align-items: flex-start;
  gap: calc(var(--unit) * 1.5);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}
.cc-paso-num {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--oro);
  color: var(--paper);
  display: grid;
  place-items: center;
  font-family: var(--display);
  font-weight: 600;
  font-variation-settings:
    'opsz' 144,
    'wght' 600;
  font-size: 22px;
}
.cc-paso-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.cc-paso-body strong {
  font-family: var(--ui);
  font-weight: 700;
  font-size: 14.5px;
  color: var(--negro);
  line-height: 1.2;
}
.cc-paso-body span {
  font-family: var(--ui);
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--gris-70);
}

/* Botón pill verde-oscuro */
.cc-actions {
  display: flex;
  margin-top: calc(var(--unit) * 1);
}
.cc-pill {
  background: rgba(255, 255, 255, 0.06);
  color: var(--paper);
  border: 1.5px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  padding: 16px 38px;
  font-family: var(--ui);
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition:
    background 160ms var(--ease),
    transform 160ms var(--ease),
    border-color 160ms var(--ease);
}
.cc-pill:hover {
  background: var(--paper);
  color: var(--verde-oscuro);
  border-color: var(--paper);
  transform: translateY(-1px);
}

/* Lado derecho: preview del certificado */
.cc-right {
  background: var(--verde-oscuro);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(var(--unit) * 4);
  position: relative;
}
.cc-preview {
  width: 100%;
  max-width: 460px;
  height: auto;
  display: block;
  border-radius: 8px;
  background: var(--paper);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.1) inset,
    0 24px 48px rgba(0, 0, 0, 0.35);
}

/* ============ Responsive ============ */
@media (max-width: 980px) {
  .cc-card {
    grid-template-columns: 1fr;
    border-radius: 20px;
  }
  .cc-right {
    order: 2;
    padding: calc(var(--unit) * 4);
  }
  .cc-left {
    order: 1;
    padding: calc(var(--unit) * 4);
  }
  .cc-preview {
    max-width: 360px;
    margin: 0 auto;
  }
}

@media (max-width: 640px) {
  .cc-pasos {
    grid-template-columns: 1fr;
  }
  .cc-actions {
    justify-content: stretch;
  }
  .cc-pill {
    width: 100%;
    padding: 14px 24px;
    font-size: 15px;
  }
  .cc-headline {
    font-size: clamp(28px, 9vw, 36px);
  }
}
</style>
