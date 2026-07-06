<!-- src/components/LandingConstancia.vue -->
<script setup>
import IconSet from '@/components/IconSet.vue'
import { theme } from '@/lib/theme.js'
</script>

<template>
  <section class="container constancia">
    <div class="constancia-grid">
      <!-- Mockup decorativo -->
      <div
        class="constancia-mock"
        aria-hidden="true"
      >
        <div class="constancia-paper">
          <p class="eyebrow">
            {{ theme.constancia.emisor }} &middot; CONSTANCIA
          </p>
          <p class="display constancia-paper-title">
            Se otorga a
          </p>
          <p class="display-italic constancia-paper-name">
            Nombre de la persona
          </p>
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
        <p class="eyebrow">
          TU CONSTANCIA OFICIAL
        </p>
        <h2 class="display constancia-title">
          Una constancia con
          <span
            class="display-italic"
            :style="{ color: 'var(--primary)' }"
          >validez verificable</span>.
        </h2>

        <ul class="constancia-bullets">
          <li>
            <IconSet name="check" />
            <span><strong>Folio &uacute;nico</strong> generado al terminar el curso.</span>
          </li>
          <li>
            <IconSet name="check" />
            <span><strong>Hash criptogr&aacute;fico</strong> de integridad para validar
              autenticidad.</span>
          </li>
          <li>
            <IconSet name="check" />
            <span><strong>Descargable en PDF</strong> desde tu perfil cuando finalices.</span>
          </li>
        </ul>
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
  font-size: 28px;
  color: var(--ink);
}
.constancia-paper-name {
  font-size: clamp(28px, 3vw, 40px);
  color: var(--primary);
}
.constancia-paper-curso {
  font-size: 14px;
  color: var(--ink-2);
}
.constancia-paper-foot {
  display: flex;
  justify-content: space-between;
  gap: calc(var(--unit) * 2);
  padding-top: calc(var(--unit) * 2);
  border-top: 1px dashed var(--line);
  font-size: 11px;
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
  color: var(--primary);
}

@media (max-width: 900px) {
  .constancia-grid {
    grid-template-columns: 1fr;
    gap: calc(var(--unit) * 4);
  }
}
</style>
