/**
 * Données du mock : options et recommandations dans les 5 locales (§8.1).
 * Forme alignée sur l'OpenAPI (§6) — à ajuster quand le contrat signé arrive.
 */
import type { RecoOptions, RecoRecommendation, RecommendationsResponse } from '../src/api/types'
import type { Locale } from '../src/config'

type OptionList = Record<keyof RecoOptions, { id: string; labels: Record<Locale, string> }[]>

const OPTIONS: OptionList = {
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
    {
      id: 'a2',
      labels: { fr: 'A2', en: 'A2', es: 'A2', de: 'A2', ar: 'A2' }
    },
    {
      id: 'b1',
      labels: { fr: 'B1', en: 'B1', es: 'B1', de: 'B1', ar: 'B1' }
    },
    {
      id: 'b2',
      labels: { fr: 'B2', en: 'B2', es: 'B2', de: 'B2', ar: 'B2' }
    },
    {
      id: 'c1',
      labels: { fr: 'C1', en: 'C1', es: 'C1', de: 'C1', ar: 'C1' }
    }
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

const RECOS: Record<Locale, RecoRecommendation[]> = {
  fr: [
    {
      type: 'programme',
      title: 'Licence Informatique — Université de Lyon',
      destination: 'Lyon, France',
      reason: 'Ton niveau et ton budget collent aux formations publiques françaises.',
      tags: ['informatique', 'public', 'francophone', 'septembre'],
      url: 'https://www.studely.com/programmes/licence-info-lyon'
    },
    {
      type: 'programme',
      title: 'Bachelor Business — KU Leuven',
      destination: 'Louvain, Belgique',
      reason: 'Programme anglophone compatible avec ton niveau d’anglais B2.',
      tags: ['business', 'anglais', 'bachelier'],
      url: 'https://www.studely.com/programmes/bachelor-business-leuven'
    },
    {
      type: 'parcours',
      title: 'Année de langue puis Bachelor — Hambourg',
      destination: 'Hambourg, Allemagne',
      reason: 'Tes destinations incluent l’Allemagne ; l’année de langue sécurise l’admission.',
      tags: ['allemagne', 'langue'],
      url: 'https://www.studely.com/programmes/annee-langue-hambourg'
    }
  ],
  en: [
    {
      type: 'program',
      title: 'BSc Computer Science — University of Lyon',
      destination: 'Lyon, France',
      reason: 'Your level and budget fit French public programs.',
      tags: ['computer science', 'public', 'september'],
      url: 'https://www.studely.com/en/programs/bsc-cs-lyon'
    },
    {
      type: 'program',
      title: 'Bachelor of Business — KU Leuven',
      destination: 'Leuven, Belgium',
      reason: 'English-taught program matching your B2 English level.',
      tags: ['business', 'english'],
      url: 'https://www.studely.com/en/programs/bsc-business-leuven'
    },
    {
      type: 'path',
      title: 'Language year then Bachelor — Hamburg',
      destination: 'Hamburg, Germany',
      reason: 'Germany is in your destinations; the language year secures admission.',
      tags: ['germany', 'language'],
      url: 'https://www.studely.com/en/programs/language-year-hamburg'
    }
  ],
  es: [
    {
      type: 'programa',
      title: 'Grado en Informática — Universidad de Lyon',
      destination: 'Lyon, Francia',
      reason: 'Tu nivel y tu presupuesto encajan con la universidad pública francesa.',
      tags: ['informática', 'pública', 'septiembre'],
      url: 'https://www.studely.com/es/programas/grado-informatica-lyon'
    },
    {
      type: 'programa',
      title: 'Grado en Empresa — KU Leuven',
      destination: 'Lovaina, Bélgica',
      reason: 'Programa en inglés compatible con tu nivel B2.',
      tags: ['empresa', 'inglés'],
      url: 'https://www.studely.com/es/programas/grado-empresa-leuven'
    },
    {
      type: 'recorrido',
      title: 'Año de idioma y luego Grado — Hamburgo',
      destination: 'Hamburgo, Alemania',
      reason: 'Alemania está entre tus destinos; el año de idioma asegura la admisión.',
      tags: ['alemania', 'idioma'],
      url: 'https://www.studely.com/es/programas/ano-idioma-hamburgo'
    }
  ],
  de: [
    {
      type: 'programm',
      title: 'Bachelor Informatik — Universität Lyon',
      destination: 'Lyon, Frankreich',
      reason: 'Dein Niveau und Budget passen zu französischen Hochschulen.',
      tags: ['informatik', 'staatlich', 'september'],
      url: 'https://www.studely.com/de/programme/bachelor-informatik-lyon'
    },
    {
      type: 'programm',
      title: 'Bachelor Betriebswirtschaft — KU Leuven',
      destination: 'Löwen, Belgien',
      reason: 'Englischsprachiges Programm passend zu deinem B2-Niveau.',
      tags: ['bwl', 'englisch'],
      url: 'https://www.studely.com/de/programme/bachelor-bwl-leuven'
    },
    {
      type: 'pfad',
      title: 'Sprachjahr, dann Bachelor — Hamburg',
      destination: 'Hamburg, Deutschland',
      reason: 'Deutschland ist unter deinen Zielen; das Sprachjahr sichert die Zulassung.',
      tags: ['deutschland', 'sprache'],
      url: 'https://www.studely.com/de/programme/sprachjahr-hamburg'
    }
  ],
  ar: [
    {
      type: 'برنامج',
      title: 'إجازة علوم الحاسوب — جامعة ليون',
      destination: 'ليون، فرنسا',
      reason: 'مستواك وميزانيتك يناسبان الجامعات العامة الفرنسية.',
      tags: ['حاسوب', 'عمومية', 'سبتمبر'],
      url: 'https://www.studely.com/ar/programs/cs-lyon'
    },
    {
      type: 'برنامج',
      title: 'بكالوريوس إدارة الأعمال — KU Leuven',
      destination: 'لوفان، بلجيكا',
      reason: 'برنامج باللغة الإنجليزية يناسب مستواك B2.',
      tags: ['أعمال', 'إنجليزية'],
      url: 'https://www.studely.com/ar/programs/business-leuven'
    },
    {
      type: 'مسار',
      title: 'سنة لغة ثم بكالوريوس — هامبورغ',
      destination: 'هامبورغ، ألمانيا',
      reason: 'ألمانيا ضمن وجهاتك؛ سنة اللغة تضمن القبول.',
      tags: ['ألمانيا', 'لغة'],
      url: 'https://www.studely.com/ar/programs/language-year-hamburg'
    }
  ]
}

export function recommendationsFor(locale: Locale): RecommendationsResponse {
  // Copie profonde : les scénarios qui mutent les items (bad-url,
  // html-reason) ne doivent pas polluer les requêtes suivantes.
  return {
    items: structuredClone(RECOS[locale] ?? RECOS.fr),
    disclaimerUrl: 'https://www.studely.com/reco-disclaimer'
  }
}
