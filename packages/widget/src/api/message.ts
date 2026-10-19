/**
 * Conversion du profil questionnaire en message naturel pour POST /chat.
 * Le bot détecte la langue du message (champ `lang` de l'événement final) :
 * le message suit donc la locale du widget — la réponse aussi.
 */
import type { Locale } from '../config'
import { optionsFor } from './options'
import type { RecoProfile } from './types'

const FIELD_LABELS: Record<Locale, Record<string, string>> = {
  fr: {
    level: 'Niveau',
    fields: 'Domaines',
    destinations: 'Destinations',
    languages: 'Langues',
    budget: 'Budget',
    intake: 'Rentrée',
    goal: 'Objectif'
  },
  en: {
    level: 'Level',
    fields: 'Fields',
    destinations: 'Destinations',
    languages: 'Languages',
    budget: 'Budget',
    intake: 'Intake',
    goal: 'Goal'
  },
  es: {
    level: 'Nivel',
    fields: 'Áreas',
    destinations: 'Destinos',
    languages: 'Idiomas',
    budget: 'Presupuesto',
    intake: 'Convocatoria',
    goal: 'Objetivo'
  },
  de: {
    level: 'Niveau',
    fields: 'Bereiche',
    destinations: 'Ziele',
    languages: 'Sprachen',
    budget: 'Budget',
    intake: 'Beginn',
    goal: 'Ziel'
  },
  ar: {
    level: 'المستوى',
    fields: 'المجالات',
    destinations: 'الوجهات',
    languages: 'اللغات',
    budget: 'الميزانية',
    intake: 'الدخول',
    goal: 'الهدف'
  }
}

const INTRO: Record<Locale, string> = {
  fr: 'Je cherche un parcours d’études en Europe. Mon profil :',
  en: 'I am looking for a study path in Europe. My profile:',
  es: 'Busco una carrera en Europa. Mi perfil:',
  de: 'Ich suche einen Studienweg in Europa. Mein Profil:',
  ar: 'أبحث عن مسار دراسي في أوروبا. ملفي:'
}

/** Libellé affiché d'un id d'option (la donnée produit, pas la forme API). */
function labelOf(list: { id: string; label: string }[], id: string): string {
  return list.find((option) => option.id === id)?.label ?? id
}

/**
 * Message compact et structuré : les libellés affichés (pas les ids) — le
 * bot raisonne sur du texte. `goal` est déjà nettoyé (scrubPersonalData).
 */
export function buildChatMessage(profile: RecoProfile, locale: Locale): string {
  const options = optionsFor(locale)
  const t = FIELD_LABELS[locale] ?? FIELD_LABELS.fr
  const languages = profile.languages
    .map(({ language, level }) => `${labelOf(options.languages, language)} ${level.toUpperCase()}`)
    .join(', ')
  const parts = [
    `${t.level}: ${labelOf(options.levels, profile.level)}`,
    `${t.fields}: ${profile.fields.map((id) => labelOf(options.fields, id)).join(', ')}`,
    `${t.destinations}: ${profile.destinations
      .map((id) => labelOf(options.destinations, id))
      .join(', ')}`,
    `${t.languages}: ${languages}`,
    `${t.budget}: ${labelOf(options.budgets, profile.budget)}`,
    `${t.intake}: ${labelOf(options.intakes, profile.intake)}`
  ]
  if (profile.goal) parts.push(`${t.goal}: ${profile.goal}`)
  return `${INTRO[locale] ?? INTRO.fr}\n${parts.join('\n')}`
}
