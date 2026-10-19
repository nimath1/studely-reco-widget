import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Audit axe-core sur chaque état du widget (§12.2) : zéro violation
 * « serious » ou « critical » acceptée (R13, WCAG 2.2 AA).
 */
async function open(page: Page, scenario = 'nominal'): Promise<void> {
  await page.goto(`/?recoMock=${scenario}`)
  await expect(
    page.locator('[data-reco-widget] [data-reco-options="level"] input').first()
  ).toBeAttached()
}

const widget = (page: Page) => page.locator('[data-reco-widget]')

async function expectAccessible(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).include('[data-reco-widget]').analyze()
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, `violations axe sur ${label}`).toEqual([])
}

async function toStep(page: Page, step: number): Promise<void> {
  await widget(page).locator('[data-reco-action="start"]').first().click()
  const picks: Record<number, () => Promise<void>> = {
    2: async () => {
      await widget(page).locator('[data-reco-options="level"] input').first().check()
      await widget(page).locator('[data-reco-action="next"]').first().click()
    },
    5: async () => {
      for (const field of ['level', 'fields', 'destinations']) {
        await widget(page).locator(`[data-reco-options="${field}"] input`).first().check()
        await widget(page).locator('[data-reco-action="next"]').first().click()
      }
      await widget(page)
        .locator('[data-reco-options="languages"] select')
        .first()
        .selectOption({ index: 1 })
      await widget(page).locator('[data-reco-action="next"]').first().click()
    }
  }
  if (step === 5) await picks[5]!()
  else if (step > 1) await picks[step]!()
}

test.describe('axe-core par état', () => {
  test('intro et étapes sans violation sérieuse', async ({ page }) => {
    await open(page)
    await expectAccessible(page, 'fallback/intro')
    await toStep(page, 5)
    await expectAccessible(page, 'step-5')
  })

  test('results sans violation sérieuse', async ({ page }) => {
    await open(page)
    await toStep(page, 5)
    await widget(page).locator('[data-reco-options="budget"] input').first().check()
    await widget(page).locator('[data-reco-options="intake"] input').first().check()
    await widget(page).locator('[data-reco-input="consent"]').check()
    await widget(page).locator('[data-reco-action="submit"]').first().click()
    await expect.poll(() => widget(page).getAttribute('data-reco-state')).toBe('results')
    await expectAccessible(page, 'results')
  })

  test('error sans violation sérieuse', async ({ page }) => {
    await open(page, 'server')
    await toStep(page, 5)
    await widget(page).locator('[data-reco-options="budget"] input').first().check()
    await widget(page).locator('[data-reco-options="intake"] input').first().check()
    await widget(page).locator('[data-reco-input="consent"]').check()
    await widget(page).locator('[data-reco-action="submit"]').first().click()
    await expect.poll(() => widget(page).getAttribute('data-reco-state')).toBe('error')
    await expectAccessible(page, 'error')
  })
})
