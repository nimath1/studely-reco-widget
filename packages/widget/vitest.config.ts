import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { renderTemplateFile } from './vite.config'

// Génère template.generated.txt avant la première transformation : les
// specs qui importent src/index.ts en ont besoin. Appel direct, pas un
// plugin — vitest épingle vite@7, le widget vite@8.
await renderTemplateFile(dirname(fileURLToPath(import.meta.url)))

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    // Valeur fixe et non joignable : les tests ne dépendent d'aucun environnement.
    env: { VITE_RECO_API_URL: 'https://api.reco.test' },
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.d.ts'],
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
