/**
 * Masquage des données personnelles évidentes dans un texte saisi par un
 * visiteur, avant journalisation (RGPD — minimisation). Seuls les motifs
 * identifiants sont remplacés ; le contenu métier (« former 8 salariés au
 * CACES près de Lyon ») est conservé tel quel : c'est lui qui a de la valeur
 * pour la revue produit.
 *
 * Limite assumée : un nom ou une donnée personnelle sans motif reconnaissable
 * (« Jean Dupont », « mon manager est malade ») n'est pas détecté.
 */
// Labels du domaine ancrés par leur point : la lettre après un « . » ne
// peut être ni TLD ni début de label alternatif — pas de double chemin.
// Quantificateurs bornés (tailles réelles : local ≤64, label ≤63) : sans
// borne, `+` retourne en arrière linéairement quand « @ » n'apparaît pas.
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63})+/gu

// IBAN : code pays + 2 chiffres de contrôle + groupes de 4, espaces facultatifs.
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/gi

// Téléphone français : 0X ou +33 X, puis 4 paires de chiffres (séparateurs facultatifs).
const FR_PHONE_PATTERN = /(?:\+33\s?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}\b/g

// SIRET saisi groupé (3-3-3-5, espaces facultatifs).
const SIRET_PATTERN = /\b\d{3}\s?\d{3}\s?\d{3}\s?\d{5}\b/g

// Toute suite d'au moins 10 chiffres collés : téléphone brut, SIRET,
// numéro de sécurité sociale — aucun nombre métier n'atteint cette taille.
const LONG_DIGITS_PATTERN = /\b\d{10,}\b/g

// Adresse postale : numéro (bis/ter facultatif), type de voie puis libellé
// jusqu'à la ponctuation suivante — « 12 rue des Lilas », « 4 av. Foch ». Le
// code postal et la ville, utiles à la revue (où cherche-t-on ?), sont
// conservés. La fin du type de voie est testée par un lookahead Unicode :
// `\b` (ASCII) ne voit aucune frontière entre « av. » et l'espace qui suit.
// « cours » et « place » sont volontairement absents : dans un catalogue de
// formations ils désignent d'abord des cours et des places (« 2 cours de
// management », « 1 place en SST ») — les masquer détruirait le besoin.
// L'alternance des types de voie est une liste de données jointe au motif
// (lisible, bornée — SonarLint S5852) ; les séparateurs sont regroupés
// dans une classe unique `[\s,]*` : chaque position n'a qu'un seul chemin.
const FR_ADDRESS_TYPES = [
  'rue',
  'avenue',
  'av[.]?',
  'boulevard',
  'bd[.]?',
  'blvd[.]?',
  'chemin',
  'impasse',
  'all[ée]e',
  'route',
  'quai',
  'square',
  'voie',
  'chauss[ée]e',
  'faubourg',
  'r[ée]sidence',
  'lotissement'
]
const FR_ADDRESS_PATTERN = new RegExp(
  String.raw`\b\d{1,4}[\s,]*(?:(?:bis|ter|quater)[\s,]*)?(?:${FR_ADDRESS_TYPES.join(
    '|'
  )})(?![\p{L}\p{N}_])[^,;.\n]*`,
  'giu'
)

export const PII_PLACEHOLDERS = {
  email: '[email]',
  iban: '[iban]',
  phone: '[téléphone]',
  siret: '[siret]',
  number: '[numéro]',
  address: '[adresse]'
} as const

export function scrubPersonalData(text: string): string {
  return text
    .replace(EMAIL_PATTERN, PII_PLACEHOLDERS.email)
    .replace(IBAN_PATTERN, PII_PLACEHOLDERS.iban)
    .replace(FR_ADDRESS_PATTERN, PII_PLACEHOLDERS.address)
    .replace(FR_PHONE_PATTERN, PII_PLACEHOLDERS.phone)
    .replace(SIRET_PATTERN, PII_PLACEHOLDERS.siret)
    .replace(LONG_DIGITS_PATTERN, PII_PLACEHOLDERS.number)
}
