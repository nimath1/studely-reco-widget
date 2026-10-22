# @studely/widget

Widget de recommandation de parcours Studely, intégré au site Webflow.
Bundle TypeScript sans framework, sans style propre : un **chat** à la
Learn Up — fil de bulles utilisateur/assistant, saisie libre vers
`POST /chat` (SSE) — piloté par les attributs `data-reco-*`.
Le markup vit dans les SFC `src/template/*.vue` — rendues en HTML
statique au build (SSR, aucun runtime Vue embarqué) et injectées dans le
conteneur à l'init ; les libellés restent dans le bloc
`[data-reco-labels]` de l'embed (Webflow Localization, §8.1).

## Commandes

```bash
pnpm --filter @studely/widget dev               # page de dev (squelette §10.3) sur http://localhost:5173
pnpm --filter @studely/widget build:staging     # dist/reco.js pointant l'API de staging
pnpm --filter @studely/widget build:production  # dist/reco.js pointant l'API de production
pnpm --filter @studely/widget build:vercel      # build + site de référence packagé dans dist-site/
pnpm --filter @studely/widget test              # unitaires + intégration MSW (Vitest)
pnpm --filter @studely/widget test:coverage     # seuils : 90 % lignes/fonctions/instructions
pnpm --filter @studely/widget test:e2e:install  # navigateurs Playwright (1re fois)
pnpm --filter @studely/widget test:e2e          # E2E réels sur dev server + mock + axe-core
pnpm --filter @studely/widget lint
```

## Variables de build

| Variable                  | Rôle                                                                |
| ------------------------- | ------------------------------------------------------------------- |
| `VITE_RECO_API_URL`       | URL HTTPS de l'API chatbot (`POST /chat` SSE), fixée dans le bundle |
| `VITE_TURNSTILE_SITE_KEY` | Site key Cloudflare Turnstile (publique, par environnement)         |

- Dev : `.env.development` (versionné, URL publique de dev).
- Staging : `.env.staging`, production : `.env.production` — valeurs
  publiques versionnées ; la site key reste vide et est injectée par
  Vercel/CI. Sans URL HTTPS valide, `pnpm build*` échoue.

L'URL de l'API n'est jamais lue depuis la page (§7.4). Aucun secret ne vit
dans le bundle : Turnstile protège l'API (§9.1).

## Intégration Webflow

```html
<script defer src="https://scripts.studely.com/reco/v1/reco.js"></script>
```

Le chargeur du site ne pose ce `<script>` que si `[data-reco-widget]` est
présent dans la page ; sinon, un `<script defer>` en footer suffit (le
bootstrap scanne le DOM à `DOMContentLoaded` et ne fait rien sans widget).

### Contenu de l'embed

Le markup du widget (header, fil, composer, templates, launcher) est
compilé dans `reco.js` et injecté au chargement — il ne se copie **pas**
dans l'embed. Celui-ci ne contient que quatre blocs, tous présents dans
`index.html` (source canonique à copier) :

```html
<!-- 1. Conteneur : obligatoirement un <dialog> (ouverture via showModal) -->
<dialog data-reco-widget data-reco-origin="mexique" data-reco-advisor-url="/mexique#contact">
  <!-- 2. Libellés : traduits par Webflow Localization (une locale = une
         version du bloc). Clé absente → texte FR du gabarit conservé. -->
  <div data-reco-labels hidden>
    <span data-reco-label="reco.greeting">Bonjour, comment puis-je vous aider ?</span>
    <!-- … toutes les clés reco.* — liste complète dans index.html … -->
  </div>
</dialog>

<!-- 3. Styles : tout le CSS du widget (reco.js n'embarque aucun style).
        Copier le <style> de index.html — nommage BEM reco-*, RTL inclus. -->
<style>
  …
</style>

<!-- 4. Script inline open/close : showModal, animation de sortie, sync
       launcher, focus — vit dans la page hôte, pas dans reco.js.
       Copier le <script> « full-screen open/close » de index.html. -->
<script>
  …
</script>

<!-- 5. Le bundle -->
<script defer src="https://scripts.studely.com/reco/v1/reco.js"></script>
```

Langues : FR et EN passent par Webflow Localization (deux versions du bloc
`data-reco-labels` + `<html lang>`) ; `data-reco-locale` ne sert que de
repli si `lang` est absent. RTL : poser `dir="rtl"` sur le conteneur ou la
page — la feuille `[data-reco-widget][dir="rtl"]` prend le relais.

### Attributs du conteneur

| Attribut                | Obligatoire | Rôle                                                                                                                                    |
| ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `data-reco-widget`      | Oui         | Marque le conteneur                                                                                                                     |
| `data-reco-origin`      | Oui*        | Slug du pays d'origine (`mexique`), envoyé à l'API                                                                                      |
| `data-reco-advisor-url` | Oui*        | Page conseiller de repli (reçoit nom/e-mail en query)                                                                                   |
| `data-reco-handoff-url` | Non         | Endpoint de mise en relation : le mini-formulaire y POST `{name, email, session_id, origin}` en JSON ; absent → repli sur `advisor-url` |
| `data-reco-locale`      | Non         | Locale si `<html lang>` est absent (repli `fr`)                                                                                         |

\* ou `<meta name="reco-origin" content="…">` /
`<meta name="reco-advisor-url" content="…">` dans le `<head>` de la page :
l'attribut du bloc prime, la meta sert de repli — un même composant
Webflow partagé (ex. footer posé sur toutes les pages) fonctionne alors
partout, chaque page ne déclarant que son origine en custom code.

**Q7 tranché** : `data-reco-origin` et `data-reco-advisor-url` sont posés
sur la `div` englobante qui porte `data-reco-widget` (les propriétés de
composant Webflow ne peuvent pas écrire d'attributs custom) — changer deux
attributs suffit pour poser le widget sur n'importe quelle page d'origine.

Les URLs d'assets racine du gabarit (`<img src="/…">`,
`url('/fonts/…')`) sont réécrites à l'init vers l'origine du `<script>`
`reco.js` lui-même : aucun `SITE_URL` à configurer, le même embed rend
logo et fonts sur webflow.io, les previews Vercel ou un domaine custom.

Config invalide : le bloc reste sur son panel `fallback` (CTA conseiller,
R12) et un avertissement `[studely-reco]` est émis en console.

### Contrat DOM (résumé §10.2/10.3)

- Fenêtre : `<dialog data-reco-widget>` **plein écran** (comme Learn Up),
  ouverte en modal par le launcher ; `data-reco-state` reflète la phase
  (`consent` → `chat`).
- Fil : `data-reco-thread` (`role="log"`, région live) dans le viewport
  `data-reco-body` ; les entrées `data-reco-msg="user|assistant"` sont
  clonées depuis les templates — bulle utilisateur à droite, bulle
  assistant avec texte, citations (liens `data-reco-field="links"`
  filtrés https studely.com, R10) et actions (CTA « Parler à un
  conseiller » sur `out_of_scope`/`handoff_proposed`).
- Transitoires persistants : `data-reco-pending` (squelette + bouton
  `data-reco-action="stop"`) et `data-reco-error` (carte + `retry` +
  lien `advisor`), basculés par `hidden` en pied de fil.
- Composer `form[data-reco-composer]` : case `data-reco-input="consent"`
  (bloque tout envoi tant qu'elle n'est pas cochée), bloc
  `data-reco-turnstile`, `textarea data-reco-input="message"` autosize
  (Entrée envoie, Maj+Entrée = saut de ligne), bouton
  `data-reco-action="send"`, ligne `data-reco-disclaimer`.
- Templates `data-reco-template` : `msg-user`, `msg-assistant` (champs
  `text`, `suggestions`, `links`, `actions`), `suggestion` (chip
  `data-reco-send` — son libellé part comme message), `advisor-cta`,
  `handoff-form` (mini-formulaire nom + e-mail, champs
  `data-reco-input="handoff-name|email"`, `data-reco-action="handoff"`) ;
  bloc `data-reco-labels` (une entrée `data-reco-label` par clé i18n) ;
  `data-reco-live` (annonces), panel `fallback` (config invalide).
- Boutons `data-reco-action` : `send`, `stop`, `retry`, `advisor`,
  `handoff`.
- Mise en relation : « Parler à un conseiller » (bulle de refus ou carte
  d'indisponibilité) ajoute le mini-formulaire au fil ; validé, il POST
  vers `data-reco-handoff-url` ou, à défaut, ouvre `advisor-url` avec
  `?nom=&email=` — puis la carte devient une confirmation (jalon
  `reco_handoff`).
- Gabarit : le markup complet (header, fil, composer, templates,
  launcher) vit dans `src/template/*.vue`, rendu en HTML statique au
  build — `vite build`/`dev`/`test` génèrent `src/template.generated.txt`
  (gitignoré) via `renderTemplateFile`/`recoTemplate` (vite.config.ts) —
  puis injecté dans `[data-reco-widget]` si le bloc est vide de panels.
  Un embed qui porte déjà son markup n'est pas rempli deux fois. Le
  bloc `[data-reco-labels]` n'est **pas** dans le gabarit : il reste
  posé par l'embed/page et doit être présent dans le conteneur.
- Templates et labels : visibles dans le Designer, masqués en ligne par le
  CSS `[data-reco-template], [data-reco-labels] { display: none }`.
- Le JS n'utilise aucune classe de style : nommage BEM `reco-*` libre pour
  Webflow ; RTL via la feuille `[data-reco-widget][dir="rtl"]`.

Le visuel de référence (shell, header, cartes, bulles) vit dans
`index.html` (page de dev / composant Webflow) : `dist/reco.js` reste
volontairement sans style et n'embarque aucun CSS. Les assets statiques
qu'il référence — `public/studely-brand.jpg` (logo du header) et
`public/fonts/Montserrat-*.otf` (@font-face 400/600/700/800) — doivent
être déployés avec la page : le bundle ne les inclut pas.

Le gabarit peut aussi utiliser les utilitaires **Tailwind v4**
(`src/widget.css`, liée en `<link>` dans `index.html`) : `theme` +
`utilities` seuls, **sans preflight** — le reset global casserait la
page Webflow hôte. Les jetons `--color-reco-*`/`--font-reco`/
`--radius-reco*` (`bg-reco-primary`, `text-reco-ink`…) renvoient aux
custom properties `--reco-*` du `:root` du gabarit. Dans l'embed
Webflow, coller le CSS compilé (`dist-site/assets/index-*.css` après
`build:vercel`) dans le `<style>` du bloc ; sur la page de dev et le
site Vercel, le `<link>` suffit.

## API JS

- `window.StudelyReco.init(element)` — (ré)initialise un bloc.
- `window.StudelyReco.version` — version du bundle.

## Localisation

5 locales : `fr`, `es`, `en`, `de`, `ar` (arabe → `dir="rtl"` sur le
conteneur). Aucun texte en dur côté JS : chaque libellé vient du bloc
`[data-reco-labels]` traduit par Webflow Localization ; clé absente →
`console.warn` nommant la clé + repli sur `[data-reco-label-fr]` si présent.
Nombres et dates via `Intl` dans la locale active.

## RGPD, consentement, tracking

- La case consentement n'est **jamais** pré-cochée (R15) et bloque tout
  envoi : saisie et bouton sont `disabled` tant qu'elle n'est pas cochée.
- Aucun appel API sans consentement ; le message saisi part tel quel au
  bot et n'apparaît jamais dans les logs ni les événements (R16).
- Tracking (§9.2) : chaque jalon `studely:reco` (`consent`, `send`,
  `reply`, `empty`, `error`, `retry`, `stop`, `reset`, `advisor`) est
  relayé dans `window.dataLayer` en `reco_<name>` avec `reco_locale`,
  `reco_origin`, `reco_version` ; `duration_ms` (envoi → affichage) sur
  `reply`/`empty`/`error` et `result_count` sur `reply`. Rien n'est poussé
  si la CMP refuse la mesure d'audience (`Cookiebot.consent.statistics
=== false`, R15) — sans CMP détectée, le relais n'est pas bloquant.
- `CustomEvent('studely:reco', { detail: { name, from, to } })` est émis
  sur le conteneur, pour la page ou la CMP.
- Turnstile : script chargé uniquement quand le consentement est donné,
  défi rendu dans `data-reco-turnstile`, jeton en `X-Turnstile-Token`.
  Sur 403 : le défi est relancé et le message reposté une fois, puis
  `reco.error.captcha` au second échec.

## Mock de l'API (dev local et CI)

L'API de recommandation est mockée par MSW, uniquement hors bundle —
`mock/` n'entre jamais dans `dist/reco.js`, et l'import du worker est
gated par `import.meta.env.DEV` : ni le code MSW ni
`public/mockServiceWorker.js` n'atteignent le build site de production.

Sans `?recoMock=`, la page de dev appelle le **vrai chatbot** : en dev
`VITE_RECO_API_URL` est vide, les appels `/chat` restent même-origine et
`server.proxy` (vite.config.ts) les relaie à `chatbot.dev.ml.studely.com` —
aucun CORS côté navigateur.

```bash
pnpm dev
# http://localhost:5173                  → vrai chatbot (via proxy)
# http://localhost:5173/?recoMock=<scénario>&lang=<fr|es|en|de|ar>
# ou : localStorage.setItem('recoMock', '<scénario>')
```

Scénarios (`?recoMock=`) : `nominal`, `empty`, `field-error` (400 avec
`field`), `forbidden` (403 CAPTCHA_FAILED), `rate` (429 + Retry-After 30 s),
`server` (500), `unavailable` (503), `timeout` (réponse jamais reçue,
timeout 20 s du widget), `bad-url` (URLs hors studely.com), `html-reason`
(HTML injecté dans `reason`). Les réponses sont fournies dans les 5 locales.

## Tests

- `pnpm test` : unitaires Vitest + intégration `src/index.msw.spec.ts` qui
  rejoue chaque scénario du mock via le serveur MSW node (`mock/node.ts`).
- `pnpm test:e2e` : Playwright sur la page de dev + mock — ouverture,
  consentement (R15), envoi, réponse, 429, RTL arabe, mobile 360 px — et
  audits axe-core. `BASE_URL=https://<staging>` pour rejouer la suite
  hors mock.
- En CI, le job `e2e` tourne sur chromium ; la phase 2 (staging Webflow)
  réutilise ces specs avec `BASE_URL` et sans `?recoMock=`.

## Règles

- Données de l'API injectées via `textContent` uniquement : `innerHTML`,
  `outerHTML` et `insertAdjacentHTML` sont interdits par ESLint.
- Aucun texte en dur : les libellés viennent du bloc `[data-reco-labels]`.
- Bundle ≤ 25 ko gzip : `pnpm build*` échoue au-delà
  (`scripts/check-size.mjs`, relançable seul avec `pnpm size`).

## Limites connues

- Le widget est branché sur l'API chatbot déployée (`POST /chat`, SSE
  `delta`/`final` ; `mode` non envoyé, défaut serveur `sav` — aucun autre
  mode documenté dans l'OpenAPI actuel). La réponse est du texte libre +
  métadonnées — pas de cartes structurées type Learn Up (`clarify`,
  `recommend`) : les recommandations proprement dites attendent
  l'évolution du backend mobilité. Un refus `out_of_scope` affiche la
  bulle de refus + le CTA conseiller (jalon `reco_empty`, jamais compté
  en recommandations).
- L'édition d'un message déjà envoyé (Learn Up) n'existe pas : la session
  serveur ne peut pas être tronquée — « Nouvelle recherche » repart d'une
  session vierge.
- La CMP reconnue est Cookiebot ; Didomi/Axeptio s'ajoutent dans
  `hasAnalyticsConsent` si le site les utilise.
- Les URL `.env.staging`/`.env.production` suivent le pattern de dev ;
  vérifier contre l'inventaire réel avant déploiement.
- Le lien conseiller de la page de référence (`/mexique#contact`) est un
  placeholder : en déploiement Vercel autonome, configurer une URL
  absolue vers la vraie page de contact (cf. AUDIT.md).
