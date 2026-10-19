import { expect, test, type Page } from '@playwright/test'

/**
 * Page de dev : le mock MSW est activé par ?recoMock=<scénario>, la locale
 * par ?lang=. Attente web-first : le widget est prêt quand les options de
 * l'étape 1 sont rendues (GET /v1/options intercepté par le worker MSW).
 */
async function open(page: Page, scenario = 'nominal', lang = 'fr'): Promise<void> {
  await page.goto(`/?recoMock=${scenario}&lang=${lang}`)
  await page.locator('[data-reco-launcher]').click()
  await expect(widget(page)).toHaveAttribute('data-reco-open', '')
  await expect(
    page.locator('[data-reco-widget] [data-reco-options="level"] input').first()
  ).toBeAttached()
}

const widget = (page: Page) => page.locator('[data-reco-widget]')
const state = (page: Page) => widget(page).getAttribute('data-reco-state')
const click = (page: Page, selector: string) => widget(page).locator(selector).first().click()

/** Répond aux 5 étapes puis soumet avec consentement. */
async function play(page: Page): Promise<void> {
  await click(page, '[data-reco-action="start"]')
  await widget(page).locator('[data-reco-options="level"] input').first().check()
  await click(page, '[data-reco-action="next"]')
  await widget(page).locator('[data-reco-options="fields"] input').first().check()
  await click(page, '[data-reco-action="next"]')
  await widget(page).locator('[data-reco-options="destinations"] input').first().check()
  await click(page, '[data-reco-action="next"]')
  const select = widget(page).locator('[data-reco-options="languages"] select').first()
  await select.selectOption({ index: 1 })
  await click(page, '[data-reco-action="next"]')
  await widget(page).locator('[data-reco-options="budget"] input').first().check()
  await widget(page).locator('[data-reco-options="intake"] input').first().check()
  await widget(page).locator('[data-reco-input="consent"]').check()
  await click(page, '[data-reco-action="submit"]')
}

test.describe('parcours widget (mock MSW)', () => {
  test('nominal : 5 étapes puis cartes vers studely.com', async ({ page }) => {
    await open(page)
    await play(page)
    await expect.poll(() => state(page)).toBe('results')
    const links = widget(page).locator('[data-reco-results] [data-reco-field="url"]')
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('href', /https:\/\/(www\.)?studely\.com/)
    }
  })

  test('sans consentement, l’envoi est bloqué (R15)', async ({ page }) => {
    await open(page)
    await click(page, '[data-reco-action="start"]')
    await widget(page).locator('[data-reco-options="level"] input').first().check()
    await click(page, '[data-reco-action="next"]')
    await widget(page).locator('[data-reco-options="fields"] input').first().check()
    await click(page, '[data-reco-action="next"]')
    await widget(page).locator('[data-reco-options="destinations"] input').first().check()
    await click(page, '[data-reco-action="next"]')
    await widget(page)
      .locator('[data-reco-options="languages"] select')
      .first()
      .selectOption({ index: 1 })
    await click(page, '[data-reco-action="next"]')
    await widget(page).locator('[data-reco-options="budget"] input').first().check()
    await widget(page).locator('[data-reco-options="intake"] input').first().check()
    await click(page, '[data-reco-action="submit"]')
    await expect.poll(() => state(page)).toBe('step-5')
    await expect(widget(page).locator('[data-reco-error-for="consent"]')).not.toBeEmpty()
  })

  test('empty : panel dégradé avec CTA conseiller', async ({ page }) => {
    await open(page, 'empty')
    await play(page)
    await expect.poll(() => state(page)).toBe('empty')
    await expect(
      widget(page).locator('[data-reco-panel="empty"] [data-reco-action="advisor"]')
    ).toHaveAttribute('href', /\/mexique#contact/)
  })

  test('rate : 429 affiche l’erreur et verrouille Réessayer', async ({ page }) => {
    await open(page, 'rate')
    await play(page)
    await expect.poll(() => state(page)).toBe('error')
    await expect(widget(page).locator('[data-reco-action="retry"]')).toBeDisabled()
  })

  test('brouillon : rechargement restaure l’étape mais pas le consentement', async ({ page }) => {
    await open(page)
    await click(page, '[data-reco-action="start"]')
    await widget(page).locator('[data-reco-options="level"] input').first().check()
    await click(page, '[data-reco-action="next"]')
    await widget(page).locator('[data-reco-options="fields"] input').first().check()
    await click(page, '[data-reco-action="next"]')
    await page.reload()
    await expect.poll(() => state(page)).toBe('step-3')
    await expect(widget(page).locator('[data-reco-input="consent"]')).not.toBeChecked()
  })

  test('arabe : dir=rtl et parcours complet', async ({ page }) => {
    await open(page, 'nominal', 'ar')
    await expect(widget(page)).toHaveAttribute('dir', 'rtl')
    await play(page)
    await expect.poll(() => state(page)).toBe('results')
  })

  // R14 : aucun débordement sur un écran de 360 px, quel que soit le projet.
  test('mobile 360 px : pas de débordement horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await open(page)
    await click(page, '[data-reco-action="start"]')
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(360)
  })
})
