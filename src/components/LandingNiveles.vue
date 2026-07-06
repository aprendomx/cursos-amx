<!-- src/components/LandingNiveles.vue -->
<script setup>
defineProps({
  cursosPorNivel: {
    type: Object,
    required: true,
    // { Fundamental: number, Intermedio: number, Avanzado: number }
  },
})

const niveles = [
  {
    key: 'Fundamental',
    chipCls: 'chip chip-accent',
    descripcion:
      'Para servidoras y servidores que inician su carrera o cambian de funci&oacute;n. Cubre principios b&aacute;sicos de la administraci&oacute;n p&uacute;blica.',
  },
  {
    key: 'Intermedio',
    chipCls: 'chip chip-primary',
    descripcion:
      'Para mandos medios y especialistas. Profundiza en marcos normativos, gesti&oacute;n y rendici&oacute;n de cuentas.',
  },
  {
    key: 'Avanzado',
    chipCls: 'chip chip-verde',
    descripcion:
      'Para directivos y l&iacute;deres de pol&iacute;tica p&uacute;blica. Casos complejos, decisiones estrat&eacute;gicas y &eacute;tica aplicada.',
  },
]
</script>

<template>
  <section class="container niveles">
    <div class="niveles-head">
      <p class="eyebrow">
        NIVELES DE FORMACI&Oacute;N
      </p>
      <h2 class="display niveles-title">
        Encuentra el camino a tu medida.
      </h2>
    </div>

    <div class="niveles-grid">
      <article
        v-for="n in niveles"
        :key="n.key"
        class="card niveles-card"
      >
        <span :class="n.chipCls">
          <span class="chip-dot" />
          {{ n.key }}
        </span>
        <!-- eslint-disable-next-line vue/no-v-html -- safe: static content controlled internally -->
        <p
          class="niveles-desc"
          v-html="n.descripcion"
        />
        <span class="mono niveles-count">
          {{ cursosPorNivel[n.key] || 0 }} curso{{ (cursosPorNivel[n.key] || 0) === 1 ? '' : 's' }}
        </span>
      </article>
    </div>
  </section>
</template>

<style scoped>
.niveles {
  padding-top: calc(var(--unit) * 8);
  padding-bottom: calc(var(--unit) * 8);
  border-top: 1px solid var(--line);
}
.niveles-head {
  margin-bottom: calc(var(--unit) * 5);
}
.niveles-title {
  font-size: clamp(28px, 3vw, 40px);
  color: var(--ink);
  margin-top: calc(var(--unit) * 1);
}
.niveles-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: calc(var(--unit) * 3);
}
.niveles-card {
  padding: calc(var(--unit) * 3);
  display: flex;
  flex-direction: column;
  gap: calc(var(--unit) * 2);
}
.niveles-desc {
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-2);
  flex: 1;
  margin: 0;
}
.niveles-count {
  color: var(--ink-3);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

@media (max-width: 1024px) {
  .niveles-grid {
    grid-template-columns: 1fr;
  }
}
</style>
