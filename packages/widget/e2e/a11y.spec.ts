import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Audit axe-core sur chaque état du widget (§12.2) : zéro violation
 * « serious » ou « critical » acceptée (R13, WCAG 2.2 AA).
 */
async function open(page: Page, scenario = 'nominal'): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/?recoMock=${scenario}`)
  await page.locator('[data-reco-launcher]').click()
  await expect(
    page.locator('[data-reco-widget] [data-reco-msg="assistant"]').first()
  ).toBeAttached()
}

const widget = (page: Page) => page.locator('[data-reco-widget]')
const thread = (page: Page) => widget(page).locator('[data-reco-thread]')

async function expectAccessible(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).include('[data-reco-widget]').analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, `violations axe sur ${label}`).toEqual([])
}

test.describe('axe-core par état', () => {
  test('accueil et réponse sans violation sérieuse', async ({ page }) => {
    await open(page)
    await expectAccessible(page, 'accueil')
    await thread(page).locator('[data-reco-send]').first().click()
    await expect(thread(page).locator('[data-reco-msg="assistant"]')).toHaveCount(2, {
      timeout: 10_000
    })
    await expectAccessible(page, 'réponse avec liens')
  })

  test('empty et formulaire conseiller sans violation sérieuse', async ({ page }) => {
    await open(page, 'empty')
    await thread(page).locator('[data-reco-send]').first().click()
    const reply = thread(page).locator('[data-reco-msg="assistant"]').nth(1)
    await expect(reply).toContainText('Aucun parcours', { timeout: 10_000 })
    await expectAccessible(page, 'empty')
    await reply.locator('[data-reco-action="advisor"]').click()
    await expect(thread(page).locator('[data-reco-handoff]')).toBeVisible()
    await expectAccessible(page, 'formulaire conseiller')
  })

  test('error sans violation sérieuse', async ({ page }) => {
    await open(page, 'server')
    await thread(page).locator('[data-reco-send]').first().click()
    await expect(widget(page).locator('[data-reco-error]')).toBeVisible({ timeout: 10_000 })
    await expectAccessible(page, 'error')
  })
})
