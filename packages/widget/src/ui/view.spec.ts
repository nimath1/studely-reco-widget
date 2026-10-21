import { mountView, nextTick } from './view'
import { mountWidget } from '../testing/widget.fixture'

let el: HTMLElement

beforeEach(() => {
  el = mountWidget()
})

const input = () => el.querySelector<HTMLTextAreaElement>('[data-reco-input="message"]')!
const send = () => el.querySelector<HTMLButtonElement>('[data-reco-action="send"]')!
const retry = () => el.querySelector<HTMLButtonElement>('[data-reco-action="retry"]')!

describe('mountView (chat)', () => {
  it('saisie et envoi verrouillés tant que consent=false et pending=false', async () => {
    const view = mountView(el)
    expect(input().disabled).toBe(true)
    expect(send().disabled).toBe(true)
    expect(retry().disabled).toBe(false)

    view.state.consent = true
    await nextTick()
    expect(input().disabled).toBe(false)
    expect(send().disabled).toBe(false)

    view.state.pending = true
    await nextTick()
    expect(input().disabled).toBe(true)
    expect(send().disabled).toBe(true)

    view.state.retryLocked = true
    await nextTick()
    expect(retry().disabled).toBe(true)
    view.unmount()
  })

  it('consentement pré-coché dans le gabarit hôte → consent=true', () => {
    el.querySelector<HTMLInputElement>('[data-reco-input="consent"]')!.checked = true
    const view = mountView(el)
    expect(view.state.consent).toBe(true)
    view.unmount()
  })

  it('live alimente [data-reco-live]', async () => {
    const view = mountView(el)
    view.state.live = 'Annonce'
    await nextTick()
    expect(el.querySelector('[data-reco-live]')!.textContent).toBe('Annonce')
    view.unmount()
  })
})
