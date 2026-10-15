import type { RechercheSansResultat, SearchMissAggregate } from '@studely/types'

// UTF-8 avec BOM + « ; » : ouverture directe dans Excel (locale FR) sans
// assistant d'import ni caractères accentués cassés.
const CSV_BOM = '﻿'
const CSV_SEPARATOR = ';'
const CSV_EOL = '\r\n'
const CSV_HEADER = [
  'requete_normalisee',
  'exemple',
  'occurrences',
  'premiere_occurrence',
  'derniere_occurrence',
  'aucun_resultat',
  'hors_catalogue',
  'catalogue',
  'moteur_ia',
  'intentions'
]

function earliest(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return a < b ? a : b
}

function latest(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return a > b ? a : b
}

function emptyAggregate(row: RechercheSansResultat): SearchMissAggregate {
  return {
    queryNormalized: row.query_normalized,
    // Les lignes arrivent de la plus récente à la plus ancienne : le
    // premier texte rencontré est le plus récent.
    sampleQuery: row.query_text,
    occurrences: 0,
    firstSeen: null,
    lastSeen: null,
    outcomes: { no_result: 0, out_of_catalog: 0 },
    sources: { catalog: 0, assistant: 0 },
    intents: []
  }
}

function accumulate(group: SearchMissAggregate, row: RechercheSansResultat): void {
  group.occurrences += 1
  group.outcomes[row.outcome] = (group.outcomes[row.outcome] ?? 0) + 1
  group.sources[row.source] = (group.sources[row.source] ?? 0) + 1
  if (row.intent && !group.intents.includes(row.intent)) group.intents.push(row.intent)
  group.firstSeen = earliest(group.firstSeen, row.date_created)
  group.lastSeen = latest(group.lastSeen, row.date_created)
}

// Un tableur interprète une cellule commençant par = + - @ (ou une
// tabulation) comme une formule, même entre guillemets : les textes saisis
// par les visiteurs sont neutralisés par une apostrophe de tête.
const FORMULA_PREFIX = /^[=+\-@\t\r]/

function csvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value)
  const text = typeof value === 'string' && FORMULA_PREFIX.test(raw) ? `'${raw}` : raw
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toCsvLine(aggregate: SearchMissAggregate): string {
  return [
    aggregate.queryNormalized,
    aggregate.sampleQuery,
    aggregate.occurrences,
    aggregate.firstSeen,
    aggregate.lastSeen,
    aggregate.outcomes.no_result,
    aggregate.outcomes.out_of_catalog,
    aggregate.sources.catalog,
    aggregate.sources.assistant,
    aggregate.intents.join(', ')
  ]
    .map(csvCell)
    .join(CSV_SEPARATOR)
}

/**
 * Regroupe les entrées par requête normalisée — les plus fréquentes d'abord,
 * puis les plus récentes. Les lignes sont attendues de la plus récente à la
 * plus ancienne (ordre de lecture Directus).
 */
export function aggregateSearchMisses(rows: RechercheSansResultat[]): SearchMissAggregate[] {
  const groups = new Map<string, SearchMissAggregate>()

  for (const row of rows) {
    const group = groups.get(row.query_normalized) ?? emptyAggregate(row)
    accumulate(group, row)
    groups.set(row.query_normalized, group)
  }

  return [...groups.values()].sort(
    (a, b) => b.occurrences - a.occurrences || (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '')
  )
}

/** Export revue produit : une ligne par requête normalisée. */
export function searchMissesToCsv(aggregates: SearchMissAggregate[]): string {
  const lines = [CSV_HEADER.join(CSV_SEPARATOR), ...aggregates.map(toCsvLine)]
  return `${CSV_BOM}${lines.join(CSV_EOL)}${CSV_EOL}`
}
