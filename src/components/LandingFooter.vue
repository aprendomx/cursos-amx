<!-- src/components/LandingFooter.vue -->
<script setup>
defineProps({
  cursosCount: { type: Number, default: 0 },
})

const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-pleca" role="contentinfo">
    <div class="site-pleca-inner">
      <!-- Brand -->
      <div class="site-pleca-brand">
        <img
          src="/img/Logo_CONASAMA_blanco.png"
          alt="CONASAMA — Comisión Nacional contra las Adicciones"
        />
        <p>
          Plataforma de Capacitación de la Comisión Nacional contra las Adicciones — plataforma
          oficial de formación para servidoras y servidores públicos del sector salud y de la
          administración pública federal.
        </p>
      </div>

      <!-- Institucional -->
      <div class="site-pleca-col">
        <h4>Institucional</h4>
        <ul>
          <li>
            <a href="#" @click.prevent>Aviso de privacidad</a>
          </li>
          <li>
            <a href="#" @click.prevent>Términos de uso</a>
          </li>
          <li>
            <a href="#" @click.prevent>Accesibilidad</a>
          </li>
          <li>
            <a href="#" @click.prevent>Transparencia</a>
          </li>
          <li>
            <a href="#" @click.prevent>Contacto</a>
          </li>
        </ul>
      </div>

      <!-- Enlaces gob.mx -->
      <div class="site-pleca-col">
        <h4>Enlaces oficiales</h4>
        <ul>
          <li>
            <a href="https://www.gob.mx" target="_blank" rel="noopener">gob.mx</a>
          </li>
          <li>
            <a href="https://www.gob.mx/salud" target="_blank" rel="noopener"
              >Secretaría de Salud</a
            >
          </li>
          <li>
            <a href="https://www.gob.mx/conasama" target="_blank" rel="noopener">gob.mx/conasama</a>
          </li>
          <li>
            <a href="#" @click.prevent>Datos abiertos</a>
          </li>
        </ul>
      </div>
    </div>

    <!-- Créditos: wordmark gob.mx + ciclo -->
    <div class="site-pleca-creditos">
      <span class="gob-wordmark"><em>gob</em>.mx</span>
      <small
        >Ciclo {{ year }} · Q2 · {{ cursosCount }} cursos activos · © {{ year }} CONASAMA</small
      >
    </div>
  </footer>
</template>
