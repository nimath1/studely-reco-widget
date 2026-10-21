/**
 * Données du mock : réponses du chatbot dans les 5 locales.
 */
import type { ChatCitation, ChatReply } from '../src/api/types'
import type { Locale } from '../src/config'

// Real payload shape: literal `[Sn]` markers in the text correlate with
// `label` on each citation/source entry.
const REPLY_TEXT: Record<Locale, string> = {
  fr: 'Voici trois pistes adaptées à ton profil : une licence d’informatique à Lyon [S1], un bachelor en commerce à Louvain [S2] et une année de langue à Hambourg [S3]. Chaque lien mène vers la fiche programme Studely.',
  en: 'Here are three paths that fit your profile: a computer science degree in Lyon [S1], a business bachelor in Leuven [S2], and a language year in Hamburg [S3]. Each link leads to the Studely program page.',
  es: 'Aquí tienes tres opciones que encajan con tu perfil: un grado en informática en Lyon [S1], un grado en empresa en Lovaina [S2] y un año de idioma en Hamburgo [S3]. Cada enlace lleva a la ficha del programa.',
  de: 'Hier sind drei Wege, die zu deinem Profil passen: ein Informatik-Bachelor in Lyon [S1], ein BWL-Bachelor in Löwen [S2] und ein Sprachjahr in Hamburg [S3]. Jeder Link führt zur Programmseite.',
  ar: 'إليك ثلاثة مسارات تناسب ملفك: إجازة علوم الحاسوب في ليون [S1]، وبكالوريوس إدارة الأعمال في لوفان [S2]، وسنة لغة في هامبورغ [S3]. كل رابط يقود إلى صفحة البرنامج.'
}

const CITATIONS: Record<Locale, ChatCitation[]> = {
  fr: [
    {
      label: 'S1',
      title: 'Licence Informatique — Université de Lyon',
      source_url: 'https://support.studely.com/hc/fr/articles/101-licence-informatique-lyon',
      updated_at: '2025-11-04'
    },
    {
      label: 'S2',
      title: 'Bachelor Business — KU Leuven',
      source_url: 'https://support.studely.com/hc/fr/articles/102-bachelor-business-leuven',
      updated_at: '2025-10-21'
    },
    {
      label: 'S3',
      title: 'Année de langue — Hambourg',
      source_url: 'https://support.studely.com/hc/fr/articles/103-annee-langue-hambourg',
      updated_at: '2025-09-30'
    }
  ],
  en: [
    {
      label: 'S1',
      title: 'BSc Computer Science — University of Lyon',
      source_url: 'https://support.studely.com/hc/en/articles/201-bsc-computer-science-lyon',
      updated_at: '2025-11-04'
    },
    {
      label: 'S2',
      title: 'Bachelor of Business — KU Leuven',
      source_url: 'https://support.studely.com/hc/en/articles/202-bachelor-business-leuven',
      updated_at: '2025-10-21'
    },
    {
      label: 'S3',
      title: 'Language year — Hamburg',
      source_url: 'https://support.studely.com/hc/en/articles/203-language-year-hamburg',
      updated_at: '2025-09-30'
    }
  ],
  es: [
    {
      label: 'S1',
      title: 'Grado en Informática — Universidad de Lyon',
      source_url: 'https://support.studely.com/hc/es/articles/301-grado-informatica-lyon',
      updated_at: '2025-11-04'
    },
    {
      label: 'S2',
      title: 'Grado en Empresa — KU Leuven',
      source_url: 'https://support.studely.com/hc/es/articles/302-grado-empresa-leuven',
      updated_at: '2025-10-21'
    },
    {
      label: 'S3',
      title: 'Año de idioma — Hamburgo',
      source_url: 'https://support.studely.com/hc/es/articles/303-ano-idioma-hamburgo',
      updated_at: '2025-09-30'
    }
  ],
  de: [
    {
      label: 'S1',
      title: 'Bachelor Informatik — Universität Lyon',
      source_url: 'https://support.studely.com/hc/de/articles/401-bachelor-informatik-lyon',
      updated_at: '2025-11-04'
    },
    {
      label: 'S2',
      title: 'Bachelor Betriebswirtschaft — KU Leuven',
      source_url: 'https://support.studely.com/hc/de/articles/402-bachelor-bwl-leuven',
      updated_at: '2025-10-21'
    },
    {
      label: 'S3',
      title: 'Sprachjahr — Hamburg',
      source_url: 'https://support.studely.com/hc/de/articles/403-sprachjahr-hamburg',
      updated_at: '2025-09-30'
    }
  ],
  ar: [
    {
      label: 'S1',
      title: 'إجازة علوم الحاسوب — جامعة ليون',
      source_url: 'https://support.studely.com/hc/ar/articles/501-cs-lyon',
      updated_at: '2025-11-04'
    },
    {
      label: 'S2',
      title: 'بكالوريوس إدارة الأعمال — KU Leuven',
      source_url: 'https://support.studely.com/hc/ar/articles/502-business-leuven',
      updated_at: '2025-10-21'
    },
    {
      label: 'S3',
      title: 'سنة لغة — هامبورغ',
      source_url: 'https://support.studely.com/hc/ar/articles/503-language-year-hamburg',
      updated_at: '2025-09-30'
    }
  ]
}

export function chatReplyFor(locale: Locale): ChatReply {
  const list = CITATIONS[locale] ?? CITATIONS.fr
  return {
    text: REPLY_TEXT[locale] ?? REPLY_TEXT.fr,
    meta: {
      session_id: 'mock-session-1',
      intent: 'reco',
      lang: locale,
      out_of_scope: false,
      // Contract shape: `sources` = the full retrieval list (own SSE
      // event), `citations` = the entries actually cited in the text.
      sources: structuredClone(list),
      citations: structuredClone(list)
    }
  }
}
