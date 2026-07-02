import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/{core,server}/src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['packages/{core,server}/src/**/*.ts'] },
  },
})
