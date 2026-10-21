/**
 * Parcours complet contre le mock MSW (§12.1, phase 1) : chaque scénario
 * du mock est joué de l'accueil à l'état attendu, via le vrai client
 * HTTP — seul le réseau est intercepté.
 * Le scénario « timeout » est couvert au niveau client (client.spec.ts) :
 * son délai de 60 s rendrait le test trop lent.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { server } from '../mock/node'
import type { Scenario } from '../mock/handlers'
import * as StudelyReco from './index'
import { mountWidget } from './testing/widget.fixture'

const entries = (el: HTMLElement) => [
  ...el.querySelectorAll<HTMLElement>('[data-reco-thread] > [data-reco-msg]')
]
const assistantEntries = (el: HTMLElement) =>
  entries(el).filter((n) => n.dataset.recoMsg === 'assistant')

/** Consentement + message « master » envoyé depuis le composer. */
async function play(el: HTMLElement): Promise<void> {
  const checkbox = el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!
  checkbox.checked = true
  checkbox.dispatchEvent(new Event('change', { bubbles: true }))
  // Le bouton n'est déverrouillé qu'au tick petite-vue suivant.
  await vi.waitFor(() => {
    expect(el.querySelector<HTMLButtonElement>('[data-reco-action="send"]')!.disabled).toBe(false)
  })
  el.querySelector<HTMLTextAreaElement>('[data-reco-input="message"]')!.value =
    'Je cherche un master'
  el.querySelector<HTMLElement>('[data-reco-action="send"]')!.click()
}

async function waitReply(el: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    expect(assistantEntries(el).length).toBeGreaterThanOrEqual(2)
  })
}

async function waitError(el: HTMLElement): Promise<void> {
  await vi.waitFor(() => {
    expect(el.querySelector<HTMLElement>('[data-reco-error]')!.hidden).toBe(false)
  })
}

describe('parcours complet contre le mock MSW', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => {
    server.resetHandlers()
    localStorage.clear()
    sessionStorage.clear()
    delete window.dataLayer
    delete window.Cookiebot
    document.body.innerHTML = ''
    document.documentElement.lang = 'fr'
  })
  afterAll(() => server.close())

  function mount(scenario: Scenario): HTMLElement {
    document.documentElement.lang = 'fr'
    localStorage.setItem('recoMock', scenario)
    const el = mountWidget()
    StudelyReco.init(el)
    return el
  }

  it('nominal : bulle assistant avec le texte du bot et ses liens', async () => {
    const el = mount('nominal')
    await play(el)
    await waitReply(el)
    const reply = assistantEntries(el).at(-1)!
    expect(reply.querySelector('[data-reco-field="text"]')?.textContent).toContain('pistes')
    const links = [...reply.querySelectorAll<HTMLAnchorElement>('[data-reco-field="links"] a')]
    expect(links).toHaveLength(3)
    for (const link of links) {
      expect(link.href).toMatch(/^https:\/\/([\w-]+\.)*studely\.com/)
      expect(link.target).toBe('_blank')
      expect(link.rel).toBe('noopener')
    }
    // Labeled citations render their `[Sn]` marker before the title.
    expect(links[0]!.textContent).toContain('[S1]')
    // dataLayer fed with the common parameters (§9.2).
    const events = (window.dataLayer ?? []).map((p) => p.event)
    expect(events).toContain('reco_reply')
    const replyEvent = (window.dataLayer ?? []).find((p) => p.event === 'reco_reply')
    expect(replyEvent?.reco_locale).toBe('fr')
    expect(replyEvent?.reco_origin).toBe('mexique')
    expect(replyEvent?.duration_ms).toBeTypeOf('number')
    expect(replyEvent?.result_count).toBeTypeOf('number')
  })

  it('empty : réponse vide → bulle « aucun parcours »', async () => {
    const el = mount('empty')
    await play(el)
    await waitReply(el)
    expect(assistantEntries(el).at(-1)!.textContent).toContain('Aucun parcours')
  })

  it('field-error : 422 FastAPI affiche l’erreur de saisie', async () => {
    const el = mount('field-error')
    await play(el)
    await waitError(el)
    expect(el.querySelector('[data-reco-error-message]')?.textContent).toBe('Saisie invalide')
  })

  it("forbidden : 403 reposte une fois puis affiche l'erreur captcha", async () => {
    const el = mount('forbidden')
    await play(el)
    await waitError(el)
    expect(el.querySelector('[data-reco-error-message]')?.textContent).toBe('Captcha échoué')
  })

  it("rate : 429 affiche l'erreur débit et verrouille Réessayer", async () => {
    const el = mount('rate')
    await play(el)
    await waitError(el)
    expect(el.querySelector('[data-reco-error-message]')?.textContent).toBe('Trop de demandes')
    await vi.waitFor(() => {
      expect(el.querySelector<HTMLButtonElement>('[data-reco-action="retry"]')?.disabled).toBe(true)
    })
  })

  it.each(['server', 'unavailable'] as const)(
    '%s : erreur serveur avec Réessayer actif',
    async (scenario) => {
      const el = mount(scenario)
      await play(el)
      await waitError(el)
      expect(el.querySelector('[data-reco-error-message]')?.textContent).toBe('Serveur')
      expect(el.querySelector<HTMLButtonElement>('[data-reco-action="retry"]')?.disabled).toBe(
        false
      )
    }
  )

  it('bad-url : citations hors studely.com et texte vide → bulle « aucun parcours »', async () => {
    const el = mount('bad-url')
    await play(el)
    await waitReply(el)
    const reply = assistantEntries(el).at(-1)!
    expect(reply.querySelectorAll('[data-reco-field="links"] a')).toHaveLength(0)
    expect(reply.textContent).toContain('Aucun parcours')
  })

  it('html-reason : le texte HTML reste du texte brut', async () => {
    const el = mount('html-reason')
    await play(el)
    await waitReply(el)
    const reply = assistantEntries(el).at(-1)!
    expect(reply.querySelector('[data-reco-field="text"]')?.textContent).toContain('<img')
    expect(reply.querySelector('img')).toBeNull()
  })
})
