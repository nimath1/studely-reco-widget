// Normalisation de texte partagée (catalogue, retrieval) : minuscules, sans
// accents, découpage en tokens, mots vides du français.

export const FRENCH_STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'au',
  'aux',
  'avec',
  'avoir',
  'avons',
  'avez',
  'aussi',
  'bien',
  'car',
  'ce',
  'cet',
  'cette',
  'ces',
  'dans',
  'de',
  'des',
  'du',
  'elle',
  'en',
  'est',
  'et',
  'etaient',
  'etait',
  'ete',
  'etes',
  'etre',
  'eux',
  'il',
  'ils',
  'je',
  'la',
  'le',
  'les',
  'leur',
  'leurs',
  'lui',
  'ma',
  'mais',
  'me',
  'mes',
  'mon',
  'ne',
  'nos',
  'notre',
  'nous',
  'on',
  'ont',
  'ou',
  'par',
  'pas',
  'plus',
  'pour',
  'qu',
  'que',
  'qui',
  'quoi',
  'sa',
  'sans',
  'se',
  'sera',
  'ses',
  'si',
  'sommes',
  'son',
  'sont',
  'sous',
  'suis',
  'sur',
  'tres',
  'ta',
  'te',
  'tes',
  'ton',
  'tu',
  'un',
  'une',
  'vos',
  'votre',
  'vous',
  'y'
])

const DIACRITICS = /[̀-ͯ]/g
// `[^<>]` et pas `[^>]` : sinon chaque « < » peut appartenir au tag en
// cours ou en démarrer un nouveau — partition ambiguë (S5852).
const HTML_TAG = /<[^<>]+>/g
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&rsquo;': '’',
  '&eacute;': 'é',
  '&egrave;': 'è',
  '&agrave;': 'à'
}

/** Minuscules sans accents — comparable à `searchText` du catalogue. */
export function normalizeText(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().normalize('NFD').replace(DIACRITICS, '')
}

/** Texte brut d'un champ HTML : balises retirées, entités courantes décodées. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(HTML_TAG, ' ')
    .replace(/&[a-z#0-9]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tokens normalisés (lettres/chiffres), sans mots vides ni tokens trop
 * courts. `minLength` par défaut à 2 pour garder les sigles (« ai », « pl »).
 */
export function tokenize(text: string | null | undefined, minLength = 2): string[] {
  const matches = normalizeText(text).match(/[a-z0-9]+/g) ?? []
  return matches.filter((token) => token.length >= minLength && !FRENCH_STOP_WORDS.has(token))
}

// Pluriels en « -aux » dont le singulier est en « -ail » (« travaux » →
// « travail ») ; les autres suivent la règle « -al » (« journaux » → « journal »).
const AIL_PLURALS = new Set([
  'bail',
  'corail',
  'email',
  'soupirail',
  'travail',
  'vantail',
  'vitrail'
])

/**
 * Racinisation légère du français : pluriels (« formations » → « formation »,
 * « travaux » → « travail », « journaux » → « journal ») et féminins en
 * « -ée ». Volontairement conservatrice — les variantes morphologiques
 * restantes sont couvertes par les n-grammes du provider d'embeddings local.
 */
export function stemToken(token: string): string {
  let stem = token
  if (stem.length > 4 && stem.endsWith('aux')) {
    const singular = `${stem.slice(0, -3)}ail`
    return AIL_PLURALS.has(singular) ? singular : `${stem.slice(0, -3)}al`
  }
  if (stem.length > 4 && (stem.endsWith('s') || stem.endsWith('x')) && !stem.endsWith('ss')) {
    stem = stem.slice(0, -1)
  }
  if (stem.length > 5 && stem.endsWith('ee')) stem = stem.slice(0, -1)
  return stem
}
