import { expect, test, type Page } from '@playwright/test'

/**
 * Page de dev : le mock MSW est activé par ?recoMock=<scénario>, la locale
 * par ?lang=. Attente web-first : le widget est prêt quand les options de
 * l'étape 1 sont rendues (dictionnaire statique local ; POST /chat SSE
 * intercepté par le worker MSW).
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
  test('nominal : 5 étapes puis réponse du bot et liens studely.com', async ({ page }) => {
    await open(page)
    await play(page)
    await expect.poll(() => state(page)).toBe('results')
    await expect(
      widget(page).locator('[data-reco-results] [data-reco-field="text"]')
    ).not.toBeEmpty()
    const links = widget(page).locator('[data-reco-results] [data-reco-field="links"] a')
    await expect(links).toHaveCount(3)
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('href', /https:\/\/([\w-]+\.)*studely\.com/)
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

  test('coquille : ouverture, fermeture et Échap rendent le focus au lanceur', async ({ page }) => {
    await open(page)
    await click(page, '[data-reco-action="start"]')
    const input = widget(page).locator('[data-reco-options="level"] input').first()
    await input.check()
    await click(page, '[data-reco-close]')
    await expect(widget(page)).not.toHaveAttribute('data-reco-open', '')
    await expect(page.locator('[data-reco-launcher]')).toBeFocused()
    // The draft survives closing: the selection is still there.
    await page.locator('[data-reco-launcher]').click()
    await expect(input).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-reco-launcher]')).toBeFocused()
    await expect(page.locator('[data-reco-launcher]')).toHaveAttribute('aria-expanded', 'false')
  })

  test('réouverture à l’étape 5 : la légende active prend le focus', async ({ page }) => {
    await open(page)
    await click(page, '[data-reco-action="start"]')
    for (const field of ['level', 'fields', 'destinations']) {
      await widget(page).locator(`[data-reco-options="${field}"] input`).first().check()
      await click(page, '[data-reco-action="next"]')
    }
    await widget(page)
      .locator('[data-reco-options="languages"] select')
      .first()
      .selectOption({ index: 1 })
    await click(page, '[data-reco-action="next"]')
    await click(page, '[data-reco-close]')
    await page.locator('[data-reco-launcher]').click()
    // The active question (step 5) regains focus, not the first step.
    await expect(widget(page).locator('[data-reco-step="5"] legend')).toBeFocused()
    // And the first budget choice is visible in the scrolling body.
    const budget = widget(page).locator('[data-reco-options="budget"] input').first()
    await expect(budget).toBeInViewport()
  })

  test('historique : paires question/réponse en avant, nettoyé au retour', async ({ page }) => {
    await open(page)
    await click(page, '[data-reco-action="start"]')
    const levelLabel = await widget(page)
      .locator('[data-reco-options="level"] [data-reco-field="label"]')
      .first()
      .textContent()
    await widget(page).locator('[data-reco-options="level"] input').first().check()
    await click(page, '[data-reco-action="next"]')
    // At step 2, question 1 and the chosen answer appear as bubbles.
    const history = widget(page).locator('[data-reco-history] [data-reco-msg]')
    await expect(history).toHaveCount(2)
    await expect(history.first()).toContainText('niveau')
    await expect(history.nth(1)).toHaveText(levelLabel!.trim())
    await widget(page).locator('[data-reco-options="fields"] input').first().check()
    await click(page, '[data-reco-action="next"]')
    await expect(history).toHaveCount(4)
    // Back to step 2: the future 'destinations' answer disappears.
    await click(page, '[data-reco-action="back"]')
    await expect(history).toHaveCount(2)
  })

  test('étape 5 : groupes distincts, footer d’action visible (360x740)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await open(page)
    await click(page, '[data-reco-action="start"]')
    for (const field of ['level', 'fields', 'destinations']) {
      await widget(page).locator(`[data-reco-options="${field}"] input`).first().check()
      await click(page, '[data-reco-action="next"]')
    }
    await widget(page)
      .locator('[data-reco-options="languages"] select')
      .first()
      .selectOption({ index: 1 })
    await click(page, '[data-reco-action="next"]')
    await expect.poll(() => state(page)).toBe('step-5')
    // Distinct groups, yearly label: no giant consent-style card.
    await expect(widget(page).locator('[data-reco-group]').first()).toHaveText('Budget annuel')
    const budgetCard = widget(page).locator('[data-reco-options="budget"] label').first()
    const budgetBox = await budgetCard.boundingBox()
    expect(budgetBox!.height).toBeLessThan(80)
    // On arrival at step 5, the first budget choice is visible in the
    // scrolling body, above the action footer.
    const geo = await page.evaluate(() => {
      const body = document.querySelector('[data-reco-body]')!.getBoundingClientRect()
      const card = document
        .querySelector('[data-reco-options="budget"] label')!
        .getBoundingClientRect()
      const footer = document
        .querySelector('form > div:has(> [data-reco-action="back"])')!
        .getBoundingClientRect()
      const submit = document.querySelector('[data-reco-action="submit"]')!.getBoundingClientRect()
      const hit = document.elementFromPoint(
        submit.x + submit.width / 2,
        submit.y + submit.height - 4
      )
      return {
        body,
        card,
        footer,
        submit,
        hitAction: hit?.closest?.('[data-reco-action]')?.getAttribute('data-reco-action') ?? null
      }
    })
    // The active question sits at the top of the body, choices below.
    expect(geo.card.top).toBeGreaterThanOrEqual(geo.body.top)
    expect(geo.card.bottom).toBeLessThan(geo.footer.top)
    // The submit button is fully inside the window and clickable
    // (no overlap from the advisor bar).
    expect(geo.submit.bottom).toBeLessThanOrEqual(geo.body.bottom)
    expect(geo.hitAction).toBe('submit')
  })

  test('étape 5 : footer visible sur viewport desktop court (520 px)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 520 })
    await open(page)
    await click(page, '[data-reco-action="start"]')
    for (const field of ['level', 'fields', 'destinations']) {
      await widget(page).locator(`[data-reco-options="${field}"] input`).first().check()
      await click(page, '[data-reco-action="next"]')
    }
    await widget(page)
      .locator('[data-reco-options="languages"] select')
      .first()
      .selectOption({ index: 1 })
    await click(page, '[data-reco-action="next"]')
    const submitBox = await widget(page).locator('[data-reco-action="submit"]').boundingBox()
    expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(520)
  })
})
