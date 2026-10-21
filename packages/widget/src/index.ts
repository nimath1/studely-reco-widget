/**
 * Bootstrap du widget : détecte les `[data-reco-widget]` et les initialise
 * à l'approche de l'écran (§7.5). Les exports de ce module deviennent
 * `window.StudelyReco` (build IIFE, §7.6) — n'exporter que l'API publique.
 */
import { version as pkgVersion } from '../package.json'
import {
  clearChatSession,
  loadChatSession,
  postChat,
  RecoApiError,
  saveChatSession
} from './api/client'
import type { ChatReply } from './api/types'
import { readConfig, type WidgetConfig } from './config'
import { ensureChallenge, resetChallenge, turnstileToken } from './consent/turnstile'
import { readLabels, type Translate } from './i18n/labels'
import { logger } from './logger'
import { emitRecoEvent, trackReco } from './tracking/events'
import { injectTemplate } from './ui/template'
import {
  appendAssistant,
  appendHandoffForm,
  appendUser,
  clearThread,
  greet,
  hideError,
  hidePending,
  setChipsEnabled,
  showError,
  showPending
} from './ui/thread'
import { fillField } from './ui/render'
import { mountView } from './ui/view'

export const version: string = pkgVersion

const WIDGET_SELECTOR = '[data-reco-widget]'
// Aucun appel réseau tant que le bloc n'est pas à moins de 200 px de l'écran.
const LAZY_ROOT_MARGIN = '200px'

/** `data-reco-state` : seul le consentement distingue deux phases (§5.1). */
type WidgetPhase = 'consent' | 'chat'

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

// Clés i18n des erreurs API (§5.3) ; `forbidden` = échec du défi Turnstile.
const ERROR_KEYS: Record<RecoApiError['kind'], string> = {
  network: 'reco.error.network',
  rate: 'reco.error.rate',
  server: 'reco.error.server',
  input: 'reco.error.input',
  forbidden: 'reco.error.captcha'
}

/** Textes statiques du gabarit passés par le bloc de libellés traduit. */
const STATIC_LABELS: [field: string, key: string][] = [['input-label', 'reco.input.label']]

/**
 * Câblage d'un bloc : conversation pilotée par les templates
 * `data-reco-*`, envoi libre vers POST /chat (SSE), session continuée,
 * consentement et défi Turnstile avant le premier envoi. Tout repose sur
 * le `signal` : un `init` suivant retire proprement écouteurs, minuteurs
 * et effets réactifs.
 */
function mount(el: HTMLElement, config: WidgetConfig, signal: AbortSignal): void {
  const t: Translate = readLabels(el)
  const view = mountView(el)
  signal.addEventListener('abort', view.unmount, { once: true })

  let phase: WidgetPhase = 'consent'
  const setPhase = (to: WidgetPhase, name: string) => {
    if (phase === to) return
    emitRecoEvent(el, name, { from: phase, to })
    phase = to
    el.dataset.recoState = to
  }

  /** La session /chat continue d'un envoi à l'autre (retry compris). */
  let sessionId = loadChatSession(config.origin)
  let retryLockUntil = 0
  /** Échecs captcha consécutifs : relance du défi au 1er, erreur au 2e (§9.1). */
  let captchaFailures = 0
  /** Timestamp of the last send, for the tracking `duration_ms` (§9.2). */
  let submittedAt: number | null = null
  let lastResultCount: number | undefined
  /** Dernier message utilisateur envoyé — « Réessayer » le reposte tel quel. */
  let lastMessage = ''
  /** Generation of the in-flight request: restart or a new send makes a
      pending reply stale — it must write neither UI nor session. */
  let generation = 0
  /** Annulation « Arrêter la réponse » de l'envoi courant. */
  let sendAbort: AbortController | null = null

  trackReco(el, { locale: config.locale, origin: config.origin, version: pkgVersion }, signal, {
    getDurationMs: () => (submittedAt === null ? undefined : Date.now() - submittedAt),
    getResultCount: () => lastResultCount
  })

  /** Annonces lecteur d'écran : erreurs et consentement (§8.2). */
  const announce = (text: string) => {
    view.state.live = text
  }

  // Libellés du gabarit remplacés par la traduction du bloc — les clés
  // absentes gardent le texte FR du gabarit (jamais la clé affichée).
  for (const [field, key] of STATIC_LABELS) {
    const label = t(key)
    if (label !== key) fillField(el, field, label)
  }
  // Deux gabarits de consentement coexistent : la case héritée garde la
  // clé `reco.consent`, la notice « continuation » a la sienne — l'une ne
  // doit jamais écraser l'autre.
  const legacyConsent = t('reco.consent')
  if (legacyConsent !== 'reco.consent') {
    el.querySelectorAll<HTMLElement>('[data-reco-field="consent-label"]').forEach((node) => {
      if (node.closest('[data-reco-consent="continuation"]')) return
      node.textContent = legacyConsent
    })
  }
  const continuationNotice = el.querySelector<HTMLElement>(
    '[data-reco-consent="continuation"] [data-reco-field="consent-label"], [data-reco-consent="continuation"][data-reco-field="consent-label"]'
  )
  if (continuationNotice) {
    const notice = t('reco.consent.continuation')
    if (notice !== 'reco.consent.continuation') continuationNotice.textContent = notice
  }
  const composer = el.querySelector<HTMLTextAreaElement>('[data-reco-input="message"]')
  if (composer) {
    const placeholder = t('reco.input.placeholder')
    if (placeholder !== 'reco.input.placeholder') composer.placeholder = placeholder
  }
  const sendButton = el.querySelector<HTMLElement>('[data-reco-action="send"]')
  if (sendButton) {
    const label = t('reco.send')
    if (label !== 'reco.send') sendButton.setAttribute('aria-label', label)
  }
  const disclaimer = el.querySelector<HTMLElement>('[data-reco-disclaimer]')
  if (disclaimer) disclaimer.textContent = t('reco.disclaimer')

  function consentGranted(granted: boolean): void {
    view.state.consent = granted
    if (granted) {
      setPhase('chat', 'consent')
      // Le script Turnstile n'est chargé qu'au déblocage (§9.1) : le jeton
      // a le temps d'être prêt avant le premier envoi.
      void ensureChallenge(el, signal)
      composer?.focus()
    } else {
      setPhase('consent', 'consent_revoked')
    }
  }

  function showErrorCard(error: unknown): void {
    const kind = error instanceof RecoApiError ? error.kind : 'network'
    const message = t(ERROR_KEYS[kind])
    showError(el, t, message)
    emitRecoEvent(el, 'error', { kind })
    announce(message)
  }

  /** Termine un envoi : squelette retiré, saisie et chips réactivées. */
  function settleSend(): void {
    sendAbort = null
    view.state.pending = false
    hidePending(el)
    setChipsEnabled(el, true)
  }

  /** Réponse /chat affichée : bulle assistant, ou refus out-of-scope. */
  function showReply(reply: ChatReply): void {
    const rejected = reply.meta.out_of_scope === true || reply.meta.intent === 'out_of_scope'
    const { pieces, links } = appendAssistant(el, reply, t)
    lastResultCount = links > 0 ? links : pieces
    if (rejected) {
      emitRecoEvent(el, 'empty')
      announce(t('reco.empty'))
    } else {
      emitRecoEvent(el, 'reply', { count: lastResultCount })
      announce(t('reco.results.count', { count: lastResultCount }))
    }
  }

  /**
   * POST /chat pour `message` (déjà affiché dans le fil). Appelé par
   * l'envoi utilisateur, « Réessayer » et la relance captcha — n'ajoute
   * jamais de bulle utilisateur lui-même.
   */
  async function sendPayload(message: string): Promise<void> {
    submittedAt = Date.now()
    const gen = ++generation
    hideError(el)
    view.state.pending = true
    setChipsEnabled(el, false)
    showPending(el, t)
    sendAbort = new AbortController()
    try {
      const reply = await postChat(message, sessionId, turnstileToken(el), sendAbort.signal)
      if (signal.aborted || gen !== generation) return
      captchaFailures = 0
      if (reply.meta.session_id) {
        sessionId = reply.meta.session_id
        saveChatSession(config.origin, sessionId)
      }
      settleSend()
      showReply(reply)
    } catch (error) {
      if (signal.aborted || gen !== generation) return
      settleSend()
      handleSendError(error, message)
    }
  }

  /**
   * Erreur d'envoi : AbortError (Arrêter) silencieux ; 1er 403 → défi
   * relancé et message reposté une fois ; 429 → verrou Retry-After ;
   * sinon carte erreur en pied de fil.
   */
  function handleSendError(error: unknown, message: string): void {
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (error instanceof RecoApiError && error.kind === 'forbidden' && captchaFailures === 0) {
      // Premier 403 : le défi est relancé puis le même message repart —
      // l'erreur reco.error.captcha n'apparaît qu'au second échec (§9.1).
      captchaFailures += 1
      resetChallenge(el)
      void sendPayload(message)
      return
    }
    if (error instanceof RecoApiError && error.kind === 'rate') {
      lockRetry(error.retryAfter ?? 0)
    }
    showErrorCard(error)
  }

  /** « Réessayer » désactivé pendant Retry-After (R9). */
  function lockRetry(seconds: number): void {
    retryLockUntil = Date.now() + seconds * 1000
    view.state.retryLocked = true
    const timer = setTimeout(() => {
      view.state.retryLocked = false
    }, seconds * 1000)
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  }

  /** Envoi utilisateur : bulle dans le fil puis requête — la double porte. */
  function send(message: string, via: 'text' | 'suggestion' = 'text'): void {
    const text = message.trim()
    if (!text || view.state.pending) return
    if (!view.state.consent) {
      // Mode continuation : l'action d'envoi (texte ou chip d'amorce)
      // vaut consentement — accordé ici, jamais à l'init. Le gabarit à
      // case garde son blocage et son annonce.
      if (view.state.continuation) consentGranted(true)
      else {
        announce(t('reco.error.consent'))
        return
      }
    }
    lastMessage = text
    appendUser(el, text)
    emitRecoEvent(el, 'send', { via })
    void sendPayload(text)
  }

  function retry(): void {
    // Retry n'existe que depuis la carte erreur — un envoi en cours ou un
    // délai Retry-After ne doit jamais produire de POST doublon.
    if (view.state.pending || Date.now() < retryLockUntil || !lastMessage) return
    emitRecoEvent(el, 'retry')
    void sendPayload(lastMessage)
  }

  function stop(): void {
    if (!sendAbort) return
    emitRecoEvent(el, 'stop')
    sendAbort.abort()
  }

  /**
   * « Nouvelle recherche » : fil vidé, session /chat oubliée (le contexte
   * du bot ne doit pas mélanger deux demandes), accueil reposé. Le
   * consentement reste acquis — il a été donné pour la session.
   */
  function restart(): void {
    generation += 1
    sendAbort?.abort()
    sendAbort = null
    clearThread(el)
    captchaFailures = 0
    lastResultCount = undefined
    lastMessage = ''
    sessionId = null
    clearChatSession(config.origin)
    view.state.pending = false
    emitRecoEvent(el, 'reset')
    greet(el, t)
  }

  /**
   * Mise en relation : valide nom + e-mail puis transmet — POST JSON vers
   * `data-reco-handoff-url` quand l'endpoint est configuré, sinon repli
   * sur la page conseiller (coordonnées passées en query, nouvel onglet).
   * La carte se transforme en confirmation ; échec réseau → message dans
   * la carte et saisie réactivée.
   */
  async function submitHandoff(form: HTMLFormElement): Promise<void> {
    const nameInput = form.querySelector<HTMLInputElement>('[data-reco-input="handoff-name"]')
    const emailInput = form.querySelector<HTMLInputElement>('[data-reco-input="handoff-email"]')
    const name = nameInput?.value.trim() ?? ''
    const email = emailInput?.value.trim() ?? ''
    const invalid = !name || !email || (emailInput ? !emailInput.checkValidity() : true)
    const errorField = form.parentElement?.querySelector<HTMLElement>(
      '[data-reco-field="handoff-error"]'
    )
    if (invalid) {
      if (errorField) {
        errorField.textContent = t('reco.handoff.invalid')
        errorField.hidden = false
      }
      announce(t('reco.handoff.invalid'))
      return
    }
    const controls = form.querySelectorAll('input, button')
    controls.forEach((control) => ((control as HTMLButtonElement).disabled = true))
    let delivered = false
    if (config.handoffUrl) {
      try {
        const response = await fetch(config.handoffUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, session_id: sessionId, origin: config.origin })
        })
        delivered = response.ok
      } catch {
        delivered = false
      }
    } else {
      const target = new URL(config.advisorUrl, el.ownerDocument.location.href)
      target.searchParams.set('nom', name)
      target.searchParams.set('email', email)
      el.ownerDocument.defaultView?.open(target.toString(), '_blank', 'noopener')
      delivered = true
    }
    if (!delivered) {
      controls.forEach((control) => ((control as HTMLButtonElement).disabled = false))
      if (errorField) {
        errorField.textContent = t('reco.error.network')
        errorField.hidden = false
      }
      announce(t('reco.error.network'))
      return
    }
    const card = form.closest<HTMLElement>('[data-reco-msg]')
    if (card) {
      card.querySelector('[data-reco-bubble]')?.replaceChildren()
      fillField(card, 'text', t('reco.handoff.confirm'))
      if (!card.querySelector('[data-reco-field="text"]')) {
        const p = document.createElement('p')
        p.dataset.recoField = 'text'
        p.textContent = t('reco.handoff.confirm')
        card.querySelector('[data-reco-bubble]')?.append(p)
      }
    }
    emitRecoEvent(el, 'handoff', { mode: config.handoffUrl ? 'api' : 'redirect' })
    announce(t('reco.handoff.confirm'))
  }

  /** « Parler à un conseiller » : le mini-formulaire rejoint le fil. */
  function proposeHandoff(): void {
    emitRecoEvent(el, 'advisor', { from: phase })
    const card = appendHandoffForm(el, t)
    if (!card) {
      // Gabarit sans le template : repli sur le lien direct.
      el.ownerDocument.defaultView?.open(config.advisorUrl, '_blank', 'noopener')
    }
  }

  function handleAction(action: string, trigger: HTMLElement): void {
    switch (action) {
      case 'send':
        send(composer?.value ?? '')
        if (composer) composer.value = ''
        break
      case 'retry':
        retry()
        break
      case 'stop':
        stop()
        break
      case 'reset':
        restart()
        break
      case 'advisor':
        proposeHandoff()
        break
      default:
        // Chip d'amorce : son libellé part comme message utilisateur.
        if (trigger.dataset.recoSend) send(trigger.dataset.recoSend, 'suggestion')
    }
  }

  el.addEventListener(
    'click',
    (event) => {
      const trigger = (event.target as Element | null)?.closest?.(
        '[data-reco-action], [data-reco-send]'
      )
      if (!(trigger instanceof HTMLElement) || !el.contains(trigger)) return
      const action = trigger.dataset.recoAction ?? ''
      if (action === 'send') event.preventDefault()
      handleAction(action, trigger)
    },
    { signal }
  )

  // Consentement : coche → saisie déverrouillée ; décoche → retour consent.
  el.addEventListener(
    'change',
    (event) => {
      const input = event.target
      if (input instanceof HTMLInputElement && input.matches('[data-reco-input="consent"]')) {
        consentGranted(input.checked)
      }
    },
    { signal }
  )

  // Saisie : hauteur auto (3 lignes max via CSS), Entrée envoie, Maj+Entrée
  // garde le saut de ligne. La soumission native couvre le bouton clavier.
  composer?.addEventListener(
    'input',
    () => {
      composer.style.height = 'auto'
      composer.style.height = `${composer.scrollHeight}px`
    },
    { signal }
  )
  composer?.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        composer.closest('form')?.requestSubmit()
      }
    },
    { signal }
  )
  // Soumissions déléguées : composer en bas, formulaire de mise en
  // relation cloné dans le fil (présent seulement après un CTA conseiller).
  el.addEventListener(
    'submit',
    (event) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement) || !el.contains(form)) return
      event.preventDefault()
      if (form.matches('[data-reco-handoff]')) void submitHandoff(form)
      else {
        send(composer?.value ?? '')
        if (composer) composer.value = ''
      }
    },
    { signal }
  )

  // Phase initiale : un consentement pré-coché ouvre directement le chat.
  el.dataset.recoState = view.state.consent ? 'chat' : 'consent'
  phase = el.dataset.recoState === 'chat' ? 'chat' : 'consent'
  if (phase === 'chat') void ensureChallenge(el, signal)
  // Accueil seulement si le fil est vide — un gabarit hôte pré-rempli ou
  // une ré-init gardent leurs entrées.
  if (!el.querySelector('[data-reco-thread]')?.hasChildNodes()) greet(el, t)
}

/**
 * Origin of the deployed `reco.js` bundle, read from the page's own
 * `<script>` tag — no configured site URL needed, so the same Webflow
 * embed resolves its assets on webflow.io, preview deploys, or a future
 * custom domain. Empty when the bundle didn't come from a script tag
 * (e.g. dev entry or tests).
 */
function bundleOrigin(doc: Document): string {
  for (const script of doc.scripts) {
    if (/\/reco(?:\.min)?\.js(?:[?#]|$)/.test(script.src)) {
      try {
        return new URL(script.src).origin
      } catch {
        // URL invalide : script suivant.
      }
    }
  }
  return ''
}

/**
 * The embed markup references its assets (logo `<img>`, Montserrat
 * `url('/fonts/…')` in the scoped `<style>`) as root-relative paths that
 * only exist on the deployment — they 404 on the Webflow host. Rewritten
 * to the bundle origin at init; page-relative links (advisor URL) are
 * left untouched. No-op on the deployment itself or without a script
 * tag, and idempotent across re-inits and duplicated embeds.
 */
function resolveAssets(el: HTMLElement, doc: Document): void {
  const base = bundleOrigin(doc)
  if (!base || base === doc.location?.origin) return
  // The embed container (div.w-embed on Webflow, body on the dev page)
  // holds the widget, its <style> and the launcher as siblings.
  const scope = el.parentElement ?? el
  for (const img of scope.querySelectorAll('img[src^="/"]')) {
    img.setAttribute('src', base + (img.getAttribute('src') ?? ''))
  }
  for (const styleEl of scope.querySelectorAll('style')) {
    let css = styleEl.textContent ?? ''
    for (const quote of ['', "'", '"']) {
      css = css.split(`url(${quote}/`).join(`url(${quote}${base}/`)
    }
    styleEl.textContent = css
  }
}

/**
 * (Ré)initialise un bloc, par exemple après une interaction Webflow : les
 * écouteurs de l'initialisation précédente et l'observer en attente sont
 * retirés avant de repartir, sans doublon.
 * Config invalide : le bloc reste sur son panel `fallback` (CTA conseiller).
 */
export function init(el: HTMLElement): WidgetConfig | null {
  // Le gabarit compilé remplit le bloc s'il est vide (embed squelette) ;
  // un markup complet déjà posé (ancien embed, fixture) n'est pas touché.
  injectTemplate(el)
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

  resolveAssets(el, el.ownerDocument)
  instance.controller = new AbortController()

  if (config.dir === 'rtl') el.setAttribute('dir', 'rtl')
  else el.removeAttribute('dir')

  mount(el, config, instance.controller.signal)

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
  doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR).forEach((el) => {
    // Injection immédiate (pas différée à l'approche viewport) : le
    // launcher doit être visible dès le chargement, comme le markup
    // statique qu'il remplace. Les URLs d'assets sont résolues tout de
    // suite — le logo est visible avant le mount.
    injectTemplate(el)
    resolveAssets(el, doc)
    initWhenNear(el)
  })
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrap(document), { once: true })
  } else {
    bootstrap(document)
  }
}
