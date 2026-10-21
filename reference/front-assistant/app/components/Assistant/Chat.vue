<template>
  <div>
    <!-- Lanceur flottant -->
    <Motion
      v-if="!isOpen"
      :initial="{ opacity: 0, scale: 0.5 }"
      :animate="{ opacity: 1, scale: 1 }"
      :while-press="{ scale: 0.9 }"
      :transition="{ type: 'spring', stiffness: 300, damping: 22 }"
      class="fixed bottom-lg right-lg z-40"
    >
      <Button
        size="icon"
        aria-label="Ouvrir la recherche assistée"
        class="h-12 w-12 rounded-full bg-primary text-paper shadow-md hover:bg-primary-dark"
        @click="open()"
      >
        <IconSparkle :size="20" aria-hidden="true" />
      </Button>
    </Motion>

    <!-- Panneau conversationnel : plein ecran, mobile comme desktop —
         modal (showModal) : focus trap, Échap natif, fond inerte. -->
    <Transition name="assistant-panel">
      <dialog
        v-if="isOpen"
        ref="panelEl"
        aria-modal="true"
        aria-label="Recherche assistée"
        class="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none flex-col overflow-hidden bg-paper p-0"
        @cancel.prevent="close"
        @click="onPanelClick"
      >
        <AssistantConversation
          class="h-full"
          :entries="entries"
          :pending="pending"
          :unavailable="unavailable"
          :context-chips="contextChips"
          :need-summary="needSummary"
          :headcount="slots.headcount"
          :location="slots.location"
          :degraded="lastReply?.mode === 'fallback'"
          :notice="lastReply?.notice"
          @send="tracking.submit"
          @edit="tracking.edit"
          @stop="stop"
          @retry="retry"
          @reset="onReset"
          @close="close"
          @select="tracking.select"
          @compare="tracking.compare"
        />
      </dialog>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Motion } from 'motion-v'
import { useAssistant, type AssistantEntry } from '~/composables/useAssistant'
import { ADVISOR_ESCALATION_ATTR } from '~/composables/useAssistantAnalytics'
import { useAssistantHandoffChannel } from '~/composables/useAssistantHandoff'
import { useAssistantLauncher } from '~/composables/useAssistantLauncher'
import { useAssistantTracking } from '~/composables/useAssistantTracking'
import AssistantConversation from '~/components/Assistant/Conversation.vue'
import { HANDOFF_LINK_ATTR, persistHandoff, toHandoff } from '~/utils/assistant-handoff'

const { isOpen, context, pendingMessage, open, close } = useAssistantLauncher()

const assistant = useAssistant(context, {
  onReply: (reply, meta) => tracking.onReply(reply, meta)
})
const {
  entries,
  pending,
  unavailable,
  contextChips,
  slots,
  lastReply,
  needSummary,
  append,
  retry,
  reset,
  stop
} = assistant

// Jalons analytics du parcours : le widget relaie, le composable classe.
const tracking = useAssistantTracking(assistant, context)
const { publish: publishHandoff } = useAssistantHandoffChannel()

const GREETING: AssistantEntry = {
  role: 'assistant',
  content: 'Bonjour, comment puis-je vous aider aujourd’hui ?',
  reply: {
    kind: 'clarify',
    text: 'Bonjour, comment puis-je vous aider aujourd’hui ?',
    suggestions: [
      'Je veux former mes salariés au SST',
      'Je cherche une formation CACES R486',
      'Je veux former mes équipes à l’ATEX'
    ]
  }
}

function greet() {
  append({ ...GREETING })
}

const panelEl = ref<HTMLDialogElement>()
let previousFocus: Element | null = null

// Ouverture : le <dialog> devient modal (focus trap + Échap natif) ; à la
// fermeture le focus revient sur l'élément déclencheur.
watch(
  isOpen,
  (open) => {
    if (typeof document === 'undefined') return // SSR
    if (open) {
      tracking.panelOpened(pendingMessage.value ? 'auto' : 'manuel')
      previousFocus = document.activeElement
      nextTick(() => {
        if (panelEl.value && !panelEl.value.open) panelEl.value.showModal?.()
      })
    } else {
      tracking.panelClosed()
      nextTick(() => (previousFocus as HTMLElement | null)?.focus?.())
    }
  },
  { immediate: true }
)

// Ouverture : message d'entrée éventuel envoyé directement, sinon accueil.
// `pendingMessage` est aussi écouté : un open({ message }) pendant que le
// panneau est déjà ouvert envoie le message dans la conversation en cours.
// `immediate` couvre le cas où open() a été appelé avant le mount du widget.
watch(
  [isOpen, pendingMessage],
  ([open], [wasOpen]) => {
    if (!open) return
    const message = pendingMessage.value
    if (message) {
      pendingMessage.value = null
      // Nouveau besoin transmis par un point d'entrée : début de recherche.
      tracking.onOpen({ entryMessage: true })
      tracking.submit(message, 'entry')
      return
    }
    if (!wasOpen) tracking.onOpen()
    // Pas de message en file : accueil, sauf si un envoi est déjà en cours
    // (send() est asynchrone — le tour user n'est pas encore dans entries).
    if (entries.value.length === 0 && !pending.value) greet()
  },
  { immediate: true }
)

// Les liens du panneau (fiche formation, demande, conseiller) naviguent
// derrière le <dialog> modal : sans fermeture explicite, le panneau reste
// ouvert par-dessus la page cible. Deux garde-fous : le clic sur un lien
// (couvre la navigation vers la route courante, qui ne change pas fullPath)
// et le watch (retour arrière, navigation programmatique).
const route = useRoute()
watch(
  () => route.fullPath,
  () => {
    if (isOpen.value) close()
  }
)

function onPanelClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement | null)?.closest?.('a')
  if (!anchor) return
  // Sortie conseiller : le lien porte l'état d'où il part.
  const from = anchor.getAttribute(ADVISOR_ESCALATION_ATTR)
  if (from) tracking.escalate(from)
  // Lien de transmission : le besoin est publié aux pages déjà montées — la
  // destination peut être la page courante (« Modifier » depuis le formulaire,
  // autre recommandation sur la même page). Vers l'URL déjà affichée, la
  // navigation est un no-op : le besoin est inscrit dans l'entrée courante.
  if (anchor.hasAttribute(HANDOFF_LINK_ATTR)) {
    const handoff = toHandoff(needSummary.value, slots.value.headcount, slots.value.location)
    publishHandoff(handoff)
    if (anchor.getAttribute('href') === route.fullPath) persistHandoff(handoff)
  }
  close()
}

function onReset() {
  reset()
  tracking.newConversation()
  greet()
}
</script>
