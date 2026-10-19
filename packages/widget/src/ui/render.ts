/**
 * Clonage et remplissage des templates Webflow `[data-reco-template]`
 * (§10.2). Données injectées via textContent uniquement (§7.4).
 */
import type { ChatCitation, RecoOptions } from '../api/types'

// Ids générés pour associer chaque input à son label (`id`/`for`).
let uid = 0
const nextId = () => `reco-${++uid}`

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
function fillField(root: HTMLElement, name: string, value: string): void {
  const node = root.querySelector(`[data-reco-field="${name}"]`)
  if (node instanceof HTMLAnchorElement) node.href = value
  else if (node) node.textContent = value
}

function mountChoice(
  el: HTMLElement,
  field: string,
  options: { id: string; label: string }[],
  template: 'option-radio' | 'option-checkbox'
): void {
  const container = el.querySelector(`[data-reco-options="${field}"]`)
  if (!container) return
  container.replaceChildren()
  for (const option of options) {
    const item = cloneTemplate(el, template)
    if (!item) break
    const input = item.querySelector<HTMLInputElement>('[data-reco-field="input"]')
    const label = item.querySelector('[data-reco-field="label"]')
    if (input) {
      input.id = nextId()
      input.name = `reco-${field}`
      input.value = option.id
      if (item instanceof HTMLLabelElement) item.htmlFor = input.id
    }
    if (label) label.textContent = option.label
    container.append(item)
  }
}

/**
 * Une ligne par langue proposée : libellé + select des niveaux. La langue
 * est retenue quand un niveau est choisi ; `data-reco-value` porte l'id.
 */
function mountLanguages(el: HTMLElement, options: RecoOptions): void {
  const container = el.querySelector('[data-reco-options="languages"]')
  if (!container) return
  container.replaceChildren()
  for (const language of options.languages) {
    const item = cloneTemplate(el, 'option-language')
    if (!item) break
    item.dataset.recoValue = language.id
    fillField(item, 'label', language.label)
    const label = item.querySelector('[data-reco-field="label"]')
    const select = item.querySelector<HTMLSelectElement>('[data-reco-field="level"]')
    if (select) {
      select.name = `reco-language-${language.id}`
      // Le select n'est pas dans un <label> : le libellé de la langue le nomme.
      if (label) {
        label.id = nextId()
        select.setAttribute('aria-labelledby', label.id)
      }
      select.append(new Option('', ''))
      for (const level of options.languageLevels) {
        select.append(new Option(level.label, level.id))
      }
    }
    container.append(item)
  }
}

/** Génère tous les conteneurs `data-reco-options` dans la locale active. */
export function renderOptions(el: HTMLElement, options: RecoOptions): void {
  mountChoice(el, 'level', options.levels, 'option-radio')
  mountChoice(el, 'fields', options.fields, 'option-checkbox')
  mountChoice(el, 'destinations', options.destinations, 'option-checkbox')
  mountLanguages(el, options)
  mountChoice(el, 'budget', options.budgets, 'option-radio')
  mountChoice(el, 'intake', options.intakes, 'option-radio')
}

/** Décoche les choix et vide les saisies — le brouillon repart de zéro. */
export function resetInputs(el: HTMLElement): void {
  el.querySelectorAll<HTMLInputElement>('[data-reco-options] input').forEach((input) => {
    input.checked = false
  })
  el.querySelectorAll<HTMLSelectElement>('[data-reco-options] select').forEach((select) => {
    select.value = ''
  })
  el.querySelectorAll<HTMLTextAreaElement>('[data-reco-input]').forEach((input) => {
    input.value = ''
  })
  const consent = el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')
  if (consent) consent.checked = false
}

/** Une carte ne mène que vers une page du site : https sur studely.com (R10). */
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
 * Affiche la réponse du bot dans `[data-reco-results]` : le texte va dans
 * le template `reply`, les citations deviennent des liens — filtrés comme
 * les cartes (https studely.com uniquement, R10) — construits par
 * createElement, jamais de HTML injecté (§7.4). `pieces` = texte + liens
 * affichés (zéro → panel `empty`) ; `links` = citations retenues (le
 * décompte annoncé « N recommandations »).
 */
export function renderChatReply(
  el: HTMLElement,
  text: string,
  citations: ChatCitation[] | undefined
): { pieces: number; links: number } {
  const container = el.querySelector('[data-reco-results]')
  if (!container) return { pieces: 0, links: 0 }
  container.replaceChildren()
  const links = (citations ?? []).filter((citation) => isAllowedUrl(citation.url)).slice(0, 5)
  if (!text.trim() && links.length === 0) return { pieces: 0, links: 0 }
  const card = cloneTemplate(el, 'reply') ?? cloneTemplate(el, 'result-card')
  if (!card) return { pieces: 0, links: 0 }
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
  container.append(card)
  return { pieces: links.length + (text.trim() ? 1 : 0), links: links.length }
}
