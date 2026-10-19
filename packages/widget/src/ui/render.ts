/**
 * Clonage et remplissage des templates Webflow `[data-reco-template]`
 * (§10.2). Données injectées via textContent uniquement (§7.4).
 */
import type { RecoOptions, RecoRecommendation } from '../api/types'

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
    const select = item.querySelector<HTMLSelectElement>('[data-reco-field="level"]')
    if (select) {
      select.name = `reco-language-${language.id}`
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
 * Remplit `[data-reco-results]` d'une carte par recommandation (3 à 5, 0 à 4
 * étiquettes). Les cartes dont l'URL sort de studely.com sont écartées ; le
 * score de l'API n'est jamais affiché. Renvoie le nombre de cartes rendues :
 * zéro doit basculer le widget en `empty`.
 */
export function renderResults(el: HTMLElement, items: RecoRecommendation[]): number {
  const container = el.querySelector('[data-reco-results]')
  if (!container) return 0
  container.replaceChildren()
  let rendered = 0
  for (const item of items) {
    if (!isAllowedUrl(item.url)) continue
    if (rendered >= 5) break
    const card = cloneTemplate(el, 'result-card')
    if (!card) break
    fillField(card, 'type', item.type ?? '')
    fillField(card, 'title', item.title)
    fillField(card, 'destination', item.destination ?? '')
    fillField(card, 'reason', item.reason ?? '')
    fillField(card, 'url', item.url ?? '')
    const list = card.querySelector('[data-reco-field="tags"]')
    const tagTemplate = list?.querySelector('[data-reco-template="tag"]')
    if (list && tagTemplate) {
      list.replaceChildren()
      for (const tag of (item.tags ?? []).slice(0, 4)) {
        const tagItem = tagTemplate.cloneNode(true)
        if (tagItem instanceof HTMLElement) {
          delete tagItem.dataset.recoTemplate
          tagItem.textContent = tag
          list.append(tagItem)
        }
      }
    }
    container.append(card)
    rendered += 1
  }
  return rendered
}
