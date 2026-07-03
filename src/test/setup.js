import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// Global setup for Vue Test Utils
config.global.plugins = [createPinia()]

// Reset Pinia before each test
beforeEach(() => {
  setActivePinia(createPinia())
})
