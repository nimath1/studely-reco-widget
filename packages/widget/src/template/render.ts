/**
 * Rendu SSR du gabarit, chargé uniquement par le plugin Vite
 * `recoTemplate()` (vite.config.ts) dans un serveur Node middleware —
 * ce module n'est jamais importé par le bundle `reco.js` : seul le HTML
 * produit (`template.generated.txt`) est embarqué.
 */
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import WidgetTemplate from './WidgetTemplate.vue'

export async function renderWidgetTemplate(): Promise<string> {
  return renderToString(createSSRApp(WidgetTemplate))
}
