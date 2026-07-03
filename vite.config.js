import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const plugins = [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CONASAMA · Plataforma de Capacitación',
        short_name: 'CONASAMA',
        description: 'Plataforma de Capacitación de la Comisión Nacional contra las Adicciones',
        theme_color: '#611232',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
    }),
  ]

  if (env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT) {
    plugins.push(
      sentryVitePlugin({
        authToken: env.SENTRY_AUTH_TOKEN,
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
      })
    )
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        external: [
          '/img/Logo_CONASAMA_blanco.png',
          '/img/logo-abc.png',
          '/img/logo-plataforma.png',
          '/img/abc-foto.webp',
          '/img/fiinicio.webp',
          '/img/fiinicio-mobile.webp',
          '/img/constancia-fondo.webp',
          '/img/constancia-logos.webp',
          '/img/constancia-pleca.webp',
          '/img/constancia-preview.webp'
        ],
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (/vue|pinia|vue-router/.test(id)) return 'vendor'
              if (/quasar/.test(id)) return 'ui'
              if (/supabase|@supabase/.test(id)) return 'db'
              if (/lodash|dayjs|marked/.test(id)) return 'utils'
              if (/hls\.js/.test(id)) return 'video'
              return 'vendor'
            }
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['src/**/*.test.js'],
      setupFiles: ['./src/test/setup.js'],
    },
  }
})
