import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAssistantAnalytics } from '~/composables/useAssistantAnalytics'

const routeMock = (globalThis as Record<string, unknown>).useRoute as () => {
  path: string
  fullPath: string
}

/** Attribut de page ajouté par le dataLayer du plan (route de test : `/`). */
const onPage = (event: Record<string, unknown>) => ({ page_path: '/', ...event })

beforeEach(() => {
  window.dataLayer = []
})

afterEach(() => {
  delete window.dataLayer
})

describe('useAssistantAnalytics', () => {
  it('émet les jalons du parcours nominal avec leurs paramètres', () => {
    const analytics = useAssistantAnalytics()

    analytics.searchStart('home')
    analytics.searchSubmit({ source: 'home', turn: 1, via: 'entry' })
    analytics.clarificationRequested({ source: 'home', turn: 1 })
    analytics.clarificationAnswer({ source: 'home', turn: 2, via: 'suggestion' })
    analytics.recommendationDisplay({ source: 'home', turn: 2, count: 3, mode: 'ai' })
    analytics.recommendationSelect({
      source: 'home',
      slug: 'sst',
      rank: 'primary',
      action: 'sessions'
    })

    expect(window.dataLayer).toEqual(
      [
        { event: 'ai_search_start', source: 'home' },
        { event: 'ai_search_submit', source: 'home', turn: 1, via: 'entry' },
        { event: 'ai_clarification_requested', source: 'home', turn: 1 },
        { event: 'ai_clarification_answer', source: 'home', turn: 2, via: 'suggestion' },
        { event: 'ai_recommendation_display', source: 'home', turn: 2, count: 3, mode: 'ai' },
        {
          event: 'ai_recommendation_select',
          source: 'home',
          slug: 'sst',
          rank: 'primary',
          action: 'sessions'
        }
      ].map(onPage)
    )
  })

  it("n'exige pas de source (lanceur flottant)", () => {
    useAssistantAnalytics().searchStart()

    expect(window.dataLayer).toEqual([onPage({ event: 'ai_search_start' })])
  })

  it('émet les jalons des états limites', () => {
    const analytics = useAssistantAnalytics()

    analytics.recommendationCompare({ source: 'home', count: 3 })
    analytics.noResults({ source: 'home', turn: 2, kind: 'no_results', mode: 'ai' })
    analytics.unavailable({ source: 'home', turn: 2 })
    analytics.fallbackMode({ source: 'home', turn: 3, kind: 'recommend' })
    analytics.advisorEscalation({ source: 'home', from: 'unavailable' })

    expect(window.dataLayer).toEqual(
      [
        { event: 'ai_recommendation_compare', source: 'home', count: 3 },
        { event: 'ai_no_results', source: 'home', turn: 2, kind: 'no_results', mode: 'ai' },
        { event: 'ai_unavailable', source: 'home', turn: 2 },
        { event: 'ai_fallback_mode', source: 'home', turn: 3, kind: 'recommend' },
        { event: 'ai_advisor_escalation', source: 'home', from: 'unavailable' }
      ].map(onPage)
    )
  })

  it('émet les jalons du module Chatbot du plan avec le chemin de page du dataLayer', () => {
    const analytics = useAssistantAnalytics()
    // Le chemin exigé par `chatbot_open` et `chatbot_message_sent` vient de
    // la même source que l'attribut de base des autres jalons.
    routeMock().fullPath = '/formations'

    analytics.chatbotOpen({ trigger_type: 'manuel', conversation_id: 'c1' })
    analytics.chatbotMessageSent({ conversation_id: 'c1', message_index: 1 })
    analytics.chatbotSuggestedActionClick({
      conversation_id: 'c1',
      action_type: 'suggestion',
      action_label: '8 salariés'
    })
    analytics.chatbotHandoffToAdvisor({
      conversation_id: 'c1',
      reason: 'compare_advisor',
      messages_count: 3
    })
    analytics.chatbotConversationEnd({
      conversation_id: 'c1',
      messages_count: 4,
      resolved: false,
      duration_seconds: 42
    })

    routeMock().fullPath = '/'

    expect(window.dataLayer).toEqual(
      [
        { event: 'chatbot_open', trigger_type: 'manuel', conversation_id: 'c1' },
        { event: 'chatbot_message_sent', conversation_id: 'c1', message_index: 1 },
        {
          event: 'chatbot_suggested_action_click',
          conversation_id: 'c1',
          action_type: 'suggestion',
          action_label: '8 salariés'
        },
        {
          event: 'chatbot_handoff_to_advisor',
          conversation_id: 'c1',
          reason: 'compare_advisor',
          messages_count: 3
        },
        {
          event: 'chatbot_conversation_end',
          conversation_id: 'c1',
          messages_count: 4,
          resolved: false,
          duration_seconds: 42
        }
      ].map((event) => ({ page_path: '/formations', ...event }))
    )
  })

  it('ne laisse pas une erreur du dataLayer remonter dans la conversation', () => {
    // Un script tiers peut remplacer le dataLayer par un objet qui rejette.
    window.dataLayer = {
      push() {
        throw new Error('dataLayer tiers')
      }
    } as unknown as typeof window.dataLayer

    expect(() => useAssistantAnalytics().searchStart('home')).not.toThrow()
  })
})
