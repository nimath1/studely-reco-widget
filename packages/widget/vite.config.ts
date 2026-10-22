import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { createServer, defineConfig, loadEnv, type ResolvedConfig, type ViteDevServer } from 'vite'

const API_URL_VAR = 'VITE_RECO_API_URL'
// Extension .txt, pas .html : en dev le middleware Vite servirait un
// .html?raw comme page (avec /@vite/client injecté), pas comme chaîne.
const TEMPLATE_OUT = 'src/template.generated.txt'

/**
 * Rend les SFC de `src/template/**` en HTML statique (SSR via
 * @vitejs/plugin-vue + createSSRApp, sans runtime Vue dans le bundle) et
 * écrit `src/template.generated.txt`, importé `?raw` par
 * src/ui/template.ts. Appelée par le plugin au démarrage du build/dev et
 * directement par vitest.config.ts (qui épingle vite@7, d'où l'appel hors
 * plugin). En dev, un changement de .vue régénère puis recharge la page.
 */
export async function renderTemplateFile(root: string): Promise<void> {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    // cacheDir dédié : un serveur Vite imbriqué partageant le .vite du
    // serveur dev invaliderait son optimizer en boucle (504 "Outdated
    // Optimize Dep" sur les imports dynamiques, ex. mock/browser.ts).
    cacheDir: join(root, 'node_modules/.reco-template'),
    server: { middlewareMode: true },
    plugins: [vue()]
  })
  try {
    const mod = await server.ssrLoadModule('/src/template/render.ts')
    const html: string = await mod.renderWidgetTemplate()
    writeFileSync(join(root, TEMPLATE_OUT), `${html.replace(/>\s+</g, '><').trim()}\n`)
  } finally {
    await server.close()
  }
}

export function recoTemplate() {
  let root = ''
  return {
    name: 'reco-template',
    configResolved(config: ResolvedConfig) {
      root = config.root
    },
    async buildStart() {
      await renderTemplateFile(root)
    },
    configureServer(server: ViteDevServer) {
      // `dir/` avec séparateur : `src/template.generated.txt` (sortie) ne
      // doit pas matcher `src/template` (entrées) — sinon boucle de
      // régénération → rechargements pleine page infinis.
      const dir = join(root, 'src/template')
      const inside = `${dir}/`
      server.watcher.add(dir)
      server.watcher.on('all', (event: string, file?: string) => {
        if (!file?.startsWith(inside) || event === 'addDir') return
        void renderTemplateFile(root)
          .then(() => server.ws.send({ type: 'full-reload' }))
          .catch((error: unknown) => server.config.logger.error(String(error)))
      })
    }
  }
}

// L'URL de l'API est fixée au build par environnement, jamais lue depuis la
// page (§7.4) : un build sans URL HTTPS valide échoue plutôt que de livrer
// un widget qui ne peut appeler personne.
export function assertApiUrl(mode: string): void {
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
    // Tailwind compile src/widget.css (liée par index.html) en dev ; le
    // build lib n'embarque aucun CSS dans reco.js. recoTemplate génère le
    // gabarit HTML importé ?raw par le bundle.
    plugins: [tailwindcss(), recoTemplate()],
    server: {
      // Dev : les appels `/chat` du widget partent en même-origine et sont
      // relayés au chatbot réel — pas de CORS côté navigateur, la vraie
      // API est testable localement sans mock (`?recoMock=` reste prioritaire).
      proxy: {
        // Même cible pour /chat (envoi) et /users + /conversations (handoff).
        ...Object.fromEntries(
          ['/chat', '/users', '/conversations'].map((path) => [
            path,
            {
              target:
                process.env.VITE_RECO_PROXY_TARGET ??
                loadEnv(mode, process.cwd(), 'VITE_').VITE_RECO_PROXY_TARGET ??
                'https://chatbot.dev.ml.studely.com',
              changeOrigin: true
            }
          ])
        )
      }
    },
    build: {
      outDir: 'dist',
      // Bundle IIFE pur : public/ (worker MSW de dev, fonts, logo) n'a rien
      // à faire dans dist — les assets sont servis par le site (dist-site).
      copyPublicDir: false,
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
