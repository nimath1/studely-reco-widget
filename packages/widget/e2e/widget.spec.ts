import { expect, test, type Page } from '@playwright/test'

/**
 * Parcours chat sur mock MSW (`?recoMock=<scénario>`, `?lang=`).
 * Attente web-first : le widget est prêt quand la bulle d'accueil
 * (seul `data-reco-msg="assistant"` initial) est rendue — POST /chat
 * SSE intercepté par le worker MSW, aucun réseau réel.
 */
async function open(page: Page, scenario = 'nominal', lang = 'fr'): Promise<void> {
  await page.goto(`/?recoMock=${scenario}&lang=${lang}`)
  await page.locator('[data-reco-launcher]').click()
  await expect(widget(page)).toHaveAttribute('data-reco-open', '')
  await expect(thread(page).locator('[data-reco-msg="assistant"]')).toHaveCount(1)
}

const widget = (page: Page) => page.locator('[data-reco-widget]')
const thread = (page: Page) => widget(page).locator('[data-reco-thread]')

/** Envoie la première suggestion d'amorce et attend la réponse du bot. */
async function ask(page: Page): Promise<void> {
  await thread(page).locator('[data-reco-send]').first().click()
  await expect(thread(page).locator('[data-reco-msg="user"]')).toHaveCount(1)
}

test.describe('parcours widget (mock MSW)', () => {
  test('nominal : réponse du bot et trois liens studely.com', async ({ page }) => {
    await open(page)
    await ask(page)
    const reply = thread(page).locator('[data-reco-msg="assistant"]').nth(1)
    await expect(reply).toBeAttached({ timeout: 10_000 })
    await expect(reply.locator('[data-reco-field="text"]')).not.toBeEmpty()
    const links = reply.locator('[data-reco-field="links"] button[data-reco-send]')
    await expect(links).toHaveCount(3)
    // L'envoi a valu consentement (continuation) : la phase chat est active.
    await expect(widget(page)).toHaveAttribute('data-reco-state', 'chat')
  })

  test('empty : aucun parcours, CTA conseiller et mini-formulaire', async ({ page }) => {
    await open(page, 'empty')
    await ask(page)
    const reply = thread(page).locator('[data-reco-msg="assistant"]').nth(1)
    await expect(reply).toContainText('Aucun parcours', { timeout: 10_000 })
    // Sortie conseiller à portée : le CTA clone le formulaire de contact.
    await reply.locator('[data-reco-action="advisor"]').click()
    const handoff = thread(page).locator('[data-reco-handoff]')
    await expect(handoff).toBeVisible()
    await expect(handoff.locator('[data-reco-input="handoff-name"]')).toBeFocused()
    // La demande part vraiment : PUT profil + POST handoff (mock MSW) puis
    // la carte affiche la confirmation.
    const requests: string[] = []
    page.on('request', (req) => {
      if (req.method() !== 'GET') requests.push(`${req.method()} ${req.url()}`)
    })
    await handoff.locator('[data-reco-input="handoff-name"]').fill('Awa')
    await handoff.locator('[data-reco-input="handoff-email"]').fill('awa@exemple.com')
    await handoff.locator('[data-reco-action="handoff"]').click()
    await expect(thread(page).locator('[data-reco-msg="assistant"]').last()).toContainText(
      'conseiller te contactera',
      { timeout: 10_000 }
    )
    expect(requests.some((r) => r.startsWith('PUT') && r.includes('/users/'))).toBe(true)
    expect(requests.some((r) => r.startsWith('POST') && r.includes('/handoff'))).toBe(true)
  })

  test('rate : 429 affiche l’erreur et verrouille Réessayer', async ({ page }) => {
    await open(page, 'rate')
    await ask(page)
    const error = widget(page).locator('[data-reco-error]')
    await expect(error).toBeVisible({ timeout: 10_000 })
    await expect(error.locator('[data-reco-error-message]')).toContainText('Trop de demandes')
    await expect(error.locator('[data-reco-action="retry"]')).toBeDisabled()
  })

  test('server : erreur 500, Réessayer reposte le même message', async ({ page }) => {
    await open(page, 'server')
    await ask(page)
    const error = widget(page).locator('[data-reco-error]')
    await expect(error).toBeVisible({ timeout: 10_000 })
    const retry = error.locator('[data-reco-action="retry"]')
    await expect(retry).toBeEnabled()
    // Le mock sert toujours 500 : la carte erreur revient après le repost.
    await retry.click()
    await expect(error).toBeVisible({ timeout: 10_000 })
    await expect(thread(page).locator('[data-reco-msg="user"]')).toHaveCount(1)
  })

  test('bad-url : citations hors studely.com écartées, repli conseiller', async ({ page }) => {
    await open(page, 'bad-url')
    await ask(page)
    const reply = thread(page).locator('[data-reco-msg="assistant"]').nth(1)
    await expect(reply).toContainText('Aucun parcours', { timeout: 10_000 })
    await expect(reply.locator('[data-reco-field="links"] > *')).toHaveCount(0)
    await expect(reply.locator('[data-reco-action="advisor"]')).toBeVisible()
  })

  test('html-reason : le HTML de la réponse reste du texte brut', async ({ page }) => {
    await open(page, 'html-reason')
    await ask(page)
    const reply = thread(page).locator('[data-reco-msg="assistant"]').nth(1)
    await expect(reply).toContainText('<img src=x onerror=alert(1)>', { timeout: 10_000 })
    await expect(reply.locator('img')).toHaveCount(0)
  })

  test('arabe : dir=rtl et réponse complète', async ({ page }) => {
    await open(page, 'nominal', 'ar')
    await expect(widget(page)).toHaveAttribute('dir', 'rtl')
    await ask(page)
    const reply = thread(page).locator('[data-reco-msg="assistant"]').nth(1)
    await expect(reply).toBeAttached({ timeout: 10_000 })
    await expect(reply.locator('[data-reco-field="links"] button')).toHaveCount(3)
  })
})
