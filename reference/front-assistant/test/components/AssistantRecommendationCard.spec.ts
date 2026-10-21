import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { AssistantRecommendation } from '@learnup/types'
import AssistantRecommendationCard from '~/components/Assistant/RecommendationCard.vue'

const base: AssistantRecommendation = {
  slug: 'sst',
  familySlug: 'secours',
  title: 'SST — Sauveteur Secouriste du Travail',
  description: null,
  durationDays: 2,
  durationHours: null,
  modalities: ['presentiel', 'distanciel'],
  certification: 'SST',
  rank: 'primary',
  justification: 'Semble adaptée à votre besoin.',
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
  url: '/formations/secours/sst'
}

// Le besoin transmis à la demande voyage dans l'état d'historique, pas dans l'URL.
const handoffState = { assistantHandoff: { need: 'former au SST' } }

const mountOptions = {
  props: {
    recommendation: base,
    demandeTo: {
      path: '/centres/demande-de-formation',
      query: { famille: 'secours', formation: 'sst' },
      state: handoffState
    }
  }
}

function mountCard(overrides: Partial<AssistantRecommendation> = {}) {
  return mount(AssistantRecommendationCard, {
    ...mountOptions,
    props: { ...mountOptions.props, recommendation: { ...base, ...overrides } }
  })
}

describe('AssistantRecommendationCard', () => {
  it('labels the primary recommendation', () => {
    expect(mountCard().text()).toContain('Recommandation principale')
    expect(mountCard({ rank: 'alternative' }).text()).toContain('Alternative')
  })

  it('shows factual attributes from the catalog only', () => {
    const text = mountCard().text()
    expect(text).toContain('2 jours')
    expect(text).toContain('Présentiel / Distanciel')
    expect(text).toContain('Certifiante')
    expect(text).toContain('Semble adaptée à votre besoin.')
  })

  it('shows the availability block when a session exists', () => {
    const text = mountCard().text()
    expect(text).toContain('Centre LEARN UP de Créteil')
    expect(text).toContain('Prochaine session')
    expect(text).toContain('8 places disponibles')
    expect(text).toContain('Voir les sessions')
    expect(text).toContain('Demander cette formation')
  })

  it('renders the no-session variant without availability (E6)', () => {
    const wrapper = mount(AssistantRecommendationCard, {
      ...mountOptions,
      props: {
        ...mountOptions.props,
        recommendation: { ...base, availability: null },
        advisorTo: { path: '/parler-a-votre-conseiller', state: handoffState }
      }
    })
    const text = wrapper.text()
    expect(text).toContain("aucune session n'est actuellement programmée")
    expect(text).toContain('Demander une session')
    expect(text).toContain('Être accompagné')
    expect(text).toContain('La page formation reste consultable')
    expect(text).toContain('Voir la formation')
    expect(text).not.toContain('Voir les sessions')

    const advisor = wrapper.findAll('a').find((a) => a.text() === 'Être accompagné')!
    expect(advisor.attributes('href')).toBe('/parler-a-votre-conseiller')
    expect(advisor.attributes('data-state')).toBe(JSON.stringify(handoffState))
  })

  it('renders the compact alternative variant (E4)', () => {
    const wrapper = mount(AssistantRecommendationCard, {
      ...mountOptions,
      props: {
        ...mountOptions.props,
        recommendation: { ...base, rank: 'alternative' },
        compact: true
      }
    })
    const text = wrapper.text()
    expect(text).toContain('Alternative')
    expect(text).toContain('Voir la formation')
    expect(text).not.toContain('Demander cette formation')
    expect(text).not.toContain('Prochaine session')
  })

  it('links the title and CTAs, the need travelling outside the URL', () => {
    const wrapper = mountCard()
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).toContain('/formations/secours/sst')
    expect(hrefs).toContain('/formations/secours/sst#sessionsList')
    expect(hrefs).toContain('/centres/demande-de-formation?famille=secours&formation=sst')

    const demande = wrapper.findAll('a').find((a) => a.text() === 'Demander cette formation')!
    expect(demande.attributes('data-state')).toBe(JSON.stringify(handoffState))
  })

  it('emits the selected action for each CTA', async () => {
    const wrapper = mountCard()
    const link = (text: string) => wrapper.findAll('a').find((a) => a.text() === text)!

    await link('SST — Sauveteur Secouriste du Travail').trigger('click')
    await link('Voir les sessions').trigger('click')
    await link('Demander cette formation').trigger('click')
    await link('Voir la formation').trigger('click')

    expect(wrapper.emitted('select')).toEqual([
      ['formation'],
      ['sessions'],
      ['demande'],
      ['formation']
    ])
  })

  it('emits the request action from the no-session variant', async () => {
    const wrapper = mountCard({ availability: null })

    await wrapper
      .findAll('a')
      .find((a) => a.text() === 'Demander une session')!
      .trigger('click')

    expect(wrapper.emitted('select')).toEqual([['demande']])
  })
})
