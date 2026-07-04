import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import theme from './theme/theme.config.js'

const themeHtmlPlugin = () => ({
  name: 'theme-html',
  transformIndexHtml(html) {
    return html
      .replaceAll('%THEME_TITLE%', `${theme.app.name} · ${theme.app.tagline}`)
      .replaceAll('%THEME_DESCRIPTION%', theme.app.description)
      .replaceAll('%THEME_COLOR%', theme.pwa.themeColor)
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const plugins = [
    themeHtmlPlugin(),
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: `${theme.app.name} · ${theme.app.tagline}`,
        short_name: theme.app.shortName,
        description: theme.app.description,
        theme_color: theme.pwa.themeColor,
        background_color: theme.pwa.backgroundColor,
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
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
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (/vue|pinia|vue-router/.test(id)) return 'vendor'
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
