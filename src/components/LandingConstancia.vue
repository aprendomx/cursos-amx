<!-- src/components/LandingConstancia.vue
     Sección de cierre de la portada: la constancia, UNA sola vez.
     Fusión de las antiguas LandingComoConstancia (4 pasos + CTA) y
     LandingConstancia (validez verificable): el curso vende arriba, la
     constancia cierra aquí. Los cuatro pasos sobreviven como subsección
     compacta — se eliminó la duplicación, no el contenido
     (change portada-cursos-primero, decisión 2). -->
<script setup>
import IconSet from '@/components/IconSet.vue'
import { theme } from '@/lib/theme.js'

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
  <section
    class="container constancia"
    aria-labelledby="constancia-titulo"
    data-test="seccion-constancia"
  >
    <div class="constancia-grid">
      <!-- Mockup decorativo -->
      <div class="constancia-mock" aria-hidden="true">
        <div class="constancia-paper">
          <p class="eyebrow">{{ theme.constancia.emisor }} &middot; CONSTANCIA</p>
          <p class="display constancia-paper-title">Se otorga a</p>
          <p class="display-italic constancia-paper-name">Nombre de la persona</p>
          <p class="constancia-paper-curso">
            por concluir el curso de Capacitaci&oacute;n B&aacute;sica.
          </p>
          <div class="constancia-paper-foot">
            <span class="mono">Folio: CON-2026-XXXX-00000</span>
            <span class="mono">Hash: a4b8c2d1e7f3&hellip;</span>
          </div>
        </div>
      </div>

      <!-- Texto -->
      <div class="constancia-text">
        <p class="eyebrow">TU CONSTANCIA OFICIAL</p>
        <h2 id="constancia-titulo" class="display constancia-title">
          Al terminar, una constancia con
          <span class="display-italic" :style="{ color: 'var(--primary)' }"
            >validez verificable</span
          >.
        </h2>

        <ul class="constancia-bullets">
          <li>
            <IconSet name="check" />
            <span><strong>Folio &uacute;nico</strong> generado al terminar el curso.</span>
          </li>
          <li>
            <IconSet name="check" />
            <span
              ><strong>Hash criptogr&aacute;fico</strong> de integridad para validar
              autenticidad.</span
            >
          </li>
          <li>
            <IconSet name="check" />
            <span><strong>Descargable en PDF</strong> desde tu perfil cuando finalices.</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Los cuatro pasos, compactos: cómo se obtiene, sin sección propia -->
    <div class="constancia-pasos" data-test="constancia-pasos">
      <p class="eyebrow constancia-pasos-label">&iquest;C&oacute;mo la obtienes?</p>
      <ol class="constancia-pasos-grid">
        <li v-for="p in pasos" :key="p.n" class="constancia-paso">
          <span class="constancia-paso-num" aria-hidden="true">{{ p.n }}</span>
          <div class="constancia-paso-body">
            <strong>{{ p.titulo }}</strong>
            <span>{{ p.desc }}</span>
          </div>
        </li>
      </ol>
      <div class="constancia-actions">
        <button type="button" class="btn btn-primary" @click="emit('descargar-constancia')">
          Descargar constancia
          <IconSet name="arrow" />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.constancia {
  padding-top: calc(var(--unit) * 8);
  padding-bottom: calc(var(--unit) * 8);
  border-top: 1px solid var(--line);
}
.constancia-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: calc(var(--unit) * 6);
  align-items: center;
}
.constancia-mock {
  background: var(--paper);
  padding: calc(var(--unit) * 4);
  border: 1px solid var(--line);
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.08);
  transform: rotate(-1deg);
}
.constancia-paper {
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.constancia-paper-title {
  font-size: var(--text-3xl);
  color: var(--ink);
}
.constancia-paper-name {
  font-size: clamp(28px, 3vw, 40px);
  color: var(--primary-fg);
}
.constancia-paper-curso {
  font-size: var(--text-sm);
  color: var(--ink-2);
}
.constancia-paper-foot {
  display: flex;
  justify-content: space-between;
  gap: calc(var(--unit) * 2);
  padding-top: calc(var(--unit) * 2);
  border-top: 1px dashed var(--line);
  font-size: var(--text-xs);
  color: var(--ink-3);
  flex-wrap: wrap;
}
.constancia-title {
  font-size: clamp(28px, 3vw, 40px);
  color: var(--ink);
  margin: calc(var(--unit) * 1) 0 calc(var(--unit) * 3) 0;
  line-height: 1.05;
}
.constancia-bullets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.constancia-bullets li {
  display: flex;
  gap: calc(var(--unit) * 1.5);
  align-items: flex-start;
  color: var(--ink-2);
  line-height: 1.5;
}
.constancia-bullets li :deep(svg) {
  flex-shrink: 0;
  margin-top: 4px;
  color: var(--primary-fg);
}

/* Subsección compacta de pasos */
.constancia-pasos {
  margin-top: calc(var(--unit) * 6);
  padding-top: calc(var(--unit) * 4);
  border-top: 1px solid var(--line);
}
.constancia-pasos-label {
  margin-bottom: calc(var(--unit) * 2);
}
.constancia-pasos-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: calc(var(--unit) * 2.5);
}
.constancia-paso {
  display: flex;
  align-items: flex-start;
  gap: calc(var(--unit) * 1.5);
}
.constancia-paso-num {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--brand-accent);
  color: var(--sobre-accent);
  display: grid;
  place-items: center;
  font-family: var(--display);
  font-weight: 600;
  font-variation-settings:
    'opsz' 144,
    'wght' 600;
  font-size: var(--text-lg);
}
.constancia-paso-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.constancia-paso-body strong {
  font-family: var(--ui);
  font-weight: 700;
  font-size: var(--text-sm);
  color: var(--ink);
  line-height: 1.2;
}
.constancia-paso-body span {
  font-family: var(--ui);
  font-size: var(--text-xs);
  line-height: 1.4;
  color: var(--ink-2);
}
.constancia-actions {
  margin-top: calc(var(--unit) * 3);
  display: flex;
}

@media (max-width: 1023px) {
  .constancia-pasos-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 900px) {
  .constancia-grid {
    grid-template-columns: 1fr;
    gap: calc(var(--unit) * 4);
  }
}
@media (max-width: 640px) {
  .constancia-pasos-grid {
    grid-template-columns: 1fr;
  }
  .constancia-actions {
    justify-content: stretch;
  }
  .constancia-actions .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
