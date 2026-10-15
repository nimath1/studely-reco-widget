import { onMounted, ref, watch, type Ref } from 'vue'
import { readHandoff, type AssistantHandoff } from '~/utils/assistant-handoff'

interface HandoffChannel {
  value: AssistantHandoff | null
  /** Incrémenté à chaque publication : deux besoins identiques restent deux signaux. */
  revision: number
}

/**
 * Canal applicatif du besoin transmis par le panneau de recherche assistée.
 * L'état d'historique porte le besoin à la navigation (rechargement, retour
 * arrière) ; ce canal le livre en plus aux pages **déjà montées** : la clé de
 * page est `route.path`, donc changer de recommandation ou rouvrir le panneau
 * depuis le formulaire ne le remonte pas, et un lien vers l'URL courante ne
 * déclenche aucune navigation. Le texte libre ne passe jamais par l'URL.
 */
export function useAssistantHandoffChannel() {
  const channel = useState<HandoffChannel>('assistant-handoff', () => ({
    value: null,
    revision: 0
  }))

  function publish(handoff: AssistantHandoff | null): void {
    channel.value = { value: handoff, revision: channel.value.revision + 1 }
  }

  return { channel, publish }
}

/**
 * Besoin reçu par une page de destination : celui de l'entrée d'historique au
 * montage, puis chaque publication du panneau tant que la page reste montée.
 * `onReceive` reçoit le besoin et le précédent — à la page de décider ce
 * qu'elle pré-remplit sans écraser une saisie.
 */
export function useReceivedHandoff(
  onReceive?: (handoff: AssistantHandoff | null, previous: AssistantHandoff | null) => void
): Ref<AssistantHandoff | null> {
  const { channel } = useAssistantHandoffChannel()
  const handoff = ref<AssistantHandoff | null>(null)

  function receive(next: AssistantHandoff | null): void {
    const previous = handoff.value
    handoff.value = next
    onReceive?.(next, previous)
  }

  onMounted(() => receive(readHandoff()))
  watch(
    () => channel.value.revision,
    () => receive(channel.value.value)
  )

  return handoff
}
