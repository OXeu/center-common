import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  plugins: [vue()],
  cacheDir: '.tmp/vite',
  test: { environment: 'jsdom', include: ['web/ui/__tests__/**/*.test.ts'] },
  lint: {
    plugins: ['typescript', 'vue'],
    ignorePatterns: ['node_modules/**', '.tmp/**'],
    rules: { 'no-var': 'error', 'prefer-const': 'error', 'no-eval': 'error' },
  },
  fmt: { semi: false, singleQuote: true, ignorePatterns: ['node_modules/**', '.tmp/**'] },
})
