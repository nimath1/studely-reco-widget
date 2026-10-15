import type { RechercheSansResultat, SearchMissOutcome } from '@studely/types'
import { aggregateSearchMisses, searchMissesToCsv } from './search-misses.report'

function row(overrides: Partial<RechercheSansResultat> = {}): RechercheSansResultat {
  return {
    id: 1,
    date_created: '2026-09-20T10:00:00.000Z',
    query_text: 'Formation drone',
    query_normalized: 'formation drone',
    outcome: 'no_result',
    source: 'catalog',
    intent: null,
    context: null,
    reviewed: false,
    ...overrides
  }
}

describe('aggregateSearchMisses', () => {
  it('returns an empty list for no rows', () => {
    expect(aggregateSearchMisses([])).toEqual([])
  })

  it('counts unknown outcomes without breaking the known ones', () => {
    const [aggregate] = aggregateSearchMisses([
      row({ outcome: 'legacy_value' as SearchMissOutcome }),
      row({ id: 2 })
    ])

    expect(aggregate!.occurrences).toBe(2)
    expect(aggregate!.outcomes).toEqual({ no_result: 1, out_of_catalog: 0, legacy_value: 1 })
  })

  it('keeps a single copy of each intent', () => {
    const [aggregate] = aggregateSearchMisses([
      row({ id: 1, intent: 'drone' }),
      row({ id: 2, intent: 'drone' }),
      row({ id: 3, intent: 'drone-pro' })
    ])

    expect(aggregate!.intents).toEqual(['drone', 'drone-pro'])
  })
})

describe('searchMissesToCsv', () => {
  it('produces a header-only file with a BOM when there is nothing to export', () => {
    expect(searchMissesToCsv([])).toBe(
      '﻿requete_normalisee;exemple;occurrences;premiere_occurrence;derniere_occurrence;aucun_resultat;hors_catalogue;catalogue;moteur_ia;intentions\r\n'
    )
  })

  it('escapes separators, quotes and line breaks in cells', () => {
    const csv = searchMissesToCsv([
      {
        queryNormalized: 'multi ligne',
        sampleQuery: 'multi\nligne ; "citée"',
        occurrences: 1,
        firstSeen: null,
        lastSeen: null,
        outcomes: { no_result: 1, out_of_catalog: 0 },
        sources: { catalog: 1, assistant: 0 },
        intents: []
      }
    ])

    expect(csv.split('\r\n')[1]).toBe('multi ligne;"multi\nligne ; ""citée""";1;;;1;0;1;0;')
  })

  it('neutralizes cells a spreadsheet would run as formulas', () => {
    const csv = searchMissesToCsv([
      {
        queryNormalized: '=cmd',
        sampleQuery: '=1+1',
        occurrences: 2,
        firstSeen: null,
        lastSeen: null,
        outcomes: { no_result: 0, out_of_catalog: 2 },
        sources: { catalog: 0, assistant: 2 },
        intents: ['@import', '-danger', '+plus']
      }
    ])

    expect(csv.split('\r\n')[1]).toBe(`'=cmd;'=1+1;2;;;0;2;0;2;'@import, -danger, +plus`)
  })
})
