/**
 * Fil de conversation : entrées clonées depuis les templates
 * `[data-reco-template]` (bulle utilisateur, bulle assistant, chips de
 * suggestions, CTA conseiller), squelette « en cours » et carte erreur
 * persistants. Conteneur scrollable `[data-reco-body]`, région live
 * `role="log"` — chaque ajout est annoncé (§8.2).
 */
import type { ChatReply } from '../api/types'
import type { Translate } from '../i18n/labels'
import { cloneTemplate, fillAssistantEntry, fillField } from './render'

/** Nombre de chips « amorce » proposées sous le message d'accueil. */
const SUGGESTION_COUNT = 5

function thread(el: HTMLElement): HTMLElement | null {
  return el.querySelector<HTMLElement>('[data-reco-thread]')
}

/** Garde le fil collé en bas : le dernier message reste visible. */
export function scrollEnd(el: HTMLElement): void {
  const body = el.querySelector<HTMLElement>('[data-reco-body]')
  if (body) body.scrollTop = body.scrollHeight
}

/**
 * Ajoute une entrée au fil. `afterAppend` est appelé après insertion pour
 * que le scroll voie la hauteur finale du contenu rempli.
 */
function append(el: HTMLElement, node: HTMLElement | null): HTMLElement | null {
  const container = thread(el)
  if (!node || !container) return null
  container.append(node)
  scrollEnd(el)
  return node
}

/** Bulle utilisateur : le texte saisi, tel quel (jamais interprété). */
export function appendUser(el: HTMLElement, text: string): void {
  const card = cloneTemplate(el, 'msg-user')
  if (!card) return
  fillField(card, 'text', text)
  append(el, card)
}

/**
 * Bulle assistant : texte + citations ; refus explicite (`out_of_scope`)
 * affiche le texte du bot ou le message `reco.empty`, et la sortie
 * conseiller reste à portée (CTA sous la bulle, §4).
 */
export function appendAssistant(
  el: HTMLElement,
  reply: ChatReply,
  t: Translate
): { pieces: number; links: number } {
  const card = cloneTemplate(el, 'msg-assistant')
  if (!card) return { pieces: 0, links: 0 }
  const rejected = reply.meta.out_of_scope === true || reply.meta.intent === 'out_of_scope'
  const text = rejected && !reply.text.trim() ? t('reco.empty') : reply.text
  const { pieces, links } = fillAssistantEntry(
    card,
    rejected ? text : reply.text,
    // `event: sources` lists every retrieved source; `final.citations`
    // only those actually cited — union (URL dedupe happens downstream).
    [...(reply.meta.sources ?? []), ...(reply.meta.citations ?? [])]
  )
  if (pieces === 0) {
    // Réponse vide : la bulle garde au moins le message « aucun parcours ».
    fillAssistantEntry(card, t('reco.empty'), [])
  }
  const actions = card.querySelector('[data-reco-field="actions"]')
  // Sans réponse exploitable, le bot propose toujours la sortie conseiller.
  const noAnswer = !reply.text.trim() && links === 0
  if (actions && (rejected || reply.meta.handoff_proposed === true || noAnswer)) {
    const cta = cloneTemplate(el, 'advisor-cta')
    if (cta) {
      fillField(cta, 'label', t('reco.advisor'))
      actions.append(cta)
    }
  }
  append(el, card)
  return { pieces, links }
}

/**
 * Mise en relation : une seule carte formulaire à la fois — un second
 * déclencheur refocalise la carte existante plutôt que d'empiler.
 */
export function appendHandoffForm(el: HTMLElement, t: Translate): HTMLElement | null {
  const existing = el.querySelector<HTMLElement>('[data-reco-thread] [data-reco-handoff]')
  if (existing) {
    existing.querySelector<HTMLElement>('[data-reco-input]')?.focus()
    scrollEnd(el)
    return existing.closest('[data-reco-msg]')
  }
  const card = cloneTemplate(el, 'handoff-form')
  if (!card) return null
  fillField(card, 'text', t('reco.handoff.intro'))
  fillField(card, 'handoff-submit', t('reco.handoff.submit'))
  // Implicit wrapping labels may carry their own translated text spans.
  fillField(card, 'handoff-name-label', t('reco.handoff.name'))
  fillField(card, 'handoff-email-label', t('reco.handoff.email'))
  const name = card.querySelector<HTMLInputElement>('[data-reco-input="handoff-name"]')
  const email = card.querySelector<HTMLInputElement>('[data-reco-input="handoff-email"]')
  if (name) name.placeholder = t('reco.handoff.name')
  if (email) email.placeholder = t('reco.handoff.email')
  append(el, card)
  name?.focus()
  return card
}

/**
 * Message d'accueil local (jamais envoyé à l'API) : bulle assistant +
 * chips d'amorce — chaque chip envoie son libellé comme message
 * utilisateur (`data-reco-send`, traité par le clic délégué).
 */
export function greet(el: HTMLElement, t: Translate): void {
  const card = cloneTemplate(el, 'msg-assistant')
  if (!card) return
  // Greeting marker: the CSS gives a generous welcome layout while the
  // card is the only thread entry (:only-child).
  card.dataset.recoGreeting = ''
  fillField(card, 'text', t('reco.greeting'))
  const slot = card.querySelector('[data-reco-field="suggestions"]')
  if (slot) {
    slot.replaceChildren()
    for (let i = 1; i <= SUGGESTION_COUNT; i += 1) {
      const label = t(`reco.suggestion.${i}`)
      // Clé absente : le libellé retourné est la clé elle-même — pas de chip.
      if (label === `reco.suggestion.${i}`) continue
      const chip = cloneTemplate(el, 'suggestion')
      if (!chip) break
      fillField(chip, 'label', label)
      chip.dataset.recoSend = label
      slot.append(chip)
    }
    if (!slot.hasChildNodes()) slot.remove()
  }
  append(el, card)
}

/** Squelette « analyse en cours » (avec bouton Arrêter), puis scroll. */
export function showPending(el: HTMLElement, t: Translate): void {
  const node = el.querySelector<HTMLElement>('[data-reco-pending]')
  if (!node) return
  fillField(node, 'pending-text', t('reco.pending'))
  fillField(node, 'stop-label', t('reco.stop'))
  node.hidden = false
  scrollEnd(el)
}

export function hidePending(el: HTMLElement): void {
  const node = el.querySelector<HTMLElement>('[data-reco-pending]')
  if (node) node.hidden = true
}

/** Carte « indisponible » en pied de fil : Réessayer + conseiller (E9). */
export function showError(el: HTMLElement, t: Translate, message: string): void {
  const node = el.querySelector<HTMLElement>('[data-reco-error]')
  if (!node) return
  const set = (selector: string, value: string) => {
    const target = node.querySelector<HTMLElement>(selector)
    if (target) target.textContent = value
  }
  set('[data-reco-error-title]', t('reco.error.title'))
  set('[data-reco-error-message]', message)
  fillField(node, 'retry-label', t('reco.retry'))
  fillField(node, 'advisor-label', t('reco.advisor'))
  node.hidden = false
  scrollEnd(el)
}

export function hideError(el: HTMLElement): void {
  const node = el.querySelector<HTMLElement>('[data-reco-error]')
  if (node) node.hidden = true
}

/** « Nouvelle recherche » : le fil repart de zéro (accueil re-greeter). */
export function clearThread(el: HTMLElement): void {
  thread(el)?.replaceChildren()
  hidePending(el)
  hideError(el)
}

/**
 * Chips d'amorce déjà posées : (dé)activées à la main — les clones créés
 * après le mount petite-vue ne reçoivent pas de directive `:disabled`.
 */
export function setChipsEnabled(el: HTMLElement, enabled: boolean): void {
  el.querySelectorAll<HTMLButtonElement>('[data-reco-send]').forEach((chip) => {
    chip.disabled = !enabled
  })
}
