/**
 * Consentement au traitement du profil (§9.1) : case non pré-cochée et
 * version envoyée à l'API.
 */

/** Version du texte de consentement affiché par le composant Webflow. */
export const CONSENT_VERSION = '1'

/** La case `data-reco-input="consent"` est-elle cochée ? Jamais pré-cochée. */
export function readConsent(el: HTMLElement): boolean {
  const box = el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')
  return box?.checked ?? false
}
