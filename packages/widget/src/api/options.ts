/**
 * Options du questionnaire, dans les 5 locales. Le backend réel (chatbot
 * `/chat`, OpenAPI « AI Mobility Coach ») ne sert pas d'endpoint options :
 * ce dictionnaire est la source — le mock le réimporte pour rester aligné.
 */
import type { Locale } from '../config'
import type { RecoOptions } from './types'

type OptionList = Record<keyof RecoOptions, { id: string; labels: Record<Locale, string> }[]>

export const OPTIONS: OptionList = {
  levels: [
    {
      id: 'bac',
      labels: {
        fr: 'Baccalauréat',
        en: 'High school diploma',
        es: 'Bachillerato',
        de: 'Abitur',
        ar: 'البكالوريا'
      }
    },
    {
      id: 'licence',
      labels: { fr: 'Licence', en: "Bachelor's", es: 'Grado', de: 'Bachelor', ar: 'الإجازة' }
    },
    {
      id: 'master',
      labels: { fr: 'Master', en: "Master's", es: 'Máster', de: 'Master', ar: 'الماجستير' }
    }
  ],
  fields: [
    {
      id: 'info',
      labels: {
        fr: 'Informatique',
        en: 'Computer Science',
        es: 'Informática',
        de: 'Informatik',
        ar: 'علوم الحاسوب'
      }
    },
    {
      id: 'business',
      labels: {
        fr: 'Commerce',
        en: 'Business',
        es: 'Negocios',
        de: 'Betriebswirtschaft',
        ar: 'إدارة الأعمال'
      }
    },
    {
      id: 'sante',
      labels: { fr: 'Santé', en: 'Health', es: 'Salud', de: 'Gesundheit', ar: 'الصحة' }
    },
    {
      id: 'art',
      labels: { fr: 'Art & Design', en: 'Art & Design', es: 'Arte', de: 'Kunst', ar: 'الفنون' }
    }
  ],
  destinations: [
    {
      id: 'france',
      labels: { fr: 'France', en: 'France', es: 'Francia', de: 'Frankreich', ar: 'فرنسا' }
    },
    {
      id: 'espagne',
      labels: { fr: 'Espagne', en: 'Spain', es: 'España', de: 'Spanien', ar: 'إسبانيا' }
    },
    {
      id: 'allemagne',
      labels: { fr: 'Allemagne', en: 'Germany', es: 'Alemania', de: 'Deutschland', ar: 'ألمانيا' }
    },
    {
      id: 'belgique',
      labels: { fr: 'Belgique', en: 'Belgium', es: 'Bélgica', de: 'Belgien', ar: 'بلجيكا' }
    }
  ],
  languages: [
    {
      id: 'fr',
      labels: { fr: 'Français', en: 'French', es: 'Francés', de: 'Französisch', ar: 'الفرنسية' }
    },
    {
      id: 'en',
      labels: { fr: 'Anglais', en: 'English', es: 'Inglés', de: 'Englisch', ar: 'الإنجليزية' }
    },
    {
      id: 'es',
      labels: { fr: 'Espagnol', en: 'Spanish', es: 'Español', de: 'Spanisch', ar: 'الإسبانية' }
    },
    {
      id: 'de',
      labels: { fr: 'Allemand', en: 'German', es: 'Alemán', de: 'Deutsch', ar: 'الألمانية' }
    },
    {
      id: 'ar',
      labels: { fr: 'Arabe', en: 'Arabic', es: 'Árabe', de: 'Arabisch', ar: 'العربية' }
    }
  ],
  languageLevels: [
    { id: 'a2', labels: { fr: 'A2', en: 'A2', es: 'A2', de: 'A2', ar: 'A2' } },
    { id: 'b1', labels: { fr: 'B1', en: 'B1', es: 'B1', de: 'B1', ar: 'B1' } },
    { id: 'b2', labels: { fr: 'B2', en: 'B2', es: 'B2', de: 'B2', ar: 'B2' } },
    { id: 'c1', labels: { fr: 'C1', en: 'C1', es: 'C1', de: 'C1', ar: 'C1' } }
  ],
  budgets: [
    {
      id: 'lt5k',
      labels: {
        fr: 'Moins de 5 000 €/an',
        en: 'Under €5,000/year',
        es: 'Menos de 5.000 €/año',
        de: 'Weniger als 5.000 €/Jahr',
        ar: 'أقل من 5000 €/سنة'
      }
    },
    {
      id: 'lt10k',
      labels: {
        fr: '5 000 – 10 000 €/an',
        en: '€5,000–10,000/year',
        es: '5.000–10.000 €/año',
        de: '5.000–10.000 €/Jahr',
        ar: '5000–10000 €/سنة'
      }
    },
    {
      id: 'gt10k',
      labels: {
        fr: 'Plus de 10 000 €/an',
        en: 'Over €10,000/year',
        es: 'Más de 10.000 €/año',
        de: 'Über 10.000 €/Jahr',
        ar: 'أكثر من 10000 €/سنة'
      }
    }
  ],
  intakes: [
    {
      id: 'sep',
      labels: {
        fr: 'Rentrée de septembre',
        en: 'September intake',
        es: 'Curso de septiembre',
        de: 'Septemberbeginn',
        ar: 'دخول سبتمبر'
      }
    },
    {
      id: 'jan',
      labels: {
        fr: 'Rentrée de janvier',
        en: 'January intake',
        es: 'Curso de enero',
        de: 'Januarbeginn',
        ar: 'دخول يناير'
      }
    }
  ]
}

/** Options du questionnaire dans la locale demandée (repli `fr`). */
export function optionsFor(locale: Locale): RecoOptions {
  const localize = (list: { id: string; labels: Record<Locale, string> }[]) =>
    list.map(({ id, labels }) => ({ id, label: labels[locale] ?? labels.fr }))
  return {
    levels: localize(OPTIONS.levels),
    fields: localize(OPTIONS.fields),
    destinations: localize(OPTIONS.destinations),
    languages: localize(OPTIONS.languages),
    languageLevels: localize(OPTIONS.languageLevels),
    budgets: localize(OPTIONS.budgets),
    intakes: localize(OPTIONS.intakes)
  }
}
