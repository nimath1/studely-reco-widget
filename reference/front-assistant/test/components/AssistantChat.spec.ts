import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import AssistantChat from '~/components/Assistant/Chat.vue'
import { useAssistantHandoffChannel } from '~/composables/useAssistantHandoff'
import { useAssistantLauncher } from '~/composables/useAssistantLauncher'

const routeMock = (globalThis as Record<string, unknown>).useRoute as () => {
  path: string
  fullPath: string
}

const fetchMock = vi.fn()

vi.stubGlobal('$fetch', fetchMock)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiBase: 'http://api.test' } }))
vi.stubGlobal('logServerError', vi.fn())
vi.stubGlobal('internalSsrHeaders', () => undefined)

const conversationStub = {
  name: 'AssistantConversation',
  props: ['entries', 'pending', 'unavailable', 'contextChips', 'degraded', 'notice'],
  emits: ['send', 'edit', 'stop', 'retry', 'reset', 'close', 'select', 'compare'],
  template:
    '<div class="conversation">' +
    '<button class="stop" @click="$emit(\'stop\')" />' +
    '<button class="reset" @click="$emit(\'reset\')" />' +
    '<button class="close" @click="$emit(\'close\')" />' +
    '<a class="link" href="/centres/demande-de-formation?formation=sst" data-assistant-handoff>Demander</a>' +
    '<a class="advisor" href="/parler-a-votre-conseiller" data-advisor-escalation="out_of_catalog" data-assistant-handoff>Conseiller</a>' +
    '<a class="advisor-unavailable" href="/parler-a-votre-conseiller" data-advisor-escalation="unavailable" data-assistant-handoff>Conseiller</a>' +
    '<a class="plain" href="/formations">Catalogue</a>' +
    '</div>'
}

// Le widget est unique dans l'application : chaque instance montée observe
// l'état global du lanceur, un widget d'un test précédent réagirait encore.
const mounted: VueWrapper[] = []

function mountChat() {
  const wrapper = mount(AssistantChat, {
    global: { stubs: { AssistantConversation: conversationStub } }
  })
  mounted.push(wrapper)
  return wrapper
}

function conversation(wrapper: ReturnType<typeof mountChat>) {
  return wrapper.findComponent(conversationStub)
}

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

type Pushed = Record<string, unknown> & { event: string }

function pushed(): Pushed[] {
  return (window.dataLayer ?? []) as Pushed[]
}

// Le chemin de page est posé par le dataLayer (spec de useAssistantAnalytics) :
// les jalons sont comparés sans lui.
const withoutPage = ({ page_path: _page, ...event }: Pushed) => event

/** Jalons `ai_*` poussés depuis le montage, sans leurs paramètres. */
function events(): string[] {
  return aiEvents().map((e) => e.event as string)
}

/** Jalons `ai_*` complets. */
function aiEvents(): Record<string, unknown>[] {
  return pushed()
    .filter((e) => e.event.startsWith('ai_'))
    .map(withoutPage)
}

/** Jalons du module Chatbot. */
function chatbotEvents(): Record<string, unknown>[] {
  return pushed()
    .filter((e) => e.event.startsWith('chatbot_'))
    .map(withoutPage)
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ kind: 'clarify', text: 'ok' })
  window.dataLayer = []
  window.history.replaceState(null, '')
  useAssistantHandoffChannel().channel.value = { value: null, revision: 0 }
  const launcher = useAssistantLauncher()
  launcher.isOpen.value = false
  launcher.pendingMessage.value = null
  launcher.context.value = {}
})

describe('AssistantChat', () => {
  it('shows a floating launcher and opens the panel', async () => {
    const wrapper = mountChat()
    const launcher = wrapper.find('button[aria-label="Ouvrir la recherche assistée"]')
    expect(launcher.exists()).toBe(true)
    expect(wrapper.find('dialog').exists()).toBe(false)

    await launcher.trigger('click')
    expect(wrapper.find('dialog').exists()).toBe(true)
  })

  it('greets the user when opened without a message', () => {
    const launcher = useAssistantLauncher()
    launcher.open()
    const wrapper = mountChat()

    const entries = wrapper.findComponent(conversationStub).props('entries')
    expect(entries).toHaveLength(1)
    expect(entries[0].role).toBe('assistant')
    expect(entries[0].content).toBe('Bonjour, comment puis-je vous aider aujourd’hui ?')
    expect(entries[0].reply?.suggestions).toEqual([
      'Je veux former mes salariés au SST',
      'Je cherche une formation CACES R486',
      'Je veux former mes équipes à l’ATEX'
    ])
  })

  it('sends the queued entry-point message on open', async () => {
    const launcher = useAssistantLauncher()
    launcher.open({ context: { source: 'centre', location: 'Créteil' }, message: 'former au SST' })
    const wrapper = mountChat()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const entries = wrapper.findComponent(conversationStub).props('entries')
    expect(entries[0]).toMatchObject({ role: 'user', content: 'former au SST' })
    const body = fetchMock.mock.calls[0]?.[1]?.body
    expect(body.context).toEqual({ source: 'centre', location: 'Créteil' })
  })

  it('sends a message queued while the panel is already open', async () => {
    const launcher = useAssistantLauncher()
    launcher.open()
    const wrapper = mountChat()
    await vi.waitFor(() => expect(wrapper.find('dialog').exists()).toBe(true))

    launcher.open({ context: { source: 'home' }, message: 'un autre besoin' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const body = fetchMock.mock.calls.at(-1)?.[1]?.body
    expect(body.message).toBe('un autre besoin')
    expect(wrapper.find('dialog').exists()).toBe(true)
  })

  it('closes the panel when navigation occurs behind it', async () => {
    const launcher = useAssistantLauncher()
    launcher.open()
    const wrapper = mountChat()
    expect(wrapper.find('dialog').exists()).toBe(true)

    routeMock().fullPath = '/formations/sante/sst-sauveteur-secouriste-du-travail'
    await nextTick()
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(launcher.isOpen.value).toBe(false)
    routeMock().fullPath = '/'
  })

  it('closes the panel on a panel link click even without route change', async () => {
    const launcher = useAssistantLauncher()
    launcher.open()
    const wrapper = mountChat()
    expect(wrapper.find('dialog').exists()).toBe(true)

    // Même URL que la route courante : fullPath ne change pas, le clic
    // sur le lien doit quand même fermer le panneau.
    await wrapper.find('.conversation .link').trigger('click')
    expect(launcher.isOpen.value).toBe(false)
  })

  it('closes the panel on close event', async () => {
    const launcher = useAssistantLauncher()
    launcher.open()
    const wrapper = mountChat()

    await wrapper.find('.conversation .close').trigger('click')
    expect(wrapper.find('dialog').exists()).toBe(false)
  })

  it('greets again after a reset', async () => {
    const launcher = useAssistantLauncher()
    launcher.open()
    const wrapper = mountChat()
    wrapper.findComponent(conversationStub).props('entries').push({
      role: 'user',
      content: 'bonjour'
    })

    await wrapper.find('.conversation .reset').trigger('click')
    const entries = wrapper.findComponent(conversationStub).props('entries')
    expect(entries).toHaveLength(1)
    expect(entries[0].role).toBe('assistant')
  })

  describe('analytics', () => {
    it('tracks the search start with the entry-point source on open', async () => {
      const wrapper = mountChat()
      expect(events()).toEqual([])

      await wrapper.find('button[aria-label="Ouvrir la recherche assistée"]').trigger('click')
      expect(aiEvents()).toEqual([{ event: 'ai_search_start' }])

      useAssistantLauncher().close()
      await nextTick()
      useAssistantLauncher().open({ context: { source: 'catalogue' } })
      await nextTick()
      expect(aiEvents().at(-1)).toEqual({ event: 'ai_search_start', source: 'catalogue' })
    })

    it('tracks an entry-point message as a search submit, then the clarification', async () => {
      useAssistantLauncher().open({ context: { source: 'home' }, message: 'former au SST' })
      mountChat()
      await vi.waitFor(() => expect(events()).toContain('ai_clarification_requested'))

      expect(aiEvents()).toEqual([
        { event: 'ai_search_start', source: 'home' },
        { event: 'ai_search_submit', source: 'home', turn: 1, via: 'entry' },
        { event: 'ai_clarification_requested', source: 'home', turn: 1 }
      ])
    })

    it('tracks a message sent after a clarification as its answer', async () => {
      fetchMock
        .mockResolvedValueOnce({ kind: 'clarify', text: 'Pour combien de personnes ?' })
        .mockResolvedValueOnce({
          kind: 'recommend',
          text: 'Nous vous recommandons',
          mode: 'ai',
          recommendations: [{ slug: 'sst' }, { slug: 'mac-sst' }]
        })
      useAssistantLauncher().open({ context: { source: 'home' } })
      const wrapper = mountChat()

      conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
      await vi.waitFor(() => expect(events()).toContain('ai_clarification_requested'))
      conversation(wrapper).vm.$emit('send', '8 salariés', 'suggestion')
      await vi.waitFor(() => expect(events()).toContain('ai_recommendation_display'))

      expect(aiEvents()).toEqual([
        { event: 'ai_search_start', source: 'home' },
        { event: 'ai_search_submit', source: 'home', turn: 1, via: 'text' },
        { event: 'ai_clarification_requested', source: 'home', turn: 1 },
        { event: 'ai_clarification_answer', source: 'home', turn: 2, via: 'suggestion' },
        { event: 'ai_recommendation_display', source: 'home', turn: 2, count: 2, mode: 'ai' }
      ])
    })

    it('tracks an edited message as a new search submit at its turn', async () => {
      useAssistantLauncher().open()
      const wrapper = mountChat()
      conversation(wrapper).vm.$emit('send', 'premier', 'text')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const id = conversation(wrapper).props('entries')[1].id

      conversation(wrapper).vm.$emit('edit', id, 'premier modifié')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

      expect(aiEvents()).toContainEqual({ event: 'ai_search_submit', turn: 1, via: 'edit' })
    })

    it('tracks a recommendation CTA with the entry-point source', async () => {
      useAssistantLauncher().open({ context: { source: 'formation', formationSlug: 'caces' } })
      const wrapper = mountChat()

      conversation(wrapper).vm.$emit('select', { slug: 'sst', rank: 'primary', action: 'sessions' })

      expect(aiEvents().at(-1)).toEqual({
        event: 'ai_recommendation_select',
        slug: 'sst',
        rank: 'primary',
        action: 'sessions',
        source: 'formation'
      })
    })

    it('ignores blank submissions', () => {
      useAssistantLauncher().open()
      const wrapper = mountChat()

      conversation(wrapper).vm.$emit('send', '   ', 'text')

      expect(fetchMock).not.toHaveBeenCalled()
      expect(events()).toEqual(['ai_search_start'])
    })

    it('does not count reopening an ongoing conversation as a new search', async () => {
      const launcher = useAssistantLauncher()
      launcher.open({ context: { source: 'home' } })
      const wrapper = mountChat()
      conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      launcher.close()
      await nextTick()
      launcher.open({ context: { source: 'header' } })
      await nextTick()

      expect(events().filter((e) => e === 'ai_search_start')).toHaveLength(1)
    })

    it('treats an entry-point message during a conversation as a new search', async () => {
      const launcher = useAssistantLauncher()
      launcher.open({ context: { source: 'home' } })
      const wrapper = mountChat()
      conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
      await vi.waitFor(() => expect(events()).toContain('ai_clarification_requested'))

      // Une précision est attendue, mais le message vient d'un point d'entrée.
      launcher.open({ context: { source: 'catalogue' }, message: 'un autre besoin' })
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

      // Nouveau début de recherche puis envoi « entry » au tour 2 — la réponse
      // à ce second tour peut déjà être tracée derrière.
      expect(aiEvents()).toContainEqual({ event: 'ai_search_start', source: 'catalogue' })
      expect(aiEvents()).toContainEqual({
        event: 'ai_search_submit',
        source: 'catalogue',
        turn: 2,
        via: 'entry'
      })
      expect(events().filter((e) => e === 'ai_search_start')).toHaveLength(2)
      expect(events()).not.toContain('ai_clarification_answer')
    })

    it('ignores panel submissions while a reply is pending', async () => {
      fetchMock.mockImplementationOnce(() => new Promise(() => {}))
      useAssistantLauncher().open()
      const wrapper = mountChat()

      conversation(wrapper).vm.$emit('send', 'premier', 'text')
      conversation(wrapper).vm.$emit('send', 'pendant l’analyse', 'suggestion')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      expect(events()).toEqual(['ai_search_start', 'ai_search_submit'])
      expect(
        conversation(wrapper)
          .props('entries')
          .filter((e: { role: string }) => e.role === 'user')
      ).toHaveLength(1)
    })

    it('keeps the source of the ongoing search when the panel is reopened from elsewhere', async () => {
      const launcher = useAssistantLauncher()
      launcher.open({ context: { source: 'home' } })
      const wrapper = mountChat()
      conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
      await vi.waitFor(() => expect(events()).toContain('ai_clarification_requested'))

      launcher.close()
      await nextTick()
      launcher.open({ context: { source: 'header' } })
      await nextTick()
      conversation(wrapper).vm.$emit('select', {
        slug: 'sst',
        rank: 'primary',
        action: 'formation'
      })

      // Pas de nouvelle recherche : la sélection reste attribuée à « home ».
      expect(aiEvents().at(-1)).toMatchObject({
        event: 'ai_recommendation_select',
        source: 'home'
      })
    })

    it('numbers queued entry-point messages by the turn they actually take', async () => {
      let resolveFirst: ((reply: unknown) => void) | undefined
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      const launcher = useAssistantLauncher()
      launcher.open({ context: { source: 'home' }, message: 'premier' })
      mountChat()
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      // Deux besoins transmis par des points d'entrée pendant l'analyse du premier.
      launcher.open({ context: { source: 'home' }, message: 'deuxième' })
      await nextTick()
      launcher.open({ context: { source: 'home' }, message: 'troisième' })
      await nextTick()
      resolveFirst?.({ kind: 'clarify', text: 'ok' })
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

      const submits = aiEvents()
        .filter((e) => e.event === 'ai_search_submit')
        .map((e) => e.turn)
      expect(submits).toEqual([1, 2, 3])
    })

    it('does not track nor send an edit whose message is unknown', async () => {
      useAssistantLauncher().open()
      const wrapper = mountChat()

      conversation(wrapper).vm.$emit('edit', 'unknown-id', 'nouveau besoin')
      await nextTick()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(events()).toEqual(['ai_search_start'])
    })
  })

  describe('chatbot module (tracking plan)', () => {
    it('tracks the panel opening, each message and the conversation end', async () => {
      const launcher = useAssistantLauncher()
      launcher.open({ context: { source: 'home' } })
      const wrapper = mountChat()
      conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
      await vi.waitFor(() => expect(events()).toContain('ai_clarification_requested'))

      launcher.close()
      await nextTick()

      const [open, sent, end] = chatbotEvents()
      expect(open).toEqual({
        event: 'chatbot_open',
        trigger_type: 'manuel',
        conversation_id: expect.any(String)
      })
      expect(sent).toEqual({
        event: 'chatbot_message_sent',
        conversation_id: open!.conversation_id,
        message_index: 1
      })
      // Accueil, message, question de précision : pas de recommandation.
      expect(end).toEqual({
        event: 'chatbot_conversation_end',
        conversation_id: open!.conversation_id,
        messages_count: 3,
        resolved: false,
        duration_seconds: expect.any(Number)
      })
      expect(chatbotEvents()).toHaveLength(3)
    })

    it('marks an automatic opening on an entry-point message and the advisor handoff', async () => {
      fetchMock.mockResolvedValue({ kind: 'out_of_catalog', text: 'Hors catalogue.', mode: 'ai' })
      useAssistantLauncher().open({ context: { source: 'catalogue' }, message: 'piloter un drone' })
      const wrapper = mountChat()
      await vi.waitFor(() => expect(events()).toContain('ai_no_results'))

      await wrapper.find('.conversation .advisor').trigger('click')

      expect(chatbotEvents().at(0)).toMatchObject({ event: 'chatbot_open', trigger_type: 'auto' })
      expect(chatbotEvents()).toContainEqual({
        event: 'chatbot_handoff_to_advisor',
        conversation_id: expect.any(String),
        reason: 'out_of_catalog',
        messages_count: 2
      })
      // Le clic ferme le panneau : la conversation se termine.
      expect(chatbotEvents().at(-1)).toMatchObject({
        event: 'chatbot_conversation_end',
        resolved: false
      })
    })

    it('labels suggestion clicks and starts a new conversation after a reset', async () => {
      useAssistantLauncher().open()
      const wrapper = mountChat()
      conversation(wrapper).vm.$emit('send', 'Je veux former mes salariés au SST', 'suggestion')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const first = chatbotEvents()[0]!.conversation_id

      await wrapper.find('.conversation .reset').trigger('click')
      conversation(wrapper).vm.$emit('send', 'autre besoin', 'text')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

      expect(chatbotEvents()).toContainEqual({
        event: 'chatbot_suggested_action_click',
        conversation_id: first,
        action_type: 'suggestion',
        action_label: 'Je veux former mes salariés au SST'
      })
      const last = chatbotEvents().at(-1)
      expect(last).toMatchObject({ event: 'chatbot_message_sent', message_index: 1 })
      expect(last!.conversation_id).not.toBe(first)
    })
  })

  describe('handoff', () => {
    it('publishes the need to mounted destinations when a handoff link is clicked', async () => {
      useAssistantLauncher().open()
      const wrapper = mountChat()
      conversation(wrapper).vm.$emit('send', 'former 8 salariés au SST', 'text')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      const { channel } = useAssistantHandoffChannel()

      await wrapper.find('.conversation .link').trigger('click')

      expect(channel.value).toEqual({ value: { need: 'former 8 salariés au SST' }, revision: 1 })
      // Navigation vers une autre URL : l'entrée courante n'est pas touchée,
      // le routeur porte le besoin dans l'état de la nouvelle entrée.
      expect(window.history.state).toBeNull()
    })

    it('writes the need into the current history entry when the link targets the displayed URL', async () => {
      routeMock().fullPath = '/centres/demande-de-formation?formation=sst'
      try {
        useAssistantLauncher().open()
        const wrapper = mountChat()
        conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

        // Même URL : la navigation est un no-op, aucune entrée n'est poussée.
        await wrapper.find('.conversation .link').trigger('click')

        expect(window.history.state).toEqual({ assistantHandoff: { need: 'former au SST' } })
      } finally {
        routeMock().fullPath = '/'
      }
    })

    it('hands the need over when the assistant was opened from the adviser page itself', async () => {
      // Le lien conseiller vise l'URL déjà affichée : navigation dupliquée,
      // ignorée par le routeur — le besoin passe par le canal et par
      // l'entrée d'historique courante.
      routeMock().fullPath = '/parler-a-votre-conseiller'
      try {
        useAssistantLauncher().open()
        const wrapper = mountChat()
        conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

        await wrapper.find('.conversation .advisor').trigger('click')

        expect(useAssistantHandoffChannel().channel.value).toEqual({
          value: { need: 'former au SST' },
          revision: 1
        })
        expect(window.history.state).toEqual({ assistantHandoff: { need: 'former au SST' } })
      } finally {
        routeMock().fullPath = '/'
      }
    })

    it('publishes nothing for a plain link', async () => {
      useAssistantLauncher().open()
      const wrapper = mountChat()

      await wrapper.find('.conversation .plain').trigger('click')

      expect(useAssistantHandoffChannel().channel.value.revision).toBe(0)
    })
  })

  describe('edge states', () => {
    it('keeps the conversation history when the panel is reopened', async () => {
      const launcher = useAssistantLauncher()
      launcher.open()
      const wrapper = mountChat()
      conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      launcher.close()
      await nextTick()
      launcher.open({ context: { source: 'header' } })
      await nextTick()

      // Accueil, message, réponse : ni ressaisie ni second accueil.
      const roles = conversation(wrapper)
        .props('entries')
        .map((e: { role: string }) => e.role)
      expect(roles).toEqual(['assistant', 'user', 'assistant'])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('switches the panel to degraded mode on a fallback reply and tracks it', async () => {
      fetchMock.mockResolvedValue({
        kind: 'recommend',
        text: 'Nous vous recommandons',
        mode: 'fallback',
        notice: 'Réponses générées par un assistant automatisé.',
        recommendations: [{ slug: 'sst' }]
      })
      useAssistantLauncher().open({ context: { source: 'home' } })
      const wrapper = mountChat()
      expect(conversation(wrapper).props('degraded')).toBe(false)

      conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
      await vi.waitFor(() => expect(events()).toContain('ai_fallback_mode'))

      expect(conversation(wrapper).props('degraded')).toBe(true)
      expect(conversation(wrapper).props('notice')).toBe(
        'Réponses générées par un assistant automatisé.'
      )
      expect(aiEvents()).toContainEqual({
        event: 'ai_recommendation_display',
        source: 'home',
        turn: 1,
        count: 1,
        mode: 'fallback'
      })
      expect(aiEvents()).toContainEqual({
        event: 'ai_fallback_mode',
        source: 'home',
        turn: 1,
        kind: 'recommend'
      })
    })

    it('tracks a dead end, then the advisor escalation with its origin', async () => {
      fetchMock.mockResolvedValue({ kind: 'out_of_catalog', text: 'Hors catalogue.', mode: 'ai' })
      useAssistantLauncher().open({ context: { source: 'catalogue' } })
      const wrapper = mountChat()

      conversation(wrapper).vm.$emit('send', 'piloter un drone', 'text')
      await vi.waitFor(() => expect(events()).toContain('ai_no_results'))
      expect(aiEvents()).toContainEqual({
        event: 'ai_no_results',
        source: 'catalogue',
        turn: 1,
        kind: 'out_of_catalog',
        mode: 'ai'
      })

      await wrapper.find('.conversation .advisor').trigger('click')
      expect(aiEvents().at(-1)).toEqual({
        event: 'ai_advisor_escalation',
        source: 'catalogue',
        from: 'out_of_catalog',
        mode: 'ai'
      })
      expect(useAssistantLauncher().isOpen.value).toBe(false)
    })

    it('tracks the engine unavailability and an escalation from it', async () => {
      fetchMock.mockRejectedValueOnce(new Error('503'))
      useAssistantLauncher().open()
      const wrapper = mountChat()

      conversation(wrapper).vm.$emit('send', 'former au SST', 'text')
      await vi.waitFor(() => expect(events()).toContain('ai_unavailable'))
      expect(aiEvents()).toContainEqual({ event: 'ai_unavailable', turn: 1 })
      expect(conversation(wrapper).props('unavailable')).toBe(true)

      await wrapper.find('.conversation .advisor-unavailable').trigger('click')
      expect(aiEvents().at(-1)).toEqual({
        event: 'ai_advisor_escalation',
        from: 'unavailable'
      })
    })

    it('tracks the comparison table opening', () => {
      useAssistantLauncher().open({ context: { source: 'home' } })
      const wrapper = mountChat()

      conversation(wrapper).vm.$emit('compare', 3)

      expect(aiEvents().at(-1)).toEqual({
        event: 'ai_recommendation_compare',
        source: 'home',
        count: 3
      })
    })
  })
})
