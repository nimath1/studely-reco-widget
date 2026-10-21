import { afterEach, describe, expect, it } from 'vitest'
import {
  ADVISOR_PATH,
  DEMANDE_PATH,
  HANDOFF_STATE_KEY,
  advisorLink,
  demandeLink,
  readHandoff,
  truncateNeed
} from '~/utils/assistant-handoff'

afterEach(() => {
  window.history.replaceState(null, '')
})

describe('assistant-handoff', () => {
  it('tronque le besoin à 500 caractères sans couper un emoji', () => {
    const truncated = truncateNeed('🚜'.repeat(600))

    expect(Array.from(truncated)).toHaveLength(500)
    expect(truncated.endsWith('🚜')).toBe(true)
    expect(truncateNeed('  former au SST  ')).toBe('former au SST')
  })

  it('renvoie un lien conseiller nu sans besoin, avec état sinon', () => {
    expect(advisorLink(null)).toBe(ADVISOR_PATH)
    expect(advisorLink({ need: '   ' })).toBe(ADVISOR_PATH)
    expect(advisorLink({ need: 'former au SST', headcount: 8, location: 'Créteil' })).toEqual({
      path: ADVISOR_PATH,
      state: { [HANDOFF_STATE_KEY]: { need: 'former au SST', headcount: 8, location: 'Créteil' } }
    })
  })

  it('garde les identifiants du catalogue en query et le besoin hors URL', () => {
    expect(demandeLink({ famille: 'secours', formation: 'sst', session: undefined })).toEqual({
      path: DEMANDE_PATH,
      query: { famille: 'secours', formation: 'sst' }
    })
    // Effectif et lieu vides ne sont pas transmis.
    expect(demandeLink({}, { need: 'x', headcount: 0, location: '' })).toEqual({
      path: DEMANDE_PATH,
      query: {},
      state: { [HANDOFF_STATE_KEY]: { need: 'x' } }
    })
  })

  it("lit le besoin transmis dans l'entrée d'historique courante", () => {
    expect(readHandoff()).toBeNull()

    window.history.replaceState(
      { [HANDOFF_STATE_KEY]: { need: 'former au SST', headcount: 8 } },
      ''
    )
    expect(readHandoff()).toEqual({ need: 'former au SST', headcount: 8 })
  })

  it('ignore un état malformé ou vide', () => {
    window.history.replaceState({ [HANDOFF_STATE_KEY]: { need: 42 } }, '')
    expect(readHandoff()).toBeNull()

    window.history.replaceState({ [HANDOFF_STATE_KEY]: { need: 'x', headcount: 'huit' } }, '')
    expect(readHandoff()).toBeNull()

    window.history.replaceState({ [HANDOFF_STATE_KEY]: { need: '   ' } }, '')
    expect(readHandoff()).toBeNull()

    window.history.replaceState({ other: true }, '')
    expect(readHandoff()).toBeNull()
  })
})
