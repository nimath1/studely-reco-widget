/**
 * Fil de conversation : entrées clonées depuis les templates
 * `[data-reco-template]` (bulle utilisateur, bulle assistant, chips de
 * suggestions, CTA conseiller), squelette « en cours » et carte erreur
 * persistants. Conteneur scrollable `[data-reco-body]`, région live
 * `role="log"` — chaque ajout est annoncé (§8.2).
 */
import type { ChatReply } from '../api/types'
import type { Translate } from '../i18n/labels'
import { HANDOFF_FIELDS } from './handoff'
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
 * Épingle le fil en bas tant que l'utilisateur ne remonte pas lui-même.
 * Le simple scrollEnd à l'ajout ne suffit pas : fonts et re-layouts
 * (panneau fermé → ouvert, chargement différé) font grandir le contenu
 * après coup — la restauration remplit le fil pendant que le panneau
 * fermé donne une hauteur nulle. ResizeObserver réapplique le scroll si
 * le fil était déjà collé en bas ; un scroll utilisateur vers le haut
 * désépingle jusqu'à ce qu'il redescende.
 */
export function pinScrollEnd(el: HTMLElement, signal: AbortSignal): void {
  const body = el.querySelector<HTMLElement>('[data-reco-body]')
  if (!body || typeof ResizeObserver !== 'function') return
  let pinned = true
  // L'épingle ne saute que sur geste utilisateur (molette, toucher,
  // clavier) — jamais sur un simple événement scroll : le clamp du
  // navigateur pendant l'animation d'ouverture en émet, et ils
  // désépingleraient le fil sans que l'utilisateur ait rien demandé.
  // Redescendre tout en bas ré-épingle via l'écouteur scroll.
  const unpin = () => {
    pinned = false
  }
  // Molette vers le haut seulement : un coup de molette vers le bas alors
  // que le fil est déjà tout en bas ne doit pas désépingler.
  body.addEventListener(
    'wheel',
    (event) => {
      if ((event as WheelEvent).deltaY < 0) unpin()
    },
    { signal, passive: true }
  )
  // Tactile : le doigt glissant vers le bas remonte le fil vers les
  // messages anciens — inversement il ne fait rien quand le fil est déjà
  // en bas, donc seule cette direction désépingle.
  let touchY: number | null = null
  body.addEventListener(
    'touchstart',
    (event) => {
      touchY = (event as TouchEvent).touches[0]?.clientY ?? null
    },
    { signal, passive: true }
  )
  body.addEventListener(
    'touchmove',
    (event) => {
      const y = (event as TouchEvent).touches[0]?.clientY
      if (touchY !== null && y !== undefined && y > touchY) unpin()
      touchY = y ?? touchY
    },
    { signal, passive: true }
  )
  body.addEventListener('keydown', unpin, { signal, passive: true })
  body.addEventListener(
    'scroll',
    () => {
      // Seuil généreux : les arrondis subpixel ne doivent pas empêcher la
      // ré-épingle quand l'utilisateur redescend tout en bas.
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 40) pinned = true
    },
    { signal, passive: true }
  )
  const observer = new ResizeObserver(() => {
    if (pinned) scrollEnd(el)
  })
  observer.observe(body)
  const thread = el.querySelector<HTMLElement>('[data-reco-thread]')
  if (thread) observer.observe(thread)
  signal.addEventListener('abort', () => observer.disconnect(), { once: true })
}

/**
 * « Nouvelle discussion » n'a de sens qu'avec une conversation en cours :
 * visible dès qu'une entrée concrète (hors accueil) est dans le fil.
 */
function syncEraseVisibility(el: HTMLElement): void {
  const container = thread(el)
  const empty =
    !container || !container.hasChildNodes() || container.hasAttribute('data-reco-virgin')
  el.querySelector('[data-reco-erase]')?.toggleAttribute('hidden', empty)
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
  syncEraseVisibility(el)
  return node
}

/** Bulle utilisateur : le texte saisi, tel quel (jamais interprété). */
export function appendUser(el: HTMLElement, text: string): void {
  const card = cloneTemplate(el, 'msg-user')
  if (!card) return
  fillField(card, 'text', text)
  // Le fil n'est plus vierge : le min-height d'accueil tombe pour que le
  // squelette « en cours » colle à la dernière bulle.
  thread(el)?.removeAttribute('data-reco-virgin')
  append(el, card)
}

/**
 * Bulle assistant : texte + citations ; refus explicite (`out_of_scope`)
 * affiche le texte du bot ou le message `reco.empty`, et la sortie
 * conseiller reste à portée (CTA sous la bulle, §4). Partagé entre la
 * réponse complète et la fin d'une bulle streamée.
 */
function fillReply(
  el: HTMLElement,
  card: HTMLElement,
  reply: ChatReply,
  t: Translate
): { pieces: number; links: number } {
  const rejected = reply.meta.out_of_scope === true || reply.meta.intent === 'out_of_scope'
  const text = rejected && !reply.text.trim() ? t('reco.empty') : reply.text
  const { pieces, links } = fillAssistantEntry(
    card,
    rejected ? text : reply.text,
    // Only `final.citations` — the sources the bot actually used (« retenue »).
    // `event: sources` is the whole retrieval list, uncited entries included:
    // never shown, they would point the user to off-topic pages.
    reply.meta.citations ?? []
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
  // Pouces 👍/👎 sous la bulle : le `turn_id` de l'événement `final` est
  // requis pour noter le tour — absent, la ligne n'existe pas.
  const slot = card.querySelector('[data-reco-field="feedback"]')
  if (slot && reply.meta.turn_id) {
    const row = cloneTemplate(el, 'turn-feedback')
    if (row) {
      row.dataset.recoTurnId = reply.meta.turn_id
      fillField(row, 'up-label', t('reco.feedback.up'))
      fillField(row, 'down-label', t('reco.feedback.down'))
      slot.append(row)
    }
  }
  return { pieces, links }
}

/** Réponse déjà complète : bulle remplie d'un coup puis insérée au fil. */
export function appendAssistant(
  el: HTMLElement,
  reply: ChatReply,
  t: Translate
): { pieces: number; links: number } {
  const card = cloneTemplate(el, 'msg-assistant')
  if (!card) return { pieces: 0, links: 0 }
  const result = fillReply(el, card, reply, t)
  append(el, card)
  return result
}

/**
 * Confirmation de mise en relation restaurée (ticket déjà créé avant le
 * rechargement) : simple bulle assistant avec le texte de confirmation.
 */
export function appendHandoffConfirm(el: HTMLElement, t: Translate): void {
  const card = cloneTemplate(el, 'msg-assistant')
  if (!card) return
  fillField(card, 'text', t('reco.handoff.confirm'))
  append(el, card)
}

/**
 * Bulle assistant posée vide puis remplie au fil des deltas SSE :
 * `update` re-rend le Markdown accumulé, `finish` applique la réponse
 * finale (citations, refus out-of-scope, CTA) comme `appendAssistant`.
 */
export interface AssistantStream {
  update: (text: string) => void
  finish: (reply: ChatReply, t: Translate) => { pieces: number; links: number }
}

export function beginAssistantStream(el: HTMLElement): AssistantStream | null {
  const card = cloneTemplate(el, 'msg-assistant')
  if (!card) return null
  append(el, card)
  return {
    update(text: string): void {
      fillAssistantEntry(card, text, [])
      scrollEnd(el)
    },
    finish(reply: ChatReply, t: Translate): { pieces: number; links: number } {
      const result = fillReply(el, card, reply, t)
      scrollEnd(el)
      return result
    }
  }
}

function firstEmptyInput(form: Element): HTMLElement | null {
  const inputs = [...form.querySelectorAll<HTMLInputElement>('[data-reco-input]')]
  return inputs.find((i) => !i.value.trim()) ?? inputs[0] ?? null
}

/**
 * Mise en relation : une seule carte formulaire à la fois — un second
 * déclencheur refocalise la carte existante plutôt que d'empiler.
 * `created` dit si la carte vient d'être posée — seule
 * une nouvelle carte est pré-remplie.
 */
export function appendHandoffForm(
  el: HTMLElement,
  t: Translate
): { card: HTMLElement; created: boolean } | null {
  const existing = el.querySelector<HTMLElement>('[data-reco-thread] [data-reco-handoff]')
  if (existing) {
    firstEmptyInput(existing)?.focus()
    scrollEnd(el)
    const card = existing.closest<HTMLElement>('[data-reco-msg]')
    return card ? { card, created: false } : null
  }
  const card = cloneTemplate(el, 'handoff-form')
  if (!card) return null
  // Clé absente : le texte FR du gabarit reste (jamais la clé affichée).
  const fill = (field: string, key: string) => {
    const label = t(key)
    if (label !== key) fillField(card, field, label)
  }
  fill('text', 'reco.handoff.intro')
  fill('handoff-submit', 'reco.handoff.submit')
  fill('handoff-attachments-label', 'reco.handoff.attachments')
  fill('handoff-attach-cta', 'reco.handoff.attach')
  for (const field of HANDOFF_FIELDS) fill(`handoff-${field}-label`, `reco.handoff.${field}`)
  append(el, card)
  firstEmptyInput(card)?.focus()
  return { card, created: true }
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
  // L'accueil garde l'étincelle d'origine — le logo de marque ne marque
  // que les réponses de l'assistant dans le fil.
  const avatar = card.querySelector('[data-reco-avatar]')
  if (avatar) {
    const doc = avatar.ownerDocument
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'currentColor')
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute(
      'd',
      'M12 2.6 13.8 8l5.4 1.8-5.4 1.8L12 17.2 10.2 11.6 4.8 9.8 10.2 8 12 2.6ZM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z'
    )
    svg.append(path)
    avatar.replaceChildren(svg)
  }
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
  // L'accueil seul prend toute la hauteur (centrage `margin-block: auto`).
  // Posé avant l'ajout pour que la visibilité de « Nouvelle discussion »
  // soit calculée sur l'état final.
  thread(el)?.setAttribute('data-reco-virgin', '')
  append(el, card)
}

/** Squelette « analyse en cours », puis scroll. */
export function showPending(el: HTMLElement, t: Translate): void {
  const node = el.querySelector<HTMLElement>('[data-reco-pending]')
  if (!node) return
  fillField(node, 'pending-text', t('reco.pending'))
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
  syncEraseVisibility(el)
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
