/**
 * Bootstrap du widget : détecte les `[data-reco-widget]` et les initialise
 * à l'approche de l'écran (§7.5). Les exports de ce module deviennent
 * `window.StudelyReco` (build IIFE, §7.6) — n'exporter que l'API publique.
 */
import { version as pkgVersion } from '../package.json'
import { fetchOptions, postRecommendations, RecoApiError } from './api/client'
import type { RecommendationsRequest } from './api/types'
import { readConfig, type WidgetConfig } from './config'
import { CONSENT_VERSION } from './consent/consent'
import { ensureChallenge, resetChallenge, turnstileToken } from './consent/turnstile'
import { makeFormatters } from './i18n/format'
import { readLabels } from './i18n/labels'
import { logger } from './logger'
import { RecoMachine, stepOf, STEP_COUNT, type WidgetState } from './state/machine'
import { emitRecoEvent, trackReco } from './tracking/events'
import { renderOptions, renderResults, resetInputs } from './ui/render'
import {
  applyAnswers,
  buildProfile,
  clearDraft,
  clearFieldError,
  collectAnswers,
  loadDraft,
  MAX_FIELDS,
  saveDraft,
  showFieldError,
  stepOfField,
  updateStepChrome,
  validateStep
} from './ui/steps'

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

// Clés i18n des erreurs API (§5.3) ; `forbidden` = échec du défi Turnstile.
const ERROR_KEYS: Record<RecoApiError['kind'], string> = {
  network: 'reco.error.network',
  rate: 'reco.error.rate',
  server: 'reco.error.server',
  input: 'reco.error.input',
  forbidden: 'reco.error.captcha'
}

/**
 * Câblage d'un bloc : machine à états, actions `data-reco-action`, options
 * et soumission à l'API, brouillon sessionStorage. Tout repose sur le
 * `signal` : un `init` suivant retire proprement écouteurs et minuteurs.
 */
function mount(el: HTMLElement, config: WidgetConfig, signal: AbortSignal): void {
  const t = readLabels(el)
  const fmt = makeFormatters(config.locale)
  const machine = new RecoMachine(el, 'intro')
  const draft = loadDraft(config.origin)

  // Le lien conseiller est disponible dans tous les états (§4).
  el.querySelectorAll<HTMLAnchorElement>('[data-reco-action="advisor"]').forEach((link) => {
    link.href = config.advisorUrl
  })

  let lastPayload: RecommendationsRequest | null = null
  let lastFailure: 'options' | 'submit' | null = null
  let retryLockUntil = 0
  /** Échecs captcha consécutifs : relance du défi au 1er, erreur au 2e (§9.1). */
  let captchaFailures = 0
  /** Horodatage du dernier envoi, pour `duration_ms` du tracking (§9.2). */
  let submittedAt: number | null = null
  let lastResultCount: number | undefined

  trackReco(el, { locale: config.locale, origin: config.origin, version: pkgVersion }, signal, {
    getDurationMs: () => (submittedAt === null ? undefined : Date.now() - submittedAt),
    getResultCount: () => lastResultCount
  })

  /** Annonces lecteur d'écran : changement d'étape et erreurs (§8.2). */
  const live = el.querySelector('[data-reco-live]')
  const announce = (text: string) => {
    if (live) live.textContent = text
  }

  const persist = () =>
    saveDraft({
      origin: config.origin,
      step: stepOf(machine.state) ?? 1,
      answers: collectAnswers(el)
    })

  function syncChrome(): void {
    const step = stepOf(machine.state)
    if (step !== null) {
      updateStepChrome(el, step, t, fmt.number)
      announce(t('reco.progress', { step: fmt.number(step), total: fmt.number(STEP_COUNT) }))
      const legend = el.querySelector<HTMLElement>(`[data-reco-step="${step}"] legend`)
      legend?.focus()
      // Le script Turnstile n'est chargé qu'à l'arrivée sur l'étape 5 (§9.1).
      if (step === STEP_COUNT) void ensureChallenge(el, signal)
    }
  }

  /** Focus sur le titre du panel (results, empty, error) : le focus ne se perd pas. */
  function focusPanel(state: WidgetState): void {
    const title = el.querySelector<HTMLElement>(
      `[data-reco-panel="${state}"] :is(h1, h2, h3, h4, h5, h6, [data-reco-title])`
    )
    if (!title) return
    title.tabIndex = -1
    title.focus()
  }

  function showError(error: unknown): void {
    const kind = error instanceof RecoApiError ? error.kind : 'network'
    const message = el.querySelector('[data-reco-error-message]')
    if (message) {
      message.textContent = t(ERROR_KEYS[kind])
      announce(t(ERROR_KEYS[kind]))
    }
    machine.dispatch('error')
    focusPanel('error')
  }

  async function loadOptions(): Promise<void> {
    lastFailure = null
    try {
      const options = await fetchOptions(config.locale, config.origin)
      if (signal.aborted) return
      renderOptions(el, options)
      if (draft) {
        applyAnswers(el, draft.answers)
        if (draft.step >= 1 && draft.step <= STEP_COUNT) {
          machine.goTo(`step-${draft.step}` as WidgetState, 'resume')
        }
      }
      syncChrome()
    } catch (error) {
      if (signal.aborted) return
      lastFailure = 'options'
      showError(error)
    }
  }

  /** Mention « recommandations indicatives » avec son lien, si l'API le fournit. */
  function renderDisclaimer(url: string | undefined): void {
    const link = el.querySelector<HTMLAnchorElement>('[data-reco-disclaimer]')
    if (!link) return
    link.hidden = !url
    if (url) {
      link.href = url
      link.textContent = t('reco.disclaimer')
    }
  }

  /** Envoie le dernier payload : résultats, empty ou mapping d'erreur §5.3. */
  async function sendPayload(): Promise<void> {
    submittedAt = Date.now()
    try {
      const { items, disclaimerUrl } = await postRecommendations(lastPayload!, turnstileToken(el))
      if (signal.aborted) return
      captchaFailures = 0
      const count = renderResults(el, items)
      lastResultCount = count
      if (count === 0) {
        machine.dispatch('empty')
        announce(t('reco.empty'))
        focusPanel('empty')
      } else {
        renderDisclaimer(disclaimerUrl)
        machine.dispatch('results')
        announce(t('reco.results.count', { count: fmt.number(count) }))
        focusPanel('results')
      }
    } catch (error) {
      if (signal.aborted) return
      lastFailure = 'submit'
      if (error instanceof RecoApiError && error.kind === 'forbidden' && captchaFailures === 0) {
        // Premier 403 : relance du défi et retour à l'étape 5 — l'erreur
        // reco.error.captcha n'apparaît qu'au second échec (§9.1).
        captchaFailures += 1
        resetChallenge(el)
        machine.goTo('step-5')
        syncChrome()
        return
      }
      if (handleFieldError(error)) return
      if (error instanceof RecoApiError && error.kind === 'rate') {
        lockRetry(error.retryAfter ?? 0)
      }
      showError(error)
    }
  }

  /** 400 avec champ : retour à l'étape du champ fautif, message dessous. */
  function handleFieldError(error: unknown): boolean {
    if (!(error instanceof RecoApiError) || error.kind !== 'input' || !error.field) return false
    const step = stepOfField(error.field)
    if (step === null) {
      logger.error('Champ 400 inconnu :', error.field)
      return false
    }
    machine.goTo(`step-${step}` as WidgetState)
    const name = error.field.replace(/^profile\./, '').split('.')[0] ?? ''
    showFieldError(el, name, t('reco.error.input'))
    syncChrome()
    return true
  }

  /** « Réessayer » désactivé pendant Retry-After (R9). */
  function lockRetry(seconds: number): void {
    retryLockUntil = Date.now() + seconds * 1000
    const button = el.querySelector<HTMLButtonElement>('[data-reco-action="retry"]')
    if (!button) return
    button.disabled = true
    const timer = setTimeout(() => {
      button.disabled = false
    }, seconds * 1000)
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  }

  async function submitProfile(): Promise<void> {
    lastPayload = {
      locale: config.locale,
      origin: config.origin,
      profile: buildProfile(collectAnswers(el)),
      consent: { accepted: true, version: CONSENT_VERSION }
    }
    lastFailure = null
    machine.dispatch('submit')
    announce(t('reco.loading'))
    await sendPayload()
  }

  function retry(): void {
    if (Date.now() < retryLockUntil) return
    machine.dispatch('retry')
    announce(t('reco.loading'))
    void (lastFailure === 'submit' && lastPayload ? sendPayload() : loadOptions())
  }

  function next(step: number | null): void {
    if (step === null || !validateStep(el, step, collectAnswers(el), t)) return
    machine.dispatch('next')
    persist()
    syncChrome()
  }

  function submit(): void {
    if (!validateStep(el, STEP_COUNT, collectAnswers(el), t, true)) return
    persist()
    void submitProfile()
  }

  function restart(): void {
    clearDraft()
    captchaFailures = 0
    lastResultCount = undefined
    resetInputs(el)
    el.querySelectorAll('[data-reco-error-for]').forEach((node) => {
      node.textContent = ''
    })
    machine.dispatch('restart')
    syncChrome()
  }

  function handleAction(action: string, step: number | null): void {
    switch (action) {
      case 'start':
      case 'back':
      case 'edit':
        machine.dispatch(action)
        syncChrome()
        break
      case 'next':
        next(step)
        break
      case 'submit':
        submit()
        break
      case 'restart':
        restart()
        break
      case 'retry':
        retry()
        break
      case 'advisor':
        emitRecoEvent(el, 'advisor', { from: machine.state })
        break
    }
  }

  el.addEventListener(
    'click',
    (event) => {
      const trigger = (event.target as Element | null)?.closest?.('[data-reco-action]')
      if (!(trigger instanceof HTMLElement) || !el.contains(trigger)) return
      handleAction(trigger.dataset.recoAction ?? '', stepOf(machine.state))
    },
    { signal }
  )

  // Brouillon sauvegardé à chaque modification ; 4e domaine refusé (§5.1).
  el.addEventListener(
    'change',
    (event) => {
      const input = event.target
      const container = (input as Element | null)?.closest?.('[data-reco-options]')
      const field = container instanceof HTMLElement ? container.dataset.recoOptions : undefined
      if (field) clearFieldError(el, field)
      if (input instanceof HTMLInputElement && input.closest('[data-reco-input="consent"]')) {
        clearFieldError(el, 'consent')
      }
      if (field === 'fields' && input instanceof HTMLInputElement && input.checked) {
        const checked = el.querySelectorAll('[data-reco-options="fields"] input:checked')
        if (checked.length > MAX_FIELDS) {
          input.checked = false
          showFieldError(el, 'fields', t('reco.error.fields.max'))
        }
      }
      persist()
    },
    { signal }
  )
  el.addEventListener('input', persist, { signal })

  // Le bouton submit est un vrai submit : la navigation native est bloquée.
  el.querySelector('form')?.addEventListener('submit', (event) => event.preventDefault(), {
    signal
  })

  void loadOptions()
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
  doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR).forEach(initWhenNear)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrap(document), { once: true })
  } else {
    bootstrap(document)
  }
}
