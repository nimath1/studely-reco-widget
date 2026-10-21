/**
 * Gabarit du widget : le markup (header, panels, étapes, templates,
 * launcher) est produit au build par les SFC `src/template/**`
 * (`template.generated.txt`, rendu SSR statique) puis injecté dans le
 * conteneur `[data-reco-widget]` de la page hôte — plus rien à copier
 * dans l'embed Webflow hors config, bloc `[data-reco-labels]` et styles.
 *
 * Un bloc qui porte déjà ses panels (ancien embed complet, fixture de
 * test) n'est pas rempli une seconde fois : le DOM existant prime.
 * Le bloc `[data-reco-labels]` posé par l'embed n'est jamais remplacé.
 */
import templateHtml from '../template.generated.txt?raw'

/** Posé sur chaque nœud injecté dans le conteneur. */
const INJECTED = 'data-reco-injected'
/** Posé sur les nœuds injectés hors du conteneur (launcher, sibling). */
const INJECTED_SIBLING = 'data-reco-injected-sibling'

/**
 * Remplit `el` du gabarit s'il est vide de panels. Parsing via
 * `DOMParser` (ni `innerHTML` ni `insertAdjacentHTML`, §7.4) : la chaîne
 * est un artefact de build statique, jamais une donnée d'API.
 * Idempotent — un second appel ne duplique rien.
 */
export function injectTemplate(el: HTMLElement): void {
  if (el.querySelector(`[${INJECTED}]`) || el.querySelector('[data-reco-panel]')) return
  const doc = el.ownerDocument
  const parsed = new DOMParser().parseFromString(templateHtml, 'text/html')
  for (const node of Array.from(parsed.body.childNodes)) {
    if (node.nodeType !== 1) continue
    const child = doc.importNode(node as HTMLElement, true)
    if (child.hasAttribute('data-reco-launcher')) {
      // Le launcher reste un sibling du conteneur (fixe, hors dialog).
      if (!el.parentElement) continue
      child.setAttribute(INJECTED_SIBLING, '')
      el.insertAdjacentElement('afterend', child)
    } else {
      child.setAttribute(INJECTED, '')
      el.appendChild(child)
    }
  }
}
