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
      srcDir: 'src',
      filename: 'sw.js',
      strategies: 'injectManifest',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
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
      include: ['src/**/*.test.{js,ts}', 'src/**/*.spec.{js,ts}'],
      setupFiles: ['./src/test/setup.js'],
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'html', 'lcov'],
        include: ['src/**/*.{js,ts,vue}'],
        exclude: ['src/test/**', 'src/**/*.{test,spec}.{js,ts}', 'src/sw.js', 'src/main.js'],
        // Trinquete: apenas debajo de la cobertura actual (~35% líneas).
        // Subir gradualmente hacia ~60% conforme se añadan tests.
        thresholds: {
          statements: 31,
          branches: 23,
          functions: 29,
          lines: 33,
        },
      },
    },
  }
})
