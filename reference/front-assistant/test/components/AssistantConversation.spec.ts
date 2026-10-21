import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { AssistantEntry } from '~/composables/useAssistant'
import AssistantConversation from '~/components/Assistant/Conversation.vue'

const mountOptions = {
  props: {
    entries: [] as AssistantEntry[],
    pending: false,
    unavailable: false,
    contextChips: [] as string[],
    needSummary: '',
    headcount: undefined as number | undefined,
    location: undefined as string | undefined,
    degraded: false,
    notice: undefined as string | undefined
  },
  global: {
    stubs: {
      AssistantRecommendationCard: {
        props: ['recommendation', 'demandeTo', 'advisorTo'],
        emits: ['select'],
        template:
          '<article class="rec-card" :data-rank="recommendation.rank" :data-advisor="JSON.stringify(advisorTo)" :data-demande="JSON.stringify(demandeTo)" @click="$emit(\'select\', \'sessions\')">{{ recommendation.title }}</article>'
      },
      AssistantCompareTable: {
        props: ['recommendations', 'advisorTo'],
        emits: ['select'],
        template:
          '<table class="compare-table" :data-advisor="JSON.stringify(advisorTo)" @click="$emit(\'select\', recommendations[1], \'formation\')" />'
      }
    }
  }
}

function mountConversation(props: Partial<typeof mountOptions.props> = {}) {
  return mount(AssistantConversation, {
    ...mountOptions,
    props: { ...mountOptions.props, ...props }
  })
}

describe('AssistantConversation', () => {
  it('renders user messages as right-aligned bubbles', () => {
    const wrapper = mountConversation({
      entries: [{ role: 'user', content: 'former mes équipes' }]
    })
    expect(wrapper.text()).toContain('former mes équipes')
  })

  it('renders a clarify reply with question and clickable suggestions', async () => {
    const wrapper = mountConversation({
      entries: [
        { role: 'user', content: 'sécurité' },
        {
          role: 'assistant',
          content: 'Votre besoin nécessite une précision.',
          reply: {
            kind: 'clarify',
            text: 'Votre besoin nécessite une précision.',
            question: 'Quel type de risque ?',
            suggestions: ['Premiers secours', 'Risque incendie']
          }
        }
      ]
    })

    expect(wrapper.text()).toContain('Quel type de risque ?')
    const pills = wrapper.findAll('button').filter((b) => b.text() === 'Premiers secours')
    await pills[0]!.trigger('click')
    expect(wrapper.emitted('send')?.[0]).toEqual(['Premiers secours', 'suggestion'])
  })

  it('renders recommendations and toggles the compare table', async () => {
    const rec = {
      slug: 'sst',
      familySlug: 'secours',
      title: 'SST',
      description: null,
      durationDays: 2,
      durationHours: null,
      modalities: ['presentiel'],
      certification: 'SST',
      justification: 'Semble adaptée.',
      availability: null,
      url: '/formations/secours/sst'
    }
    const wrapper = mountConversation({
      entries: [
        {
          role: 'assistant',
          content: 'Nous vous recommandons',
          reply: {
            kind: 'recommend',
            text: 'Nous vous recommandons',
            recommendations: [
              { ...rec, rank: 'primary' as const },
              { ...rec, slug: 'mac-sst', title: 'MAC SST', rank: 'alternative' as const }
            ]
          }
        }
      ]
    })

    expect(wrapper.findAll('.rec-card')).toHaveLength(2)
    expect(wrapper.find('.compare-table').exists()).toBe(false)

    const compareBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Comparer ces 2 formations'))
    await compareBtn!.trigger('click')
    expect(wrapper.find('.compare-table').exists()).toBe(true)
    expect(wrapper.emitted('compare')).toEqual([[2]])

    // Refermer n'est pas une nouvelle comparaison.
    await compareBtn!.trigger('click')
    expect(wrapper.find('.compare-table').exists()).toBe(false)
    expect(wrapper.emitted('compare')).toHaveLength(1)
  })

  it('switches to the simplified-search banner in degraded mode', () => {
    const rec = {
      slug: 'sst',
      familySlug: 'secours',
      title: 'SST',
      description: null,
      durationDays: 2,
      durationHours: null,
      modalities: ['presentiel'],
      certification: null,
      justification: 'Semble adaptée.',
      availability: null,
      url: '/formations/secours/sst',
      rank: 'primary' as const
    }
    const wrapper = mountConversation({
      degraded: true,
      needSummary: 'sst',
      entries: [
        {
          role: 'assistant',
          content: 'Nous vous recommandons',
          reply: {
            kind: 'recommend',
            text: 'Nous vous recommandons',
            mode: 'fallback',
            source: 'Source : catalogue publié LEARN UP (recherche directe).',
            recommendations: [rec]
          }
        }
      ]
    })

    const status = wrapper.find('[role="status"]')
    expect(status.text()).toContain('Recherche simplifiée')
    expect(status.text()).toContain("l'assistant IA est momentanément indisponible")
    // Sortie conseiller du bandeau : besoin hors URL, état d'origine « degraded ».
    expect(status.find('a').attributes('href')).toBe('/parler-a-votre-conseiller')
    expect(status.find('a').attributes('data-state')).toBe(
      JSON.stringify({ assistantHandoff: { need: 'sst' } })
    )
    expect(status.find('a').attributes('data-advisor-escalation')).toBe('degraded')
    // Bandeau + libellé sur la réponse concernée.
    expect(wrapper.text().split('Recherche simplifiée')).toHaveLength(3)
    // La mention de source vient de l'API, jamais réécrite.
    expect(wrapper.text()).toContain('Source : catalogue publié LEARN UP (recherche directe).')
  })

  it('shows no degraded cue for an AI reply', () => {
    const wrapper = mountConversation({
      entries: [
        {
          role: 'assistant',
          content: 'Précisez.',
          reply: { kind: 'clarify', text: 'Précisez.', mode: 'ai' }
        }
      ]
    })
    // La région de statut existe toujours (WCAG 4.1.3), vide et masquée.
    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.classes()).toContain('sr-only')
    expect(status.text()).toBe('')
    expect(wrapper.text()).not.toContain('Recherche simplifiée')
  })

  it('ends the API source mention with a period before the session note', () => {
    const rec = {
      slug: 'sst',
      familySlug: 'secours',
      title: 'SST',
      description: null,
      durationDays: 2,
      durationHours: null,
      modalities: ['presentiel'],
      certification: null,
      justification: 'Semble adaptée.',
      availability: {
        sessionId: 's1',
        startDate: '2999-09-18',
        modality: 'presentiel',
        seatsRemaining: 8,
        centreName: 'Centre LEARN UP de Créteil',
        centreSlug: 'creteil',
        city: 'Créteil',
        department: 'Val-de-Marne'
      },
      url: '/formations/secours/sst',
      rank: 'primary' as const
    }
    const wrapper = mountConversation({
      entries: [
        {
          role: 'assistant',
          content: 'Nous vous recommandons',
          reply: {
            kind: 'recommend',
            text: 'Nous vous recommandons',
            source: 'Recommandations issues du catalogue publié LEARN UP',
            recommendations: [rec]
          }
        }
      ]
    })

    expect(wrapper.text()).toContain(
      'Recommandations issues du catalogue publié LEARN UP. Session et disponibilité issues du référentiel'
    )
  })

  it('shows the automated-assistant notice under the composer', () => {
    const notice = 'Réponses générées par un assistant automatisé à partir du catalogue.'
    expect(mountConversation({ notice }).text()).toContain(notice)
    expect(mountConversation().text()).not.toContain('assistant automatisé')
  })

  it('relays recommendation CTA clicks with the course and its rank', async () => {
    const rec = {
      slug: 'sst',
      familySlug: 'secours',
      title: 'SST',
      description: null,
      durationDays: 2,
      durationHours: null,
      modalities: ['presentiel'],
      certification: null,
      justification: 'Semble adaptée.',
      availability: null,
      url: '/formations/secours/sst'
    }
    const wrapper = mountConversation({
      entries: [
        {
          role: 'assistant',
          content: 'Nous vous recommandons',
          reply: {
            kind: 'recommend',
            text: 'Nous vous recommandons',
            recommendations: [
              { ...rec, rank: 'primary' as const },
              { ...rec, slug: 'mac-sst', title: 'MAC SST', rank: 'alternative' as const }
            ]
          }
        }
      ]
    })

    await wrapper.findAll('.rec-card')[1]!.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([
      { slug: 'mac-sst', rank: 'alternative', action: 'sessions' }
    ])

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Comparer ces 2 formations'))!
      .trigger('click')
    await wrapper.find('.compare-table').trigger('click')
    expect(wrapper.emitted('select')?.[1]).toEqual([
      { slug: 'mac-sst', rank: 'alternative', action: 'formation' }
    ])
  })

  it('carries the need in natural language to every advisor exit', () => {
    const rec = {
      slug: 'sst',
      familySlug: 'secours',
      title: 'SST',
      description: null,
      durationDays: 2,
      durationHours: null,
      modalities: ['presentiel'],
      certification: null,
      justification: 'Semble adaptée.',
      availability: null,
      url: '/formations/secours/sst',
      rank: 'primary' as const
    }
    const wrapper = mountConversation({
      needSummary: 'former 8 salariés au SST à Créteil',
      headcount: 8,
      location: 'Créteil',
      unavailable: true,
      entries: [
        {
          role: 'assistant',
          content: 'Nous vous recommandons',
          reply: { kind: 'recommend', text: 'Nous vous recommandons', recommendations: [rec] }
        },
        {
          role: 'assistant',
          content: 'Aucune formation identifiée.',
          reply: { kind: 'no_results', text: 'Aucune formation identifiée.' }
        },
        {
          role: 'assistant',
          content: 'Hors catalogue.',
          reply: { kind: 'out_of_catalog', text: 'Hors catalogue.' }
        }
      ]
    })

    // Le besoin voyage dans l'état d'historique de la navigation — jamais
    // dans l'URL (RGPD : `page_location`, Referer, journaux).
    const state = {
      assistantHandoff: {
        need: 'former 8 salariés au SST à Créteil',
        headcount: 8,
        location: 'Créteil'
      }
    }
    const advisorLinks = wrapper
      .findAll('a')
      .filter((a) => a.attributes('href') === '/parler-a-votre-conseiller')
    // Pied des recommandations, aucun résultat, hors catalogue, indisponible.
    expect(advisorLinks).toHaveLength(4)
    expect(advisorLinks.map((a) => a.text())).toEqual([
      'Être accompagné par votre conseiller',
      'Parler à votre conseiller',
      'Décrire mon besoin à votre conseiller',
      'Parler à votre conseiller'
    ])
    for (const link of advisorLinks) {
      expect(link.attributes('data-state')).toBe(JSON.stringify(state))
      expect(link.attributes('data-assistant-handoff')).toBeDefined()
    }
    expect(
      wrapper
        .findAll('a')
        .map((a) => a.attributes('href'))
        .join(' ')
    ).not.toContain('q=')

    // Carte sans session et demande personnalisée : même transmission.
    expect(wrapper.find('.rec-card').attributes('data-advisor')).toBe(
      JSON.stringify({ path: '/parler-a-votre-conseiller', state })
    )
    expect(wrapper.find('.rec-card').attributes('data-demande')).toBe(
      JSON.stringify({
        path: '/centres/demande-de-formation',
        query: { famille: 'secours', formation: 'sst' },
        state
      })
    )
    const demande = wrapper
      .findAll('a')
      .find((a) => a.text() === 'Faire une demande personnalisée')!
    expect(demande.attributes('href')).toBe('/centres/demande-de-formation')
    expect(demande.attributes('data-state')).toBe(JSON.stringify(state))
  })

  it('links the advisor page without any state while nothing was described', () => {
    const wrapper = mountConversation({ unavailable: true })
    const advisor = wrapper
      .findAll('a')
      .find((a) => a.attributes('href') === '/parler-a-votre-conseiller')
    expect(advisor).toBeDefined()
    expect(advisor!.attributes('data-state')).toBeUndefined()
  })

  it('disables the quick replies while a reply is pending', () => {
    const wrapper = mountConversation({
      pending: true,
      entries: [
        {
          role: 'assistant',
          content: 'Précisez.',
          reply: { kind: 'clarify', text: 'Précisez.', suggestions: ['Premiers secours'] }
        }
      ]
    })
    const pill = wrapper.findAll('button').find((b) => b.text() === 'Premiers secours')
    expect(pill!.attributes('disabled')).toBeDefined()
  })

  it('renders the no_results action grid', () => {
    const wrapper = mountConversation({
      entries: [
        {
          role: 'assistant',
          content: 'Aucune formation identifiée.',
          reply: { kind: 'no_results', text: 'Aucune formation identifiée.' }
        }
      ]
    })
    const text = wrapper.text()
    expect(text).toContain('Reformuler mon besoin')
    expect(text).toContain('Consulter le catalogue')
    expect(text).toContain('Parler à votre conseiller')
    expect(text).toContain('Faire une demande personnalisée')
  })

  it('renders out_of_catalog without approximate recommendations', () => {
    const wrapper = mountConversation({
      entries: [
        {
          role: 'assistant',
          content: 'Ce besoin ne correspond pas au catalogue.',
          reply: { kind: 'out_of_catalog', text: 'Ce besoin ne correspond pas au catalogue.' }
        }
      ]
    })
    expect(wrapper.text()).toContain('Décrire mon besoin à votre conseiller')
    expect(wrapper.findAll('.rec-card')).toHaveLength(0)
  })

  it('shows the pending skeleton while analyzing and emits stop', async () => {
    const wrapper = mountConversation({ pending: true })
    expect(wrapper.text()).toContain('Analyse de votre besoin')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Arrêter la réponse')!
      .trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })

  it('edits a user message and emits edit with its id', async () => {
    const wrapper = mountConversation({
      entries: [{ id: 'msg-1', role: 'user', content: 'ancien besoin' }]
    })

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Modifier')!
      .trigger('click')

    const editInput = wrapper.find('input[aria-label="Modifier votre message"]')
    await editInput.setValue('nouveau besoin')
    await wrapper.findAll('form')[0]!.trigger('submit.prevent')

    expect(wrapper.emitted('edit')?.[0]).toEqual(['msg-1', 'nouveau besoin'])
  })

  it('shows the unavailable state and emits retry', async () => {
    const wrapper = mountConversation({ unavailable: true })
    expect(wrapper.text()).toContain('momentanément indisponible')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Réessayer'))!
      .trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('renders context chips and emits reset', async () => {
    const wrapper = mountConversation({
      entries: [{ role: 'user', content: 'x' }],
      contextChips: ['SST', 'Créteil']
    })
    expect(wrapper.text()).toContain('SST')
    expect(wrapper.text()).toContain('Créteil')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Nouvelle recherche')!
      .trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })

  it('emits send with the composer value and clears the field', async () => {
    const wrapper = mountConversation()
    const input = wrapper.find('textarea')
    await input.setValue('former 8 salariés au SST')
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.emitted('send')?.[0]).toEqual(['former 8 salariés au SST', 'text'])
    expect((input.element as HTMLTextAreaElement).value).toBe('')
  })

  it('uses a single scroller viewport for the transcript', () => {
    const wrapper = mountConversation({
      entries: [{ role: 'user', content: 'former mes équipes' }]
    })

    expect(wrapper.findAll('[data-slot="message-scroller-viewport"]')).toHaveLength(1)
    expect(wrapper.find('[data-slot="message-scroller-content"]').attributes('role')).toBe('log')
    expect(
      wrapper.find('[data-slot="message-scroller-item"]').attributes('data-scroll-anchor')
    ).toBe('true')
  })

  it('keeps the transcript as its only live region, never busy (WCAG 4.1.3)', () => {
    const wrapper = mountConversation({ pending: true })
    const log = wrapper.find('[data-slot="message-scroller-content"]')

    // `role="log"` implique une région polie sur les ajouts : pas d'`aria-live`
    // redondant, pas d'`aria-busy` (qui suspendrait les annonces), et aucune
    // région imbriquée — le squelette d'analyse est annoncé comme un ajout.
    expect(log.attributes('role')).toBe('log')
    expect(log.attributes('aria-live')).toBeUndefined()
    expect(log.attributes('aria-busy')).toBeUndefined()
    expect(log.findAll('[aria-live], output, [role="status"], [role="log"]')).toHaveLength(0)
    expect(log.text()).toContain('Analyse de votre besoin')
  })

  it('keeps the header actions reachable on touch screens', () => {
    const wrapper = mountConversation()
    const close = wrapper.find('button[aria-label="Fermer la recherche assistée"]')
    expect(close.classes()).toEqual(expect.arrayContaining(['h-touch', 'w-touch']))
  })
})
