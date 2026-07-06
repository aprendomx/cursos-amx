<!-- src/components/LandingFooter.vue -->
<script setup>
import { theme } from '@/lib/theme.js'

defineProps({
  cursosCount: { type: Number, default: 0 },
})

const year = new Date().getFullYear()
</script>

<template>
  <footer
    class="site-pleca"
    role="contentinfo"
  >
    <div class="site-pleca-inner">
      <div class="site-pleca-brand">
        <img
          :src="theme.logos.footer"
          :alt="theme.app.name"
        >
        <p>{{ theme.footer.about }}</p>
      </div>

      <div
        v-for="col in theme.footer.columns"
        :key="col.title"
        class="site-pleca-col"
      >
        <h4>{{ col.title }}</h4>
        <ul>
          <li
            v-for="link in col.links"
            :key="link.label"
          >
            <a
              :href="link.href"
              :target="link.href.startsWith('http') ? '_blank' : undefined"
              :rel="link.href.startsWith('http') ? 'noopener' : undefined"
            >{{ link.label }}</a>
          </li>
        </ul>
      </div>
    </div>

    <div class="site-pleca-creditos">
      <small>{{ cursosCount }} cursos activos · © {{ year }} {{ theme.footer.copyrightHolder }}</small>
    </div>
  </footer>
</template>
