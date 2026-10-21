import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { assertApiUrl, recoTemplate } from './vite.config'

/**
 * "Site" build (Vercel): index.html becomes the public reference page,
 * with reco.js deployed alongside it by package-release.mjs.
 * `publicDir: false` — the dev MSW worker and assets are copied
 * selectively by scripts/package-release.mjs (fonts + logo only).
 * Same target as the bundle (§7.6) and same HTTPS API URL guard.
 */
export default defineConfig(({ command, mode }) => {
  if (command === 'build') assertApiUrl(mode)

  return {
    // Compile le <link> src/widget.css d'index.html en asset hashé du site ;
    // recoTemplate génère le gabarit importé par le module du script inline.
    plugins: [tailwindcss(), recoTemplate()],
    publicDir: false,
    build: {
      outDir: 'dist-site',
      target: ['es2020', 'safari15']
    }
  }
})
