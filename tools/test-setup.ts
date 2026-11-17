import { afterEach, beforeEach } from 'vite-plus/test'
import { config } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'

let pinia: Pinia
let plugins: typeof config.global.plugins
beforeEach(() => {
  plugins = config.global.plugins
  pinia = createPinia()
  setActivePinia(pinia)
  config.global.plugins = [...plugins, pinia]
})
afterEach(() => {
  config.global.plugins = plugins
  disposePinia(pinia)
})
