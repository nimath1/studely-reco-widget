/**
 * Données du mock : réponses du chatbot dans les 5 locales.
 */
import type { ChatCitation, ChatReply } from '../src/api/types'
import type { Locale } from '../src/config'

const REPLY_TEXT: Record<Locale, string> = {
  fr: 'Voici trois pistes adaptées à ton profil : une licence d’informatique à Lyon, un bachelor en commerce à Louvain et une année de langue à Hambourg. Chaque lien mène vers la fiche programme Studely.',
  en: 'Here are three paths that fit your profile: a computer science degree in Lyon, a business bachelor in Leuven, and a language year in Hamburg. Each link leads to the Studely program page.',
  es: 'Aquí tienes tres opciones que encajan con tu perfil: un grado en informática en Lyon, un grado en empresa en Lovaina y un año de idioma en Hamburgo. Cada enlace lleva a la ficha del programa.',
  de: 'Hier sind drei Wege, die zu deinem Profil passen: ein Informatik-Bachelor in Lyon, ein BWL-Bachelor in Löwen und ein Sprachjahr in Hamburg. Jeder Link führt zur Programmseite.',
  ar: 'إليك ثلاثة مسارات تناسب ملفك: إجازة علوم الحاسوب في ليون، وبكالوريوس إدارة الأعمال في لوفان، وسنة لغة في هامبورغ. كل رابط يقود إلى صفحة البرنامج.'
}

const CITATIONS: Record<Locale, ChatCitation[]> = {
  fr: [
    {
      title: 'Licence Informatique — Université de Lyon',
      url: 'https://www.studely.com/programmes/licence-info-lyon'
    },
    {
      title: 'Bachelor Business — KU Leuven',
      url: 'https://www.studely.com/programmes/bachelor-business-leuven'
    },
    {
      title: 'Année de langue — Hambourg',
      url: 'https://www.studely.com/programmes/annee-langue-hambourg'
    }
  ],
  en: [
    {
      title: 'BSc Computer Science — University of Lyon',
      url: 'https://www.studely.com/en/programs/bsc-cs-lyon'
    },
    {
      title: 'Bachelor of Business — KU Leuven',
      url: 'https://www.studely.com/en/programs/bsc-business-leuven'
    },
    {
      title: 'Language year — Hamburg',
      url: 'https://www.studely.com/en/programs/language-year-hamburg'
    }
  ],
  es: [
    {
      title: 'Grado en Informática — Universidad de Lyon',
      url: 'https://www.studely.com/es/programas/grado-informatica-lyon'
    },
    {
      title: 'Grado en Empresa — KU Leuven',
      url: 'https://www.studely.com/es/programas/grado-empresa-leuven'
    },
    {
      title: 'Año de idioma — Hamburgo',
      url: 'https://www.studely.com/es/programas/ano-idioma-hamburgo'
    }
  ],
  de: [
    {
      title: 'Bachelor Informatik — Universität Lyon',
      url: 'https://www.studely.com/de/programme/bachelor-informatik-lyon'
    },
    {
      title: 'Bachelor Betriebswirtschaft — KU Leuven',
      url: 'https://www.studely.com/de/programme/bachelor-bwl-leuven'
    },
    {
      title: 'Sprachjahr — Hamburg',
      url: 'https://www.studely.com/de/programme/sprachjahr-hamburg'
    }
  ],
  ar: [
    {
      title: 'إجازة علوم الحاسوب — جامعة ليون',
      url: 'https://www.studely.com/ar/programs/cs-lyon'
    },
    {
      title: 'بكالوريوس إدارة الأعمال — KU Leuven',
      url: 'https://www.studely.com/ar/programs/business-leuven'
    },
    {
      title: 'سنة لغة — هامبورغ',
      url: 'https://www.studely.com/ar/programs/language-year-hamburg'
    }
  ]
}

export function chatReplyFor(locale: Locale): ChatReply {
  return {
    text: REPLY_TEXT[locale] ?? REPLY_TEXT.fr,
    meta: {
      session_id: 'mock-session-1',
      intent: 'reco',
      lang: locale,
      out_of_scope: false,
      citations: structuredClone(CITATIONS[locale] ?? CITATIONS.fr)
    }
  }
}
