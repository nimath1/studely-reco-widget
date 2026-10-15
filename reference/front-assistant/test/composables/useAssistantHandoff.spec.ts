import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useAssistantHandoffChannel, useReceivedHandoff } from '~/composables/useAssistantHandoff'
import type { AssistantHandoff } from '~/utils/assistant-handoff'

type OnReceive = (handoff: AssistantHandoff | null, previous: AssistantHandoff | null) => void

function mountReceiver(onReceive: OnReceive = vi.fn()) {
  const Receiver = defineComponent({
    setup() {
      const handoff = useReceivedHandoff(onReceive)
      return () => h('p', handoff.value?.need ?? '—')
    }
  })
  return { wrapper: mount(Receiver), onReceive }
}

beforeEach(() => {
  useAssistantHandoffChannel().channel.value = { value: null, revision: 0 }
  window.history.replaceState(null, '')
})

afterEach(() => {
  window.history.replaceState(null, '')
})

describe('useReceivedHandoff', () => {
  it("lit le besoin de l'entrée d'historique au montage", async () => {
    window.history.replaceState({ assistantHandoff: { need: 'former au SST', headcount: 8 } }, '')
    const { wrapper, onReceive } = mountReceiver()
    await nextTick()

    expect(wrapper.text()).toBe('former au SST')
    expect(onReceive).toHaveBeenCalledWith({ need: 'former au SST', headcount: 8 }, null)
  })

  it('reste vide sans transmission', async () => {
    const { wrapper, onReceive } = mountReceiver()
    await nextTick()

    expect(wrapper.text()).toBe('—')
    expect(onReceive).toHaveBeenCalledWith(null, null)
  })

  it('reçoit chaque publication du panneau tant que la page reste montée', async () => {
    window.history.replaceState({ assistantHandoff: { need: 'former au SST' } }, '')
    const { wrapper, onReceive } = mountReceiver()
    await nextTick()

    // Autre recommandation choisie depuis le panneau : pas de remontage.
    useAssistantHandoffChannel().publish({ need: 'former des caristes', location: 'Lyon' })
    await nextTick()

    expect(wrapper.text()).toBe('former des caristes')
    expect(onReceive).toHaveBeenLastCalledWith(
      { need: 'former des caristes', location: 'Lyon' },
      { need: 'former au SST' }
    )
  })

  it('traite deux publications identiques comme deux signaux et accepte le retrait', async () => {
    const { wrapper, onReceive } = mountReceiver()
    await nextTick()
    const { publish } = useAssistantHandoffChannel()

    publish({ need: 'sst' })
    await nextTick()
    publish({ need: 'sst' })
    await nextTick()
    expect(onReceive).toHaveBeenCalledTimes(3)

    publish(null)
    await nextTick()
    expect(wrapper.text()).toBe('—')
  })

  it("n'écoute plus après le démontage", async () => {
    const { wrapper, onReceive } = mountReceiver()
    await nextTick()
    wrapper.unmount()

    useAssistantHandoffChannel().publish({ need: 'sst' })
    await nextTick()

    expect(onReceive).toHaveBeenCalledTimes(1)
  })
})
