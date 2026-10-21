import type { AssistantContext } from '@learnup/types'

export interface AssistantOpenOptions {
  /** Contexte du point d'entrée (centre, formation, thème éditorial…). */
  context?: AssistantContext
  /** Message envoyé automatiquement à l'ouverture (recherche hero, filtre catalogue). */
  message?: string
}

/**
 * Ouverture globale du panneau de recherche assistée (widget bas-droite).
 * Les points d'entrée appellent `open()` ; le composant `AssistantChat`,
 * monté dans `app.vue`, consomme le contexte et le message en file.
 */
export function useAssistantLauncher() {
  const isOpen = useState<boolean>('assistant-open', () => false)
  const context = useState<AssistantContext>('assistant-context', () => ({}))
  const pendingMessage = useState<string | null>('assistant-message', () => null)

  function open(options: AssistantOpenOptions = {}) {
    context.value = options.context ?? {}
    pendingMessage.value = options.message?.trim() || null
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  return { isOpen, context, pendingMessage, open, close }
}
