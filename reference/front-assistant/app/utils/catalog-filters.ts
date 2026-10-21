export interface FilterOption {
  key: string
  label: string
  count?: number
  /** 0 résultat dans le contexte courant — affichée grisée (RG-CAT-07). */
  disabled?: boolean
}

export const MODALITY_OPTIONS: FilterOption[] = [
  { key: 'presentiel', label: 'Présentiel' },
  { key: 'distanciel', label: 'Distanciel' },
  { key: 'hybride', label: 'Hybride' },
  { key: 'intra', label: 'Intra' },
  { key: 'inter', label: 'Inter' }
]

export const DURATION_OPTIONS: FilterOption[] = [
  { key: 'courte', label: 'Courte (≤ 8 h)' },
  { key: 'moyenne', label: 'Moyenne (> 8 à 40 h)' },
  { key: 'longue', label: 'Longue (> 40 h)' }
]

export const CERTIFICATION_OPTIONS: FilterOption[] = [
  { key: 'certification', label: 'Certification' },
  { key: 'habilitation', label: 'Habilitation' },
  { key: 'recyclage', label: 'Recyclage' },
  { key: 'reglementaire', label: 'Réglementaire' }
]

export const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
  intra: 'Intra',
  inter: 'Inter'
}

export const DURATION_LABELS: Record<string, string> = {
  courte: 'Courte (≤ 8 h)',
  moyenne: 'Moyenne (> 8 à 40 h)',
  longue: 'Longue (> 40 h)'
}

export const CERTIFICATION_LABELS: Record<string, string> = {
  certification: 'Certification',
  habilitation: 'Habilitation',
  recyclage: 'Recyclage',
  reglementaire: 'Réglementaire'
}

export function getFilterLabel(
  group: 'families' | 'modalities' | 'durations' | 'certifications' | 'location',
  key: string
): string {
  if (group === 'modalities') return MODALITY_LABELS[key] ?? key
  if (group === 'durations') return DURATION_LABELS[key] ?? key
  if (group === 'certifications') return CERTIFICATION_LABELS[key] ?? key
  return key
}
