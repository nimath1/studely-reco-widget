/**
 * Défi Cloudflare Turnstile (§9.1) : script chargé paresseusement à l'arrivée
 * sur l'étape 5 — jamais avant — puis rendu dans `[data-reco-turnstile]`.
 * La site key est une variable publique de build (aucun secret côté client).
 */
import { logger } from '../logger'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; 'error-callback'?: () => void }
      ) => string
      getResponse: (widgetId: string) => string | undefined
      reset: (widgetId: string) => void
    }
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// Lecture paresseuse : la valeur peut être remplacée par le test.
const siteKey = () => import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

let scriptPromise: Promise<void> | null = null
const widgets = new WeakMap<HTMLElement, string>()

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('script Turnstile indisponible'))
    document.head.append(script)
  })
  return scriptPromise
}

/**
 * Rend le défi dans `[data-reco-turnstile]` à la première arrivée sur
 * l'étape 5. Sans site key configurée (dev, mock) : no-op.
 */
export async function ensureChallenge(el: HTMLElement, signal?: AbortSignal): Promise<void> {
  const key = siteKey()
  const container = el.querySelector<HTMLElement>('[data-reco-turnstile]')
  if (!key || !container || widgets.has(el)) return
  try {
    await loadScript()
    if (signal?.aborted || widgets.has(el) || !window.turnstile) return
    widgets.set(
      el,
      window.turnstile.render(container, {
        sitekey: key,
        'error-callback': () => logger.warn('défi Turnstile en échec')
      })
    )
  } catch (error) {
    logger.warn('Turnstile non chargé :', error instanceof Error ? error.message : error)
  }
}

/** Jeton du défi courant, `undefined` sans widget rendu ni réponse. */
export function turnstileToken(el: HTMLElement): string | undefined {
  const id = widgets.get(el)
  return (id && window.turnstile?.getResponse(id)) || undefined
}

/** Relance un défi après un 403 (CAPTCHA_FAILED côté API). */
export function resetChallenge(el: HTMLElement): void {
  const id = widgets.get(el)
  if (id) window.turnstile?.reset(id)
}
