import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureChallenge, resetChallenge, turnstileToken } from './turnstile'
import { mountWidget } from '../testing/widget.fixture'

const turnstile = () => ({
  render: vi.fn(() => 'widget-1'),
  getResponse: vi.fn(() => 'token-abc'),
  reset: vi.fn()
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete window.turnstile
  document.body.replaceChildren()
})

describe('turnstile', () => {
  it('no-op sans site key configurée', async () => {
    const el = mountWidget()
    await ensureChallenge(el)
    expect(el.querySelector('[data-reco-turnstile]')?.children.length).toBe(0)
    expect(document.head.querySelector('script')).toBeNull()
  })

  it('no-op sans conteneur data-reco-turnstile', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'key-1')
    const el = document.createElement('div')
    await ensureChallenge(el)
    expect(window.turnstile).toBeUndefined()
  })

  it('rend le défi une fois quand turnstile est déjà chargé', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'key-1')
    window.turnstile = turnstile()
    const el = mountWidget()

    await ensureChallenge(el)
    await ensureChallenge(el)

    const container = el.querySelector('[data-reco-turnstile]')
    expect(window.turnstile.render).toHaveBeenCalledTimes(1)
    expect(window.turnstile.render).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ sitekey: 'key-1' })
    )
    // Aucun script injecté : l'API était déjà disponible.
    expect(document.head.querySelector('script')).toBeNull()
  })

  it('expose le jeton et relance le défi', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'key-1')
    window.turnstile = turnstile()
    const el = mountWidget()

    expect(turnstileToken(el)).toBeUndefined()
    await ensureChallenge(el)
    expect(turnstileToken(el)).toBe('token-abc')

    resetChallenge(el)
    expect(window.turnstile.reset).toHaveBeenCalledWith('widget-1')
  })

  it('ne rend plus après abort', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'key-1')
    window.turnstile = turnstile()
    const el = mountWidget()
    const controller = new AbortController()
    controller.abort()

    await ensureChallenge(el, controller.signal)
    expect(window.turnstile.render).not.toHaveBeenCalled()
  })
})
