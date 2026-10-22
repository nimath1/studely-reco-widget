import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * UI du fil de conversation : lancement/fermeture (focus + aria), notice
 * de consentement passif (continuation), envoi immédiat via suggestion,
 * état « en cours » (points + Arrêter sans chevauchement), débordements
 * horizontaux (desktop, 390 px, RTL) et axe sérieux/critique.
 * Mock MSW activé par ?recoMock=<scénario> — aucun appel réseau réel.
 */
const widget = (page: Page) => page.locator('[data-reco-widget]')
const thread = (page: Page) => widget(page).locator('[data-reco-thread]')
const launcher = (page: Page) => page.locator('[data-reco-launcher]')
const pending = (page: Page) => widget(page).locator('[data-reco-pending]')
const composer = (page: Page) => widget(page).locator('[data-reco-composer]')

async function open(page: Page, lang = 'fr', scenario = 'nominal'): Promise<void> {
  await page.goto(`/?recoMock=${scenario}&lang=${lang}`)
  await launcher(page).click()
  await expect(widget(page)).toHaveAttribute('data-reco-open', '')
  await expect(thread(page).locator('[data-reco-msg="assistant"]')).toHaveCount(1)
}

async function axe(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).include('[data-reco-widget]').analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, `violations axe sur ${label}`).toEqual([])
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const body = document.querySelector('[data-reco-body]')
    const doc = document.documentElement
    return {
      body: body ? body.scrollWidth - body.clientWidth : 0,
      page: doc.scrollWidth - doc.clientWidth
    }
  })
  expect(overflow.body, 'débordement horizontal du fil').toBeLessThanOrEqual(1)
  expect(overflow.page, 'débordement horizontal de la page').toBeLessThanOrEqual(1)
}

test.describe('chat UI (mock MSW)', () => {
  test('ouverture/fermeture : focus et aria du launcher', async ({ page }) => {
    await open(page)
    await expect(launcher(page)).toHaveAttribute('aria-expanded', 'true')
    // Le focus entre dans le widget (champ message, déverrouillé d'office).
    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.querySelector('[data-reco-widget]')?.contains(document.activeElement)
        )
      )
      .toBe(true)
    await widget(page).locator('[data-reco-close]').click()
    await expect(widget(page)).not.toHaveAttribute('data-reco-open', '')
    await expect(launcher(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(launcher(page)).toBeFocused()
  })

  test('consentement passif : notice visible, pas de case, saisie libre', async ({ page }) => {
    await open(page)
    // Plus de case à cocher : la notice passive la remplace.
    await expect(composer(page).locator('[data-reco-input="consent"]')).toHaveCount(0)
    const notice = composer(page).locator('[data-reco-consent="continuation"]')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('En continuant, vous acceptez')
    // Champ et envoi disponibles immédiatement.
    await expect(widget(page).locator('[data-reco-input="message"]')).toBeEnabled()
    await expect(widget(page).locator('[data-reco-action="send"]')).toBeEnabled()
    await axe(page, 'notice de continuation')
  })

  test('suggestion : premier clic envoie le libellé et affiche la réponse', async ({ page }) => {
    await open(page)
    const suggestion = thread(page).locator('[data-reco-send]').first()
    const label = await suggestion.locator('[data-reco-field="label"]').textContent()
    // Un seul clic suffit : la suggestion envoie sans préalable.
    await suggestion.click()
    await expect(thread(page).locator('[data-reco-msg="user"]')).toHaveText(label?.trim() ?? '')
    // La réponse du mock nominal apparaît en bulle assistant.
    await expect(thread(page).locator('[data-reco-msg="assistant"]')).toHaveCount(2, {
      timeout: 10_000
    })
  })

  test('saisie libre : le premier envoi texte part directement', async ({ page }) => {
    await open(page)
    const input = widget(page).locator('[data-reco-input="message"]')
    await input.fill('Je cherche un master à Lyon')
    await widget(page).locator('[data-reco-action="send"]').click()
    await expect(thread(page).locator('[data-reco-msg="user"]')).toHaveText(
      'Je cherche un master à Lyon'
    )
    await expect(thread(page).locator('[data-reco-msg="assistant"]')).toHaveCount(2, {
      timeout: 10_000
    })
  })

  test('en cours : statut compact puis Arrêter rend la main sans erreur', async ({ page }) => {
    // Scénario « timeout » : la réponse n'arrive jamais, le squelette reste.
    await open(page, 'fr', 'timeout')
    await thread(page).locator('[data-reco-send]').first().click()
    const status = pending(page).locator('[data-reco-pending-status]')
    await expect(status).toBeVisible()
    const region = status.locator('[role="status"]')
    await expect(region).toBeVisible()
    await expect(region.locator('[data-reco-dots]')).toBeVisible()
    await expect(region.locator('[data-reco-field="pending-text"]')).toHaveText(
      'Analyse de ta demande…'
    )
    const stop = status.locator('[data-reco-action="stop"]')
    await expect(stop).toBeVisible()
    // Points et bouton dans la même ligne, sans chevauchement.
    const dotsBox = await region.locator('[data-reco-dots]').boundingBox()
    const stopBox = await stop.boundingBox()
    expect(dotsBox).not.toBeNull()
    expect(stopBox).not.toBeNull()
    expect(dotsBox!.x + dotsBox!.width).toBeLessThanOrEqual(stopBox!.x + 1)

    await stop.click()
    await expect(pending(page)).toBeHidden()
    await expect(widget(page).locator('[data-reco-error]')).toBeHidden()
    await expect(widget(page).locator('[data-reco-input="message"]')).toBeEnabled()
    await expect(widget(page).locator('[data-reco-action="send"]')).toBeEnabled()
    await axe(page, 'après arrêt')
  })

  test('accueil : carte marquée + cinq suggestions, axe initial', async ({ page }) => {
    await open(page)
    const greeting = widget(page).locator('[data-reco-greeting]')
    await expect(greeting).toHaveCount(1)
    await expect(thread(page).locator('[data-reco-send]')).toHaveCount(5)
    await axe(page, 'état initial (continuation)')
  })

  test('pas de débordement horizontal : desktop, 390 px et RTL', async ({ page }) => {
    await open(page)
    await thread(page).locator('[data-reco-send]').first().click()
    await expect(thread(page).locator('[data-reco-msg="assistant"]')).toHaveCount(2, {
      timeout: 10_000
    })
    await expectNoHorizontalOverflow(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await expectNoHorizontalOverflow(page)

    await page.goto('/?recoMock=timeout&lang=fr')
    await launcher(page).click()
    await thread(page).locator('[data-reco-send]').first().click()
    await expect(pending(page).locator('[data-reco-pending-status]')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.goto('/?recoMock=nominal&lang=ar')
    await launcher(page).click()
    await expect(widget(page)).toHaveAttribute('data-reco-open', '')
    await expect(widget(page).locator('[data-reco-greeting]')).toHaveCount(1)
    await page.setViewportSize({ width: 390, height: 844 })
    await expectNoHorizontalOverflow(page)
  })
})
