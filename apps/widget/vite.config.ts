import { defineConfig } from 'vite'

// Bundle unique `reco.js` (IIFE) chargé par Webflow en `<script defer>` ;
// les exports de src/index.ts deviennent `window.StudelyReco` (§7.1, §7.6).
// `index.html` ne sert qu'au dev local : il n'entre pas dans le build lib.
export default defineConfig({
  build: {
    outDir: 'dist',
    // Safari iOS 15+ est la cible la plus ancienne du cahier (§7.6).
    target: ['es2020', 'safari15'],
    lib: {
      entry: 'src/index.ts',
      name: 'StudelyReco',
      formats: ['iife'],
      fileName: () => 'reco.js'
    }
  }
})
