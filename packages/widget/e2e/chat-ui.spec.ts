import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * UI du fil de conversation : lancement/fermeture (focus + aria), porte
 * consentement, envoi via suggestion, réponse visible, débordements
 * horizontaux (desktop, 390 px, RTL) et axe sérieux/critique.
 * Mock MSW activé par ?recoMock=nominal — aucun appel réseau réel.
 */
const widget = (page: Page) => page.locator('[data-reco-widget]')
const thread = (page: Page) => widget(page).locator('[data-reco-thread]')
const launcher = (page: Page) => page.locator('[data-reco-launcher]')

async function open(page: Page, lang = 'fr'): Promise<void> {
  await page.goto(`/?recoMock=nominal&lang=${lang}`)
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
    // Le focus entre dans le widget (champ message ou consentement).
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

  test('consentement : saisie verrouillée puis déverrouillée', async ({ page }) => {
    await open(page)
    const input = widget(page).locator('[data-reco-input="message"]')
    const send = widget(page).locator('[data-reco-action="send"]')
    await expect(input).toBeDisabled()
    await expect(send).toBeDisabled()
    // Une suggestion sans consentement n'envoie rien.
    await thread(page).locator('[data-reco-send]').first().click({ force: true })
    await expect(thread(page).locator('[data-reco-msg="user"]')).toHaveCount(0)
    await widget(page).locator('[data-reco-input="consent"]').check()
    await expect(input).toBeEnabled()
    await expect(send).toBeEnabled()
    await axe(page, 'état consenti')
  })

  test('suggestion : envoie le libellé et affiche la réponse', async ({ page }) => {
    await open(page)
    await widget(page).locator('[data-reco-input="consent"]').check()
    const suggestion = thread(page).locator('[data-reco-send]').first()
    const label = await suggestion.locator('[data-reco-field="label"]').textContent()
    await suggestion.click()
    await expect(thread(page).locator('[data-reco-msg="user"]')).toHaveText(label?.trim() ?? '')
    // La réponse du mock nominal apparaît en bulle assistant.
    await expect(thread(page).locator('[data-reco-msg="assistant"]')).toHaveCount(2, {
      timeout: 10_000
    })
  })

  test('accueil : carte marquée + cinq suggestions, axe initial', async ({ page }) => {
    await open(page)
    const greeting = widget(page).locator('[data-reco-greeting]')
    await expect(greeting).toHaveCount(1)
    await expect(thread(page).locator('[data-reco-send]')).toHaveCount(5)
    await axe(page, 'état initial (consentement)')
  })

  test('pas de débordement horizontal : desktop, 390 px et RTL', async ({ page }) => {
    await open(page)
    await widget(page).locator('[data-reco-input="consent"]').check()
    await thread(page).locator('[data-reco-send]').first().click()
    await expect(thread(page).locator('[data-reco-msg="assistant"]')).toHaveCount(2, {
      timeout: 10_000
    })
    await expectNoHorizontalOverflow(page)

    await page.setViewportSize({ width: 390, height: 844 })
    await expectNoHorizontalOverflow(page)

    await page.goto('/?recoMock=nominal&lang=ar')
    await launcher(page).click()
    await expect(widget(page)).toHaveAttribute('data-reco-open', '')
    await expect(widget(page).locator('[data-reco-greeting]')).toHaveCount(1)
    await page.setViewportSize({ width: 390, height: 844 })
    await expectNoHorizontalOverflow(page)
  })
})
