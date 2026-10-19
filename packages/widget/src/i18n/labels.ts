/**
 * Lecture des libellés fixes depuis le bloc `[data-reco-labels]` traduit
 * par Webflow Localization (§8.1).
 */
import { logger } from '../logger'

export type Translate = (key: string, vars?: Record<string, string | number>) => string

function collect(
  el: HTMLElement,
  selector: string,
  keyOf: (node: HTMLElement) => string | undefined
): Map<string, string> {
  const map = new Map<string, string>()
  el.querySelectorAll(selector).forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const key = keyOf(node)
    if (key) map.set(key, node.textContent ?? '')
  })
  return map
}

/**
 * Retourne la fonction de traduction du bloc : `t('reco.progress', { step: 2 })`
 * remplace les `{variables}` du libellé.
 *
 * Clé absente : `console.warn` nommant la clé, puis repli sur le libellé FR
 * miroir `[data-reco-label-fr]` quand le composant en fournit un, sinon la
 * clé telle quelle — jamais un texte en dur (§8.1).
 */
export function readLabels(el: HTMLElement): Translate {
  const labels = collect(el, '[data-reco-labels] [data-reco-label]', (n) => n.dataset.recoLabel)
  const fallbackFr = collect(el, '[data-reco-label-fr]', (n) => n.dataset.recoLabelFr)
  return (key, vars) => {
    let text = labels.get(key)
    if (text === undefined) {
      logger.warn('clé i18n absente :', key)
      text = fallbackFr.get(key) ?? key
    }
    for (const [name, value] of Object.entries(vars ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }
}
