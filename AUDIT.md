# Specification Audit

Date: 2026-10-20.

Scope: the supplied Studely specification, the current repository, preservation of
the existing analytics integration, and preparation for Vercel. This is not a production
acceptance certificate. Local mock tests cannot certify the external backend,
the published Webflow component, legal approval, or DNS.

## Local Changes

- Preserve the existing analytics bridge and audience-consent behavior,
  including the public `studely:reco` DOM lifecycle events.
- Add a production reference-page build and versioned IIFE assets for Vercel.
  Keep the Webflow library build independent from the reference page.
- Restore the specified 20-second request timeout; handle CRLF SSE streams
  and unavailable session storage.
- Reject malformed saved drafts, validate every required step before sending,
  support native form submission, and ignore stale replies after restart.
- Show the automatic-recommendation disclaimer and provide a no-JavaScript
  fallback outside the floating window.

The changes listed here must not be interpreted as passing staging acceptance.

## Local Verification Evidence

The initial runs below preceded restoration of the existing analytics bridge;
see the analytics-restoration logs for the final affected checks.

- Analytics restored: 41 affected tests passed; TypeScript, lint, Vercel build,
  and built-site smoke passed. Bundle: 9.17 KiB gzip. Evidence:
  `/tmp/studely-analytics-tests.log`, `/tmp/studely-analytics-typecheck.log`,
  `/tmp/studely-analytics-lint.log`, `/tmp/studely-analytics-build.log`, and
  `/tmp/studely-analytics-site.log`.
- Initial full unit/integration run: 167 tests passed; reported line coverage
  98.37%. Evidence: `/tmp/studely-coverage.log`. This run preceded the final
  submission-lock refinement and its three additional regression tests.
- Final affected-test run: 43 tests passed across `index.flow.spec.ts` and
  `api/client.spec.ts`. Evidence: `/tmp/studely-rework-tests.log`.
- Final TypeScript check, lint, and Vercel build passed. The library size check
  reports 8.89 KiB gzip against a 25 KiB limit. Evidence:
  `/tmp/studely-rework-typecheck.log`, `/tmp/studely-rework-lint.log`, and
  `/tmp/studely-rework-build.log`.
- Desktop Chromium E2E: 13 tests passed, including axe checks for intro,
  questionnaire, results, and error. Evidence: `/tmp/studely-e2e.log`.
  This run preceded the final submission-lock refinement.
- Final built-site browser check: boots without page errors or horizontal
  overflow at 1280px; font/logo return 200; alias and versioned bundle bytes
  match; the mock worker returns 404. An intercepted questionnaire submission
  makes exactly one POST and renders results. With JavaScript disabled, the
  independent advisor fallback is visible. Evidence:
  `/tmp/studely-site-check.log`; screenshot: `/tmp/studely-site.png`.
- Maestro Chromium smoke: opened the built site, opened the widget, started
  the questionnaire, verified the required-answer error, selected
  Baccalaureat, and reached step 2. This is desktop web evidence, not mobile
  acceptance; no live backend request was submitted.
- No remote Vercel deployment, domain setup, live recommendation request, or
  production-data mutation was performed.

## Remaining Release Blockers

| Area                                 | Source Evidence                                                                                                                                                                                                                            | Required Action                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recommendation API                   | `src/api/client.ts` calls `POST /chat` using SSE, not the specification's `GET /v1/options` and `POST /v1/recommendations`. `src/api/types.ts` describes chat text and citations, not typed recommendation cards.                          | Backend owner must confirm the supported mobility contract and provide its OpenAPI. Do not invent endpoints or claim that citation links satisfy the 3-to-5-card contract.    |
| Backend recommendation behavior      | The existing widget README records `out_of_scope` responses to study-path requests. This audit does not repeat a live request or independently establish current backend behavior.                                                         | Validate the mobility capability against staging with an approved test profile. The widget correctly treats explicit refusals as empty, not successful recommendations.       |
| Profile context and consent proof    | `buildChatMessage` currently receives only profile and locale; the page's origin and a versioned consent record are not sent as structured API fields.                                                                                     | Agree on backend support for origin and consent version. Keep the explicit local consent gate; do not silently add unsupported request fields.                                |
| Questionnaire catalogue              | `src/api/options.ts` contains three study levels, annual budget bands, unversioned January/September intakes, and no unrestricted destination choice. The specification requires five levels, monthly EUR bands, dated intakes, and `any`. | Product and backend must approve the catalogue and units before replacing the existing chatbot-facing choices. Do not reinterpret annual figures as monthly budgets.          |
| Production endpoints                 | The existing widget README identifies staging/production API hostnames as following a naming pattern rather than a verified inventory.                                                                                                     | Set `VITE_RECO_API_URL` to the actual approved HTTPS endpoint in each Vercel environment. Validate backend CORS for the page that runs the widget, not merely the asset host. |
| Anti-bot protection                  | The committed production/staging Turnstile site keys are empty. The frontend sends a token when configured; server-side verification is outside this repository.                                                                           | Supply the public key, register the Webflow/Vercel domains in Cloudflare, and confirm backend enforcement and rate limiting. Never expose a Turnstile secret in `VITE_*`.     |
| Legal information                    | The reference consent text and disclaimer do not link to an approved information page. The legal basis, retention, processors, and hosting arrangements remain product/DPO decisions in the specification.                                 | Publish the approved information page and add its localized links to consent and results in Webflow.                                                                          |
| Advisor destination                  | The reference template uses `/mexique#contact`, which is a Webflow-relative placeholder and has no corresponding route in the standalone Vercel project.                                                                                   | Configure a real advisor URL per origin; use an absolute Studely URL on the standalone reference page.                                                                        |
| Translations                         | The library supports five locales and RTL, and the local options are translated. The reference HTML's fixed questions, actions, and error labels remain French even when `?lang=` changes the locale.                                      | Translate the published Webflow component in all five locales. Do not use a passing RTL/mock test as proof of complete localization.                                          |
| Published assets and release history | Build preparation is not publication. A new Vercel deployment does not automatically retain all historic version directories.                                                                                                              | Configure `scripts.studely.com`, publish with a new package version for each release, and retain previous deployments or an explicit release archive for rollback.            |

## Acceptance Boundaries

- R1: the nominal chat/mock flow is not proof of the specified recommendation
  cards, real localized CMS destinations, or live mobility results.
- R2/R3: locale resolution and RTL are testable locally; complete translated
  Webflow content still needs staging acceptance.
- R4/R5/R6: consent gating, answer preservation, and draft recovery have local
  automated coverage; repeat them on the published component.
- R7/R8/R9/R10/R11: chat equivalents of empty, timeout, rate limiting, unsafe
  links, and injected HTML have local seams; REST contract acceptance remains
  blocked on the agreed API.
- R12: the reference page requires an independent visible fallback when
  JavaScript is disabled; the published Webflow component must also be checked.
- R13: automated axe checks do not replace a complete keyboard and
  VoiceOver/NVDA review of the published component.
- R14: mobile acceptance requires Maestro evidence; no mobile simulator is
  available in the current Maestro device inventory.
- Analytics is retained. Cookiebot statistics consent is enforced when its
  consent object exists; the original no-CMP behavior remains nonblocking.
  Confirm the production CMP integration before acceptance. Profile-processing
  consent remains required.
- Lighthouse comparison, Safari iOS 15 compatibility, the staging R1-R16
  acceptance run, and the remote SonarQube gate are not established by a local
  build.
