/**
 * Clonage et remplissage des templates `[data-reco-template]` (§10.2).
 * Données injectées via textContent uniquement (§7.4).
 */
import type { ChatCitation } from '../api/types'

/** Clone d'un template, sans l'attribut qui le ferait masquer par le CSS. */
export function cloneTemplate(el: HTMLElement, name: string): HTMLElement | null {
  const clone = el.querySelector(`[data-reco-template="${name}"]`)?.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return null
  delete clone.dataset.recoTemplate
  return clone
}

/**
 * Remplit un `data-reco-field` : texte via textContent (jamais interprété),
 * `href` pour un champ posé sur un lien.
 */
export function fillField(root: HTMLElement, name: string, value: string): void {
  const node = root.querySelector(`[data-reco-field="${name}"]`)
  if (node instanceof HTMLAnchorElement) node.href = value
  else if (node) node.textContent = value
}

/** Une citation ne mène que vers une page du site : https sur studely.com (R10). */
export function isAllowedUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'studely.com' || parsed.hostname === 'www.studely.com')
    )
  } catch {
    return false
  }
}

/**
 * Remplit une entrée assistant (`msg-assistant`) : texte + liens de
 * citations — filtrés comme les cartes (https studely.com uniquement,
 * R10) — construits par createElement, jamais de HTML injecté (§7.4).
 * `pieces` = texte + liens affichés ; `links` = citations retenues.
 */
export function fillAssistantEntry(
  card: HTMLElement,
  text: string,
  citations: ChatCitation[] | undefined
): { pieces: number; links: number } {
  const links = (citations ?? []).filter((citation) => isAllowedUrl(citation.url)).slice(0, 5)
  if (!text.trim() && links.length === 0) return { pieces: 0, links: 0 }
  const body = card.querySelector('[data-reco-field="text"]') ?? card
  body.textContent = text.trim()
  const list = card.querySelector('[data-reco-field="links"]')
  if (list) {
    list.replaceChildren()
    for (const citation of links) {
      const link = document.createElement('a')
      link.href = citation.url!
      link.textContent = citation.title?.trim() || citation.url!
      link.target = '_blank'
      link.rel = 'noopener'
      list.append(link)
    }
  }
  return { pieces: links.length + (text.trim() ? 1 : 0), links: links.length }
}
