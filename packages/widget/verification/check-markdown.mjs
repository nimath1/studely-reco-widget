/**
 * Manual verification: assistant Markdown rendering in a real browser.
 * The POST /chat call is intercepted and fulfilled locally — no real
 * API request ever leaves the page.
 * Usage: node verification/check-markdown.mjs [baseUrl]
 */
import { chromium, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const SHOTS = 'verification/screenshots'
mkdirSync(SHOTS, { recursive: true })

const TEXT = [
  'Voici deux pistes pour ton dossier :',
  '',
  '- **Via application** : dépose ta demande en ligne [S1]',
  '- **Via conseiller** : prends rendez-vous [S4][S5]'
].join('\n')
const SSE =
  `event: delta\ndata: ${JSON.stringify({ text: TEXT })}\n\n` +
  `event: final\ndata: ${JSON.stringify({ session_id: 'md-1' })}\n\n`

async function check(context, width, height, shot) {
  const page = await context.newPage()
  await page.setViewportSize({ width, height })
  await page.route('**/chat', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: SSE })
  )
  await page.goto(`${BASE}/?lang=fr`)
  await page.locator('[data-reco-launcher]').click()
  const consent = page.locator('[data-reco-input="consent"]')
  if (await consent.count()) {
    await consent.check()
    await page.locator('[data-reco-action="send"]').waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('[data-reco-action="send"]')?.disabled)
  }
  await page.locator('[data-reco-input="message"]').fill('pistes ?')
  await page.locator('[data-reco-action="send"]').click()
  const reply = page.locator('[data-reco-thread] > [data-reco-msg="assistant"]').last()
  const scope = reply.locator('[data-reco-field="text"]')
  await scope.locator('ul > li').first().waitFor()
  // Wait for a fully rendered, visible reply settled in the viewport
  // before measuring or shooting.
  await expect(reply).toBeVisible()
  await reply.scrollIntoViewIfNeeded()
  await expect(reply).toBeInViewport()
  // Let entry animations finish, then settle two frames.
  await reply.evaluate(async (el) => {
    await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })

  const result = await scope.evaluate((el) => {
    const items = [...el.querySelectorAll('ul > li')]
    const doc = document.documentElement
    return {
      whiteSpace: getComputedStyle(el).whiteSpace,
      paragraphs: [...el.querySelectorAll('p')].map((p) => p.textContent),
      strong: items.map((li) => li.querySelector('strong')?.textContent),
      itemCount: items.length,
      hasMarkers: el.textContent.includes('[S1]') && el.textContent.includes('[S4][S5]'),
      anchors: el.querySelectorAll('a').length,
      media: el.querySelectorAll('img, script, svg, video').length,
      overflowBody: document.querySelector('[data-reco-body]')
        ? document.querySelector('[data-reco-body]').scrollWidth -
          document.querySelector('[data-reco-body]').clientWidth
        : 0,
      overflowPage: doc.scrollWidth - doc.clientWidth
    }
  })
  await page.screenshot({ path: `${SHOTS}/${shot}`, fullPage: false })
  await page.close()
  return result
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const failures = []
for (const [width, height, shot] of [
  [1280, 800, 'markdown-desktop.png'],
  [390, 844, 'markdown-390.png']
]) {
  const r = await check(context, width, height, shot)
  console.log(`${width}x${height}:`, JSON.stringify(r, null, 1))
  if (r.whiteSpace !== 'normal') failures.push(`${width}: whiteSpace=${r.whiteSpace}`)
  if (r.itemCount !== 2) failures.push(`${width}: items=${r.itemCount}`)
  if (r.strong[0] !== 'Via application') failures.push(`${width}: strong=${r.strong[0]}`)
  if (!r.hasMarkers) failures.push(`${width}: markers missing`)
  if (r.anchors !== 0 || r.media !== 0) failures.push(`${width}: anchors/media`)
  if (r.overflowPage > 1 || r.overflowBody > 1)
    failures.push(`${width}: overflow body=${r.overflowBody} page=${r.overflowPage}`)
}
await browser.close()
if (failures.length) {
  console.error('FAIL:', failures.join(' | '))
  process.exit(1)
}
console.log('OK: markdown rendered, white-space normal, no overflow')
