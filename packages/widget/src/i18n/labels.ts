/**
 * Lecture des libellés fixes depuis le bloc `[data-reco-labels]` traduit
 * par Webflow Localization (§8.1).
 */

export type Translate = (key: string, vars?: Record<string, string | number>) => string

/**
 * Retourne la fonction de traduction du bloc : `t('reco.progress', { step: 2 })`
 * remplace les `{variables}` du libellé. Une clé absente est renvoyée telle
 * quelle — visible en recette, jamais un texte en dur (§8.1).
 */
export function readLabels(el: HTMLElement): Translate {
  const labels = new Map<string, string>()
  el.querySelectorAll('[data-reco-label]').forEach((node) => {
    const key = node.getAttribute('data-reco-label')
    if (key) labels.set(key, node.textContent ?? '')
  })
  return (key, vars) => {
    let text = labels.get(key) ?? key
    for (const [name, value] of Object.entries(vars ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }
}
