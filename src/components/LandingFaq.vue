<!-- src/components/LandingFaq.vue — FAQ institucional V1.24 -->
<script setup>
import { ref } from 'vue'

const emit = defineEmits(['enviar-mensaje'])

const items = [
  {
    q: '¿Cómo me registro en la plataforma?',
    a: 'Desde el botón "Crear cuenta" en la página principal o el header completa el formulario con tu nombre completo, correo institucional y dependencia. El registro toma menos de dos minutos y no tiene costo.',
  },
  {
    q: '¿Cómo ingreso a un curso?',
    a: 'Una vez con sesión iniciada, elige el curso del catálogo y haz clic en "Inscribirme". El curso quedará disponible en "Mi aprendizaje" para retomarlo cuando quieras.',
  },
  {
    q: '¿Quién puede tomar la capacitación?',
    a: 'La plataforma está orientada a personas servidoras y servidores públicos federales, estatales y municipales, así como a brigadistas de la Estrategia Nacional. El registro está abierto.',
  },
  {
    q: '¿Qué hago si olvidé mi contraseña?',
    a: 'En la pantalla de inicio de sesión usa el enlace "Olvidé mi contraseña". Te enviaremos un correo con un vínculo seguro para restablecerla.',
  },
  {
    q: '¿Cómo puedo descargar mi constancia?',
    a: 'Después de aprobar el curso y verificar tus datos, entra a "Mi aprendizaje" y selecciona el curso. Tu constancia firmada electrónicamente se descarga en PDF con un solo clic.',
  },
]

const openIdx = ref(null)

function toggle(i) {
  openIdx.value = openIdx.value === i ? null : i
}
</script>

<template>
  <section class="faq-section" aria-labelledby="faq-titulo">
    <!-- Banda superior oro institucional -->
    <header class="faq-band">
      <div class="faq-band-inner">
        <h2 id="faq-titulo" class="faq-band-title">Preguntas frecuentes</h2>
      </div>
    </header>

    <!-- Body crema con lista de preguntas -->
    <div class="faq-body">
      <div class="faq-inner container">
        <ul class="faq-list" role="list">
          <li
            v-for="(it, i) in items"
            :key="i"
            class="faq-item"
            :class="{ 'is-open': openIdx === i }"
          >
            <button
              class="faq-q"
              :aria-expanded="openIdx === i"
              :aria-controls="`faq-a-${i}`"
              type="button"
              @click="toggle(i)"
            >
              <span class="faq-q-bar" aria-hidden="true" />
              <span class="faq-q-text">{{ it.q }}</span>
              <span class="faq-q-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16">
                  <path
                    d="M3 5.5l5 5 5-5"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                  />
                </svg>
              </span>
            </button>
            <div v-show="openIdx === i" :id="`faq-a-${i}`" class="faq-a" role="region">
              <p>{{ it.a }}</p>
            </div>
          </li>
        </ul>

        <!-- Footer: contacto + CTA -->
        <footer class="faq-foot">
          <p class="faq-foot-text">
            Si no encuentras tu respuesta, contáctanos, nuestro equipo está listo para ayudarte.
          </p>
          <button type="button" class="faq-foot-cta" @click="emit('enviar-mensaje')">
            Enviar mensaje
          </button>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.faq-section {
  position: relative;
}

/* Banda superior oro */
.faq-band {
  background: var(--brand-accent);
}
.faq-band-inner {
  max-width: 1440px;
  margin: 0 auto;
  padding: calc(var(--unit) * 4) calc(var(--unit) * 6);
}
.faq-band-title {
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

/* Body crema claro (variante de arena) */
.faq-body {
  background: #f8f1de;
  padding: calc(var(--unit) * 6) 0 calc(var(--unit) * 8);
}
.faq-inner {
  max-width: 1200px;
  margin: 0 auto;
}

/* Lista de preguntas */
.faq-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}

.faq-item {
  position: relative;
}
.faq-q {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--paper);
  border: none;
  cursor: pointer;
  padding: 0;
  position: relative;
  text-align: left;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  transition: box-shadow 160ms var(--ease);
  overflow: hidden;
}
.faq-q:hover {
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12);
}

/* Barra vertical izquierda oro V1.24 — recordatorio APF */
.faq-q-bar {
  flex-shrink: 0;
  width: 8px;
  align-self: stretch;
  background: var(--brand-accent);
}

.faq-q-text {
  flex: 1;
  padding: calc(var(--unit) * 2.5) calc(var(--unit) * 3);
  font-family: var(--ui);
  font-weight: 700;
  font-size: clamp(16px, 1.6vw, 22px);
  line-height: 1.3;
  color: var(--brand-ink);
}

.faq-q-icon {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  margin-right: calc(var(--unit) * 1.5);
  color: var(--brand-accent);
  transition: transform 220ms var(--ease);
}
.faq-q-icon svg {
  width: 22px;
  height: 22px;
}
.faq-item.is-open .faq-q-icon {
  transform: rotate(180deg);
}

/* Respuesta */
.faq-a {
  background: var(--paper);
  margin-top: -2px;
  padding: 0 calc(var(--unit) * 3) calc(var(--unit) * 3) calc(var(--unit) * 5);
  border-left: 8px solid var(--brand-accent);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  animation: faq-slide 200ms var(--ease) both;
}
.faq-a p {
  font-family: var(--ui);
  font-size: 15px;
  line-height: 1.6;
  color: var(--gris-70);
  max-width: 72ch;
  padding-top: 4px;
}

@keyframes faq-slide {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Footer: texto + CTA */
.faq-foot {
  margin-top: calc(var(--unit) * 5);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: calc(var(--unit) * 3);
  align-items: center;
}
.faq-foot-text {
  font-family: var(--ui);
  font-size: 15.5px;
  line-height: 1.5;
  color: var(--brand-ink);
  max-width: 64ch;
}
.faq-foot-cta {
  background: var(--brand-secondary);
  color: var(--paper);
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
  white-space: nowrap;
  box-shadow: 0 8px 24px rgba(30, 91, 79, 0.3);
}
.faq-foot-cta:hover {
  background: var(--brand-secondary-dark);
  transform: translateY(-1px);
}

/* Responsive */
@media (max-width: 720px) {
  .faq-body {
    padding: calc(var(--unit) * 4) 0 calc(var(--unit) * 6);
  }
  .faq-q-icon {
    width: 44px;
    height: 44px;
    margin-right: 8px;
  }
  .faq-q-text {
    padding: calc(var(--unit) * 2) calc(var(--unit) * 2);
  }
  .faq-a {
    padding: 0 calc(var(--unit) * 2) calc(var(--unit) * 2.5) calc(var(--unit) * 3);
    border-left-width: 6px;
  }
  .faq-q-bar {
    width: 6px;
  }
  .faq-foot {
    grid-template-columns: 1fr;
    gap: calc(var(--unit) * 2);
  }
  .faq-foot-cta {
    width: 100%;
  }
}
</style>
