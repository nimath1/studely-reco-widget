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

interface Instance {
  /** Observer en attente de l'approche de l'écran, s'il y en a un. */
  observer?: IntersectionObserver
  /** Tous les écouteurs du bloc sont attachés avec ce signal : l'annuler les retire. */
  controller?: AbortController
}

// Un état par bloc : plusieurs widgets d'une même page restent indépendants.
const instances = new WeakMap<HTMLElement, Instance>()

function instanceOf(el: HTMLElement): Instance {
  let instance = instances.get(el)
  if (!instance) {
    instance = {}
    instances.set(el, instance)
  }
  return instance
}

/**
 * (Ré)initialise un bloc, par exemple après une interaction Webflow : les
 * écouteurs de l'initialisation précédente et l'observer en attente sont
 * retirés avant de repartir, sans doublon.
 * Config invalide : le bloc reste sur son panel `fallback` (CTA conseiller).
 */
export function init(el: HTMLElement): WidgetConfig | null {
  const instance = instanceOf(el)
  instance.observer?.disconnect()
  instance.observer = undefined
  instance.controller?.abort()
  instance.controller = undefined

  let config: WidgetConfig
  try {
    config = readConfig(el)
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : error,
      '— le bloc reste sur le panel fallback.',
      el
    )
    return null
  }

  instance.controller = new AbortController()

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
      if (entries.some((entry) => entry.isIntersecting)) init(el)
    },
    { rootMargin: LAZY_ROOT_MARGIN }
  )
  instanceOf(el).observer = observer
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
