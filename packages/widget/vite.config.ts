import { defineConfig, loadEnv } from 'vite'

const API_URL_VAR = 'VITE_RECO_API_URL'

// L'URL de l'API est fixée au build par environnement, jamais lue depuis la
// page (§7.4) : un build sans URL HTTPS valide échoue plutôt que de livrer
// un widget qui ne peut appeler personne.
function assertApiUrl(mode: string): void {
  const raw = process.env[API_URL_VAR] ?? loadEnv(mode, process.cwd(), 'VITE_')[API_URL_VAR]
  let url: URL
  try {
    url = new URL(raw ?? '')
  } catch {
    throw new Error(`${API_URL_VAR} manquante ou invalide pour le mode « ${mode} »`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${API_URL_VAR} doit être en https (reçu : ${url.origin})`)
  }
}

// Bundle unique `reco.js` (IIFE) chargé par Webflow en `<script defer>` ;
// les exports de src/index.ts deviennent `window.StudelyReco` (§7.1, §7.6).
// `index.html` ne sert qu'au dev local : il n'entre pas dans le build lib.
export default defineConfig(({ command, mode }) => {
  if (command === 'build') assertApiUrl(mode)

  return {
    server: {
      // Dev : les appels `/chat` du widget partent en même-origine et sont
      // relayés au chatbot réel — pas de CORS côté navigateur, la vraie
      // API est testable localement sans mock (`?recoMock=` reste prioritaire).
      proxy: {
        '/chat': {
          target:
            process.env.VITE_RECO_PROXY_TARGET ??
            loadEnv(mode, process.cwd(), 'VITE_').VITE_RECO_PROXY_TARGET ??
            'https://chatbot.dev.ml.studely.com',
          changeOrigin: true
        }
      }
    },
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
  }
})
