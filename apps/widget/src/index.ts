/**
 * Bootstrap du widget : détecte les `[data-reco-widget]` et les initialise
 * à l'approche de l'écran (§7.5). Les exports de ce module deviennent
 * `window.StudelyReco` (build IIFE, §7.6) — n'exporter que l'API publique.
 */
import { version as pkgVersion } from '../package.json'
import { readConfig, type WidgetConfig } from './config'
import { logger } from './logger'

export const version: string = pkgVersion

const WIDGET_SELECTOR = '[data-reco-widget]'
// Aucun appel réseau tant que le bloc n'est pas à moins de 200 px de l'écran.
const LAZY_ROOT_MARGIN = '200px'

/**
 * (Ré)initialise un bloc, par exemple après une interaction Webflow.
 * Config invalide : le bloc reste sur son panel `fallback` (CTA conseiller).
 */
export function init(el: HTMLElement): WidgetConfig | null {
  let config: WidgetConfig
  try {
    config = readConfig(el)
  } catch (error) {
    logger.warn(error)
    return null
  }

  if (config.dir === 'rtl') el.setAttribute('dir', 'rtl')
  else el.removeAttribute('dir')

  return config
}

function initWhenNear(el: HTMLElement): void {
  if (typeof IntersectionObserver !== 'function') {
    init(el)
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        init(el)
      }
    },
    { rootMargin: LAZY_ROOT_MARGIN }
  )
  observer.observe(el)
}

function bootstrap(doc: Document): void {
  doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR).forEach(initWhenNear)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrap(document), { once: true })
  } else {
    bootstrap(document)
  }
}
