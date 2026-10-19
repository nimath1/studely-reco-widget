/**
 * Parcours complet contre le mock MSW (§12.1, phase 1) : chaque scénario
 * du mock est joué de intro à l'état attendu, via le vrai client HTTP —
 * seul le réseau est intercepté.
 * Le scénario « timeout » est couvert au niveau client (client.spec.ts) :
 * son délai de 60 s rendrait le test trop lent.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { server } from '../mock/node'
import type { Scenario } from '../mock/handlers'
import * as StudelyReco from './index'
import { mountStepsWidget } from './testing/widget.fixture'

const click = (el: HTMLElement, selector: string) =>
  el.querySelector<HTMLElement>(selector)?.click()

const state = (el: HTMLElement) => el.dataset.recoState

/** Sélectionne un niveau pour la première langue proposée (étape 4). */
function pickLanguage(el: HTMLElement): void {
  const select = el.querySelector<HTMLSelectElement>('[data-reco-options="languages"] select')
  if (!select) throw new Error('select langue manquant')
  select.value = select.options[1]!.value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

async function waitOptions(el: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    expect(el.querySelector('[data-reco-options="level"] input')).toBeTruthy()
  })
}

async function waitState(el: HTMLElement, expected: string): Promise<void> {
  await vi.waitFor(() => {
    expect(state(el)).toBe(expected)
  })
}

/** Répond au questionnaire complet puis soumet (consentement coché). */
async function play(el: HTMLElement): Promise<void> {
  click(el, '[data-reco-action="start"]')
  el.querySelector<HTMLInputElement>('[data-reco-options="level"] input')!.click()
  click(el, '[data-reco-action="next"]')
  el.querySelector<HTMLInputElement>('[data-reco-options="fields"] input')!.click()
  click(el, '[data-reco-action="next"]')
  el.querySelector<HTMLInputElement>('[data-reco-options="destinations"] input')!.click()
  click(el, '[data-reco-action="next"]')
  pickLanguage(el)
  click(el, '[data-reco-action="next"]')
  el.querySelector<HTMLInputElement>('[data-reco-options="budget"] input')!.click()
  el.querySelector<HTMLInputElement>('[data-reco-options="intake"] input')!.click()
  el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.click()
  click(el, '[data-reco-action="submit"]')
}

describe('parcours complet contre le mock MSW', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => {
    server.resetHandlers()
    localStorage.clear()
    document.body.innerHTML = ''
  })
  afterAll(() => server.close())

  async function mount(scenario: Scenario): Promise<HTMLElement> {
    localStorage.setItem('recoMock', scenario)
    const el = mountStepsWidget()
    StudelyReco.init(el)
    await waitOptions(el)
    return el
  }

  it('nominal : de intro à results avec des cartes cliquables', async () => {
    const el = await mount('nominal')
    await play(el)
    await waitState(el, 'results')
    const links = [
      ...el.querySelectorAll<HTMLAnchorElement>('[data-reco-results] [data-reco-field="url"]')
    ]
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.href).toMatch(/^https:\/\/(www\.)?studely\.com/)
    }
    // dataLayer alimenté avec les paramètres communs (§9.2).
    const events = (window.dataLayer ?? []).map((p) => p.event)
    expect(events).toContain('reco_results')
    const resultsEvent = (window.dataLayer ?? []).find((p) => p.event === 'reco_results')
    expect(resultsEvent?.reco_locale).toBe('fr')
    expect(resultsEvent?.reco_origin).toBe('mexique')
    expect(resultsEvent?.duration_ms).toBeTypeOf('number')
    expect(resultsEvent?.result_count).toBeTypeOf('number')
    delete window.dataLayer
  })

  it('empty : panel empty quand aucune recommandation', async () => {
    const el = await mount('empty')
    await play(el)
    await waitState(el, 'empty')
    expect(
      el.querySelector<HTMLAnchorElement>('[data-reco-panel="empty"] [data-reco-action="advisor"]')
        ?.href
    ).toBeTruthy()
  })

  it("field-error : 400 avec field ramène à l'étape du champ", async () => {
    const el = await mount('field-error')
    await play(el)
    await waitState(el, 'step-2')
    expect(el.querySelector('[data-reco-error-for="fields"]')?.textContent).not.toBe('')
  })

  it("forbidden : 403 relance le défi puis affiche l'erreur captcha au 2e échec", async () => {
    const el = await mount('forbidden')
    await play(el)
    await waitState(el, 'step-5')
    click(el, '[data-reco-action="submit"]')
    await waitState(el, 'error')
    expect(el.querySelector('[data-reco-error-message]')?.textContent).toBe('Captcha échoué')
  })

  it("rate : 429 affiche l'erreur débit et verrouille Réessayer", async () => {
    const el = await mount('rate')
    await play(el)
    await waitState(el, 'error')
    expect(el.querySelector('[data-reco-error-message]')?.textContent).toBe('Trop de demandes')
    expect(el.querySelector<HTMLButtonElement>('[data-reco-action="retry"]')?.disabled).toBe(true)
  })

  it.each(['server', 'unavailable'] as const)(
    '%s : erreur serveur avec Réessayer actif',
    async (scenario) => {
      const el = await mount(scenario)
      await play(el)
      await waitState(el, 'error')
      expect(el.querySelector('[data-reco-error-message]')?.textContent).toBe('Serveur')
      expect(el.querySelector<HTMLButtonElement>('[data-reco-action="retry"]')?.disabled).toBe(
        false
      )
    }
  )

  it('bad-url : les cartes hors studely.com sont écartées', async () => {
    const el = await mount('bad-url')
    await play(el)
    await waitState(el, 'results')
    const links = [
      ...el.querySelectorAll<HTMLAnchorElement>('[data-reco-results] [data-reco-field="url"]')
    ]
    for (const link of links) {
      expect(link.href).toMatch(/^https:\/\/(www\.)?studely\.com/)
    }
  })

  it('html-reason : la raison HTML reste du texte brut', async () => {
    const el = await mount('html-reason')
    await play(el)
    await waitState(el, 'results')
    const reason = el.querySelector('[data-reco-results] [data-reco-field="reason"]')
    expect(reason?.textContent).toContain('<img')
    expect(el.querySelector('[data-reco-results] img')).toBeNull()
  })
})
