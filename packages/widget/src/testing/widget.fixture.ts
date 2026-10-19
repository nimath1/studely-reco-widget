/* eslint-disable no-restricted-properties -- fixture de test : monte le squelette §10.3 d'un coup. */
/**
 * Squelette DOM de dev repris du §10.3 (comme index.html) pour les specs.
 */

export const VALID_ATTRS = 'data-reco-origin="mexique" data-reco-advisor-url="/mexique#contact"'

export function mountWidget(attrs: string = VALID_ATTRS): HTMLElement {
  document.body.innerHTML = `
    <section data-reco-widget ${attrs}>
      <div data-reco-live class="sr-only"></div>
      <div data-reco-panel="fallback"><a href="/x">Conseiller</a></div>
      <div data-reco-panel="intro">
        <button type="button" data-reco-action="start">Commencer</button>
      </div>
      <form data-reco-panel="steps" novalidate>
        <p data-reco-progress></p>
        <div><div data-reco-progress-bar></div></div>
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<fieldset data-reco-step="${n}"><legend tabindex="-1">Étape ${n}</legend></fieldset>`
          )
          .join('')}
        <button type="button" data-reco-action="back">Retour</button>
        <button type="button" data-reco-action="next">Suivant</button>
        <button type="submit" data-reco-action="submit">Voir mes recommandations</button>
      </form>
      <div data-reco-panel="loading">Chargement…</div>
      <div data-reco-panel="results">
        <h3 data-reco-title>Tes recommandations</h3>
        <div data-reco-results></div>
        <a data-reco-disclaimer hidden></a>
        <button type="button" data-reco-action="edit">Modifier</button>
        <button type="button" data-reco-action="restart">Recommencer</button>
        <a data-reco-action="advisor">Conseiller</a>
      </div>
      <div data-reco-panel="empty"><h3>Aucun parcours</h3><a data-reco-action="advisor">Conseiller</a></div>
      <div data-reco-panel="error">
        <h3>Une erreur est survenue</h3>
        <p data-reco-error-message></p>
        <button type="button" data-reco-action="retry">Réessayer</button>
        <a data-reco-action="advisor">Conseiller</a>
      </div>
      <div data-reco-template="reply">
        <p data-reco-field="text"></p>
        <div data-reco-field="links"></div>
      </div>
      <label data-reco-template="option-radio">
        <input type="radio" data-reco-field="input" /><span data-reco-field="label"></span>
      </label>
      <label data-reco-template="option-checkbox">
        <input type="checkbox" data-reco-field="input" /><span data-reco-field="label"></span>
      </label>
      <div data-reco-template="option-language">
        <span data-reco-field="label"></span><select data-reco-field="level"></select>
      </div>
      <div data-reco-labels hidden>
        <span data-reco-label="reco.progress">Étape {step} sur {total}</span>
        <span data-reco-label="reco.error.required">Champ requis</span>
        <span data-reco-label="reco.error.consent">Consentement requis</span>
        <span data-reco-label="reco.error.fields.max">3 maximum</span>
        <span data-reco-label="reco.error.network">Réseau</span>
        <span data-reco-label="reco.error.rate">Trop de demandes</span>
        <span data-reco-label="reco.error.server">Serveur</span>
        <span data-reco-label="reco.error.input">Saisie invalide</span>
        <span data-reco-label="reco.error.captcha">Captcha échoué</span>
        <span data-reco-label="reco.disclaimer">Recommandations indicatives.</span>
        <span data-reco-label="reco.loading">Recherche en cours…</span>
        <span data-reco-label="reco.results.count">{count} recommandations</span>
        <span data-reco-label="reco.empty">Aucun parcours</span>
      </div>
    </section>`
  const el = document.querySelector<HTMLElement>('[data-reco-widget]')
  if (!el) throw new Error('fixture sans widget')
  return el
}

/** Le fixture steps complet : containers d'options et champs de l'étape 5. */
export function mountStepsWidget(attrs: string = VALID_ATTRS): HTMLElement {
  const el = mountWidget(attrs)
  const form = el.querySelector('form')!
  const [s1, s2, s3, s4, s5] = [...form.querySelectorAll('fieldset')]
  s1!.insertAdjacentHTML(
    'beforeend',
    '<div data-reco-options="level"></div><p data-reco-error-for="level"></p>'
  )
  s2!.insertAdjacentHTML(
    'beforeend',
    '<div data-reco-options="fields"></div><p data-reco-error-for="fields"></p>'
  )
  s3!.insertAdjacentHTML(
    'beforeend',
    '<div data-reco-options="destinations"></div><p data-reco-error-for="destinations"></p>'
  )
  s4!.insertAdjacentHTML(
    'beforeend',
    '<div data-reco-options="languages"></div><p data-reco-error-for="languages"></p>'
  )
  s5!.insertAdjacentHTML(
    'beforeend',
    `<div data-reco-options="budget"></div><p data-reco-error-for="budget"></p>
     <div data-reco-options="intake"></div><p data-reco-error-for="intake"></p>
     <label>Objectif<textarea data-reco-input="goal" maxlength="300"></textarea></label>
     <p data-reco-hint="goal">Pas de données personnelles.</p>
     <label><input type="checkbox" data-reco-input="consent" />J'accepte</label>
     <p data-reco-error-for="consent"></p><div data-reco-turnstile></div>`
  )
  return el
}
