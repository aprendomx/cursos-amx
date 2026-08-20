import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

// Los 34 archivos .ts del proyecto NO pasaban por ESLint: la configuración
// anterior solo declaraba `files: ['**/*.{js,vue}']`, así que el 35% del
// código tipado quedaba sin analizar. `vue-tsc` comprueba tipos, que es otra
// cosa: no detecta variables sin usar, promesas sin await ni `any` implícito
// en posiciones que TypeScript tolera.

export default [
  ...pluginVue.configs['flat/recommended'],

  // Reglas comunes a todo el código de la aplicación.
  {
    files: ['**/*.{js,ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      'vue/no-v-html': 'off',
      'no-console': 'off',
    },
  },

  // TypeScript. Se usa la configuración `recommended` sin comprobación de
  // tipos (`recommendedTypeChecked` exigiría un `project` y multiplicaría el
  // tiempo de lint); de los tipos ya se encarga `npm run type-check`.
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    rules: {
      // El código heredado usa `any` en las respuestas de supabase-js. Se deja
      // como aviso, no como error, para que la migración pueda ir por fases
      // sin bloquear el CI. Ver docs/migracion-typescript.md.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Las pruebas pueden ser más laxas: los mocks viven de `any`.
  {
    files: ['**/*.{test,spec}.{js,ts}', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    ignores: [
      'dist/',
      'node_modules/',
      '.worktrees/',
      'docker/volumes/',
      'coverage/',
      // Las Edge Functions son Deno: otro runtime, otros globales y otras
      // rutas de import (URLs). Se analizan con `deno check`, no aquí.
      'supabase/functions/',
    ],
  },
]
