import { defineConfig } from '@playwright/test'

/**
 * E2E sur le serveur de dev + mock MSW (`?recoMock=<scénario>`).
 * Sur le staging Webflow, pointer `BASE_URL` vers la page cible et retirer
 * le paramètre de mock — les parcours restent identiques (§12.1 phase 2).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    // Cible mobile 360 px (R14) : débordements et zones tactiles.
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 360, height: 740 } } }
  ],
  webServer: {
    command: 'pnpm dev --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
})
