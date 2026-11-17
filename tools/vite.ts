import { iconSprite } from './copy-icons.ts'
import { devPages, type DevPagesOptions } from './dev-pages.ts'
import tailwind from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite-plus'
import { resolve } from 'node:path'

export function centerConfig(options: DevPagesOptions) {
  return defineConfig(({ command }) => ({
    plugins: [iconSprite(), vue(), tailwind(), devPages(options)],
    base: command === 'build' ? '/static/app/' : '/',
    cacheDir: '.tmp/vite',
    resolve: {
      alias: { '@oxeu/center-common': resolve('.tmp/common') },
      dedupe: ['vue', '@yusufceng1z/ding'],
      preserveSymlinks: true,
    },
    server: {
      proxy: {
        '^/(api|mcp|auth|oauth|language|login|logout|static)': options.backend,
      },
    },
    build: {
      outDir: '.tmp/ui',
      emptyOutDir: true,
      manifest: true,
      sourcemap: false,
      rollupOptions: {
        input: 'web/ui/src/main.ts',
        output: {
          entryFileNames: '[name]-[hash].js',
          chunkFileNames: '[name]-[hash].js',
          assetFileNames: '[name]-[hash][extname]',
        },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['web/ui/__tests__/**/*.test.ts', 'tools/oxlint/**/*.test.ts'],
      testTimeout: 15000,
    },
    lint: {
      plugins: ['typescript', 'unicorn', 'oxc', 'vue'],
      categories: {
        correctness: 'warn',
        suspicious: 'warn',
        perf: 'warn',
      },
      env: { browser: true, es2024: true },
      ignorePatterns: ['internal/server/static/**', 'sdk/**', 'node_modules/**', '.tmp/**'],
      jsPlugins: ['vite-plus/oxlint-plugin', './.tmp/common/tools/oxlint/plugin.ts'],

      rules: {
        'center/no-page-dom-access': 'error',
        'center/no-inline-icons': 'error',
        'vite-plus/prefer-vite-plus-imports': 'error',
        'no-var': 'error',
        'prefer-const': 'error',
        eqeqeq: 'error',
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'off',
        'no-console': ['error', { allow: ['warn', 'error'] }],
        'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      },
    },
    fmt: {
      ignorePatterns: ['internal/server/static/**', 'sdk/**'],
      semi: false,
      singleQuote: true,
    },
  }))
}
