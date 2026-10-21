/* eslint-disable no-restricted-properties -- fixture de test : monte le squelette §10.3 d'un coup. */
/**
 * Squelette DOM de dev repris du §10.3 (comme index.html) pour les specs :
 * coquille chat (fil + composer + templates), sans le gabarit généré —
 * le bloc porte déjà `[data-reco-panel]` donc l'injection ne le remplit
 * pas (même garde-fou que l'embed complet).
 */

export const VALID_ATTRS = 'data-reco-origin="mexique" data-reco-advisor-url="/mexique#contact"'

export function mountWidget(attrs: string = VALID_ATTRS): HTMLElement {
  document.body.innerHTML = `
    <section data-reco-widget ${attrs}>
      <header><button type="button" data-reco-close>Fermer</button></header>
      <div data-reco-live class="sr-only"></div>
      <div data-reco-body>
        <div data-reco-thread role="log"></div>
        <div data-reco-pending hidden>
          <div data-reco-msg="assistant">
            <div data-reco-bubble data-reco-pending-status>
              <div role="status" aria-live="polite" aria-atomic="true">
                <div data-reco-dots aria-hidden="true"><i></i><i></i><i></i></div>
                <p data-reco-field="pending-text"></p>
              </div>
              <button type="button" data-reco-action="stop" data-reco-field="stop-label"></button>
            </div>
          </div>
        </div>
        <div data-reco-error hidden>
          <div data-reco-error-card>
            <h3 data-reco-error-title></h3>
            <p data-reco-error-message></p>
            <div>
              <button type="button" data-reco-action="retry" data-reco-field="retry-label"></button>
              <button type="button" data-reco-action="advisor" data-reco-field="advisor-label"></button>
            </div>
          </div>
        </div>
        <div data-reco-panel="fallback"><a href="/x">Conseiller</a></div>
      </div>
      <form data-reco-composer novalidate>
        <label data-reco-consent>
          <input type="checkbox" data-reco-input="consent" />
          <span data-reco-field="consent-label"></span>
        </label>
        <div data-reco-turnstile></div>
        <div data-reco-input-row>
          <label for="reco-message"><span data-reco-field="input-label"></span></label>
          <textarea id="reco-message" data-reco-input="message" rows="1"></textarea>
          <button type="submit" data-reco-action="send"></button>
        </div>
        <p data-reco-disclaimer></p>
      </form>
      <div data-reco-templates hidden>
        <div data-reco-template="msg-user" data-reco-msg="user">
          <p data-reco-field="text"></p>
        </div>
        <div data-reco-template="msg-assistant" data-reco-msg="assistant">
          <div data-reco-bubble>
            <div data-reco-field="text"></div>
            <div data-reco-field="suggestions"></div>
            <div data-reco-field="links"></div>
            <div data-reco-field="actions"></div>
          </div>
        </div>
        <button type="button" data-reco-template="suggestion" data-reco-send>
          <span data-reco-field="label"></span>
        </button>
        <button type="button" data-reco-template="advisor-cta" data-reco-action="advisor">
          <span data-reco-field="label"></span>
        </button>
        <div data-reco-template="handoff-form" data-reco-msg="assistant">
          <div data-reco-bubble>
            <p data-reco-field="text"></p>
            <form data-reco-handoff novalidate>
              <label>
                <span class="sr-only" data-reco-field="handoff-name-label">Nom complet</span>
                <input type="text" data-reco-input="handoff-name" />
              </label>
              <label>
                <span class="sr-only" data-reco-field="handoff-email-label">E-mail</span>
                <input type="email" data-reco-input="handoff-email" />
              </label>
              <button type="submit" data-reco-action="handoff" data-reco-field="handoff-submit"></button>
            </form>
            <p data-reco-field="handoff-error" hidden></p>
          </div>
        </div>
      </div>
      <div data-reco-labels hidden>
        <span data-reco-label="reco.greeting">Bonjour, comment puis-je vous aider ?</span>
        <span data-reco-label="reco.suggestion.1">Bachelor en Europe</span>
        <span data-reco-label="reco.suggestion.2">Master à l'étranger</span>
        <span data-reco-label="reco.suggestion.3">Étudier en anglais</span>
        <span data-reco-label="reco.suggestion.4">Étudier en France</span>
        <span data-reco-label="reco.suggestion.5">Parler à un conseiller</span>
        <span data-reco-label="reco.consent">J'accepte l'analyse automatique</span>
        <span data-reco-label="reco.consent.continuation">En continuant, vous acceptez l'analyse automatique de vos messages pour vous proposer des parcours.</span>
        <span data-reco-label="reco.input.label">Décris ton projet</span>
        <span data-reco-label="reco.input.placeholder">Ton projet…</span>
        <span data-reco-label="reco.send">Envoyer</span>
        <span data-reco-label="reco.reset">Nouvelle recherche</span>
        <span data-reco-label="reco.pending">Analyse…</span>
        <span data-reco-label="reco.stop">Arrêter</span>
        <span data-reco-label="reco.retry">Réessayer</span>
        <span data-reco-label="reco.advisor">Parler à un conseiller</span>
        <span data-reco-label="reco.error.title">Assistant indisponible.</span>
        <span data-reco-label="reco.error.consent">Consentement requis</span>
        <span data-reco-label="reco.error.network">Réseau</span>
        <span data-reco-label="reco.error.rate">Trop de demandes</span>
        <span data-reco-label="reco.error.server">Serveur</span>
        <span data-reco-label="reco.error.input">Saisie invalide</span>
        <span data-reco-label="reco.error.captcha">Captcha échoué</span>
        <span data-reco-label="reco.disclaimer">Recommandations indicatives.</span>
        <span data-reco-label="reco.results.count">{count} recommandations</span>
        <span data-reco-label="reco.empty">Aucun parcours</span>
        <span data-reco-label="reco.handoff.intro">Laisse tes coordonnées pour la mise en relation.</span>
        <span data-reco-label="reco.handoff.name">Ton nom</span>
        <span data-reco-label="reco.handoff.email">Ton adresse e-mail</span>
        <span data-reco-label="reco.handoff.submit">Envoyer ma demande</span>
        <span data-reco-label="reco.handoff.confirm">C'est noté ! Un conseiller te contactera.</span>
        <span data-reco-label="reco.handoff.invalid">Nom et e-mail valides requis.</span>
      </div>
    </section>`
  const el = document.querySelector<HTMLElement>('[data-reco-widget]')
  if (!el) throw new Error('fixture sans widget')
  return el
}
