import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/vite-env.d.ts'],
      reporter: ['text', ['lcov', { file: 'lcov.info' }]],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85
      }
    }
  }
})
