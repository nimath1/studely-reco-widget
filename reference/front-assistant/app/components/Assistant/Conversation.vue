<template>
  <div class="flex h-full min-h-0 flex-col bg-paper">
    <!-- En-tête -->
    <header class="flex items-center justify-between gap-sm border-b border-rule px-lg py-md">
      <h2 class="flex items-center gap-sm text-small font-semibold text-ink">
        <IconSparkle :size="18" class="text-accent" aria-hidden="true" />
        Recherche assistée
      </h2>
      <div class="flex items-center gap-md">
        <Button
          variant="outline"
          class="flex items-center gap-xs rounded-full border-rule px-md py-xs text-meta font-semibold text-ink hover:border-primary hover:text-accent-text max-md:min-h-touch"
          @click="$emit('reset')"
        >
          <IconPlus :size="14" aria-hidden="true" />
          Nouvelle recherche
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fermer la recherche assistée"
          class="h-touch w-touch rounded-full text-ink-subtle hover:text-ink"
          @click="$emit('close')"
        >
          <IconClose :size="16" aria-hidden="true" />
        </Button>
      </div>
    </header>

    <!-- Contexte agrégé (E11) : filet pleine largeur, contenu centre -->
    <div v-if="contextChips.length" class="border-b border-rule px-lg py-sm text-meta">
      <div
        class="mx-auto flex w-full max-w-[calc(var(--spacing-container)*0.8)] flex-wrap items-center justify-between gap-sm"
      >
        <div class="flex flex-wrap items-center gap-sm">
          <span class="font-semibold uppercase tracking-wide text-ink-subtle">Contexte</span>
          <Badge v-for="chip in contextChips" :key="chip" variant="outline">
            {{ chip }}
          </Badge>
        </div>
        <Button
          variant="link"
          class="h-auto p-0 font-semibold text-primary hover:text-accent-text"
          @click="focusInput"
        >
          Modifier mon besoin
        </Button>
      </div>
    </div>

    <!-- Mode dégradé : l'API IA est indisponible, la recherche déterministe
         répond à sa place (`reply.mode === 'fallback'`) — bascule visible,
         sortie conseiller à portée. La région de statut existe toujours dans
         le DOM (WCAG 4.1.3) : une région live insérée avec son contenu n'est
         souvent pas annoncée ; seul l'intérieur est conditionnel. -->
    <div
      role="status"
      :class="
        degraded
          ? 'border-b border-warning/40 bg-warning-soft px-lg py-sm text-meta text-ink'
          : 'sr-only'
      "
    >
      <div
        v-if="degraded"
        class="mx-auto flex w-full max-w-[calc(var(--spacing-container)*0.8)] flex-wrap items-center gap-sm"
      >
        <IconZap :size="14" class="shrink-0 text-warning" aria-hidden="true" />
        <span class="flex-1 basis-[calc(var(--spacing-container)*0.3)]">
          <strong class="font-semibold">Recherche simplifiée</strong> — l'assistant IA est
          momentanément indisponible : les résultats proviennent d'une recherche directe dans le
          catalogue publié, à partir des mots de votre demande.
        </span>
        <NuxtLink
          :to="advisorTo"
          data-assistant-handoff
          data-advisor-escalation="degraded"
          class="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-accent-text"
        >
          Parler à votre conseiller
        </NuxtLink>
      </div>
    </div>

    <!-- Fil de conversation : un seul viewport scrollable. Le contenu est la
         seule région live du fil (`role="log"` : polie, additions) — chaque
         ajout est annoncé à son arrivée, squelette d'analyse et réponse
         compris ; pas d'`aria-busy` (il suspendrait les annonces) ni de région
         imbriquée (double annonce). -->
    <MessageScrollerProvider auto-scroll default-scroll-position="end">
      <MessageScroller class="min-h-0 flex-1">
        <MessageScrollerViewport class="px-lg py-lg">
          <MessageScrollerContent
            class="mx-auto w-full max-w-[calc(var(--spacing-container)*0.8)] gap-lg"
          >
            <MessageScrollerItem
              v-for="(entry, i) in entries"
              :key="entry.id ?? i"
              :message-id="entryId(entry, i)"
              :scroll-anchor="entry.role === 'user'"
            >
              <Motion
                :initial="{ opacity: 0, y: 12 }"
                :animate="{ opacity: 1, y: 0 }"
                :transition="{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }"
              >
                <Message :align="entry.role === 'user' ? 'end' : 'start'">
                  <template v-if="entry.role === 'user'">
                    <MessageContent>
                      <form
                        v-if="editingId && entry.id === editingId"
                        class="flex w-full max-w-[85%] items-center gap-xs self-end"
                        @submit.prevent="submitEdit(entry)"
                      >
                        <Input
                          :id="editInputId"
                          v-model="editDraft"
                          type="text"
                          aria-label="Modifier votre message"
                          class="h-control flex-1 rounded-lg border-rule bg-paper px-md text-small text-ink shadow-none focus-visible:ring-2 focus-visible:ring-outline-soft"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          aria-label="Envoyer la modification"
                          class="h-control w-control shrink-0 rounded-full bg-primary text-paper hover:bg-primary-dark"
                        >
                          <IconCheck :size="16" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Annuler la modification"
                          class="h-control w-control shrink-0 rounded-full text-ink-subtle hover:text-ink"
                          @click="cancelEdit"
                        >
                          <IconClose :size="16" />
                        </Button>
                      </form>
                      <template v-else>
                        <Bubble align="end" variant="surface">
                          <BubbleContent
                            class="rounded-lg rounded-tr-sm bg-surface px-md py-sm text-small text-ink"
                          >
                            {{ entry.content }}
                          </BubbleContent>
                        </Bubble>
                        <MessageFooter v-if="entry.id && !pending" class="px-0">
                          <Button
                            variant="link"
                            class="h-auto p-0 text-meta font-semibold text-ink-subtle hover:text-primary"
                            @click="startEdit(entry)"
                          >
                            Modifier
                          </Button>
                        </MessageFooter>
                      </template>
                    </MessageContent>
                  </template>

                  <template v-else>
                    <MessageAvatar
                      class="mt-0 h-xl w-xl self-start bg-primary text-accent"
                      aria-hidden="true"
                    >
                      <IconSparkle :size="12" />
                    </MessageAvatar>
                    <MessageContent class="pt-xs">
                      <Bubble variant="ghost" class="w-full">
                        <BubbleContent class="p-0 text-small text-ink-body">
                          <!-- Réponse produite en mode dégradé : signalée dans l'historique -->
                          <Badge
                            v-if="entry.reply?.mode === 'fallback'"
                            variant="warning"
                            class="mb-sm"
                          >
                            Recherche simplifiée
                          </Badge>
                          <p
                            :class="{
                              'font-semibold text-ink':
                                entry.reply?.kind === 'no_results' ||
                                entry.reply?.kind === 'out_of_catalog'
                            }"
                          >
                            {{ entry.content }}
                          </p>

                          <template v-if="entry.reply?.kind === 'clarify'">
                            <p
                              v-if="entry.reply.question"
                              class="mt-sm text-small font-semibold text-ink"
                            >
                              {{ entry.reply.question }}
                            </p>
                            <ul
                              v-if="entry.reply.suggestions?.length"
                              class="mt-md flex flex-wrap gap-sm"
                            >
                              <li
                                v-for="(suggestion, si) in entry.reply.suggestions"
                                :key="suggestion"
                              >
                                <Motion
                                  :initial="{ opacity: 0, y: 8, scale: 0.96 }"
                                  :animate="{ opacity: 1, y: 0, scale: 1 }"
                                  :transition="{
                                    duration: 0.25,
                                    delay: 0.15 + si * 0.06,
                                    ease: [0.16, 1, 0.3, 1]
                                  }"
                                >
                                  <Button
                                    variant="outline"
                                    :disabled="pending"
                                    class="rounded-full border-rule px-md py-sm text-meta font-medium text-ink-muted hover:border-primary hover:text-primary max-md:min-h-touch"
                                    @click="$emit('send', suggestion, 'suggestion')"
                                  >
                                    {{ suggestion }}
                                  </Button>
                                </Motion>
                              </li>
                            </ul>
                          </template>

                          <template v-else-if="entry.reply?.kind === 'recommend'">
                            <p class="mt-sm text-small font-semibold text-ink">
                              Nous vous recommandons
                            </p>
                            <div class="mt-md space-y-md">
                              <Motion
                                v-for="(rec, ri) in primaryRecs(entry)"
                                :key="rec.slug"
                                :initial="{ opacity: 0, y: 14 }"
                                :animate="{ opacity: 1, y: 0 }"
                                :transition="{
                                  duration: 0.35,
                                  delay: 0.15 + ri * 0.08,
                                  ease: [0.16, 1, 0.3, 1]
                                }"
                              >
                                <AssistantRecommendationCard
                                  :recommendation="rec"
                                  :demande-to="demandeTo(rec)"
                                  :advisor-to="advisorTo"
                                  @select="onSelect(rec, $event)"
                                />
                              </Motion>
                              <div
                                v-if="alternativeRecs(entry).length"
                                class="grid gap-md sm:grid-cols-2"
                              >
                                <Motion
                                  v-for="(rec, ri) in alternativeRecs(entry)"
                                  :key="rec.slug"
                                  :initial="{ opacity: 0, y: 14 }"
                                  :animate="{ opacity: 1, y: 0 }"
                                  :transition="{
                                    duration: 0.35,
                                    delay: 0.3 + ri * 0.08,
                                    ease: [0.16, 1, 0.3, 1]
                                  }"
                                >
                                  <AssistantRecommendationCard
                                    :recommendation="rec"
                                    :demande-to="demandeTo(rec)"
                                    compact
                                    @select="onSelect(rec, $event)"
                                  />
                                </Motion>
                              </div>
                            </div>
                            <!-- Sortie conseiller toujours présente ; comparaison dès 2 formations -->
                            <p class="mt-md text-meta">
                              <template v-if="(entry.reply.recommendations?.length ?? 0) > 1">
                                <Button
                                  variant="link"
                                  class="h-auto p-0 font-semibold text-primary underline underline-offset-2 hover:text-accent-text"
                                  @click="toggleCompare(i)"
                                >
                                  Comparer ces {{ entry.reply.recommendations?.length }} formations
                                </Button>
                                ·
                              </template>
                              <NuxtLink
                                :to="advisorTo"
                                data-assistant-handoff
                                data-advisor-escalation="recommend"
                                class="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-accent-text"
                              >
                                Être accompagné par votre conseiller
                              </NuxtLink>
                            </p>
                            <AssistantCompareTable
                              v-if="
                                compareOpen.has(i) && (entry.reply.recommendations?.length ?? 0) > 1
                              "
                              :recommendations="entry.reply.recommendations ?? []"
                              :need-summary="needSummary"
                              :advisor-to="advisorTo"
                              class="mt-md"
                              @select="onSelect"
                            />
                            <p class="mt-md text-meta text-ink-subtle">
                              {{ provenanceNote(entry) }}
                            </p>
                          </template>

                          <template v-else-if="entry.reply?.kind === 'no_results'">
                            <ul class="mt-md grid gap-sm sm:grid-cols-2">
                              <li>
                                <Button
                                  variant="outline"
                                  class="w-full gap-sm rounded-full border-rule px-md py-sm text-meta font-semibold text-ink hover:border-primary max-md:min-h-touch"
                                  @click="focusInput"
                                >
                                  <IconRefresh
                                    :size="14"
                                    class="shrink-0 text-primary"
                                    aria-hidden="true"
                                  />
                                  Reformuler mon besoin
                                </Button>
                              </li>
                              <li>
                                <Button
                                  as-child
                                  variant="outline"
                                  class="w-full gap-sm rounded-full border-rule px-md py-sm text-meta font-semibold text-ink hover:border-primary max-md:min-h-touch"
                                >
                                  <NuxtLink to="/formations">
                                    <IconBook
                                      :size="14"
                                      class="shrink-0 text-primary"
                                      aria-hidden="true"
                                    />
                                    Consulter le catalogue
                                  </NuxtLink>
                                </Button>
                              </li>
                              <li>
                                <Button
                                  as-child
                                  variant="outline"
                                  class="w-full gap-sm rounded-full border-rule px-md py-sm text-meta font-semibold text-ink hover:border-primary max-md:min-h-touch"
                                >
                                  <NuxtLink
                                    :to="advisorTo"
                                    data-assistant-handoff
                                    data-advisor-escalation="no_results"
                                  >
                                    <IconMessages
                                      :size="14"
                                      class="shrink-0 text-primary"
                                      aria-hidden="true"
                                    />
                                    Parler à votre conseiller
                                  </NuxtLink>
                                </Button>
                              </li>
                              <li>
                                <Button
                                  as-child
                                  class="w-full gap-sm rounded-full bg-accent px-md py-sm text-meta font-semibold text-ink hover:bg-accent-text hover:text-paper max-md:min-h-touch"
                                >
                                  <NuxtLink :to="demandeBaseTo" data-assistant-handoff>
                                    <IconPlus :size="14" class="shrink-0" aria-hidden="true" />
                                    Faire une demande personnalisée
                                  </NuxtLink>
                                </Button>
                              </li>
                            </ul>
                          </template>

                          <template v-else-if="entry.reply?.kind === 'out_of_catalog'">
                            <div class="mt-md flex flex-wrap gap-md">
                              <Button
                                as-child
                                class="rounded-full bg-accent px-md py-sm text-meta font-semibold text-ink hover:bg-accent-text hover:text-paper max-md:min-h-touch"
                              >
                                <NuxtLink
                                  :to="advisorTo"
                                  data-assistant-handoff
                                  data-advisor-escalation="out_of_catalog"
                                  >Décrire mon besoin à votre conseiller</NuxtLink
                                >
                              </Button>
                              <Button
                                as-child
                                variant="outline"
                                class="rounded-full border-rule px-md py-sm text-meta font-semibold text-ink hover:border-primary max-md:min-h-touch"
                              >
                                <NuxtLink to="/formations">Voir le catalogue</NuxtLink>
                              </Button>
                            </div>
                          </template>
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </template>
                </Message>
              </Motion>
            </MessageScrollerItem>

            <!-- Analyse en cours (E2) — squelette type catalogue -->
            <MessageScrollerItem v-if="pending" message-id="assistant-pending">
              <Motion
                :initial="{ opacity: 0, y: 8 }"
                :animate="{ opacity: 1, y: 0 }"
                :transition="{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }"
              >
                <Message>
                  <MessageAvatar
                    class="mt-0 h-xl w-xl self-start bg-primary text-accent"
                    aria-hidden="true"
                  >
                    <IconSparkle :size="12" />
                  </MessageAvatar>
                  <MessageContent class="pt-xs">
                    <Bubble variant="ghost" class="w-full">
                      <BubbleContent class="p-0">
                        <div class="block">
                          <p class="text-small font-medium text-ink-muted">
                            Analyse de votre besoin…
                          </p>
                          <div class="mt-md flex flex-col gap-sm" aria-hidden="true">
                            <span class="h-xs w-full animate-pulse rounded-full bg-surface" />
                            <span class="h-xs w-3/4 animate-pulse rounded-full bg-surface" />
                            <span class="h-xs w-1/2 animate-pulse rounded-full bg-accent/30" />
                          </div>
                          <Button
                            variant="outline"
                            class="mt-md w-fit rounded-full border-rule px-md py-xs text-meta font-semibold text-ink hover:border-primary hover:text-primary max-md:min-h-touch"
                            @click="$emit('stop')"
                          >
                            Arrêter la réponse
                          </Button>
                        </div>
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </Motion>
            </MessageScrollerItem>

            <!-- Indisponible (E9) -->
            <MessageScrollerItem v-if="unavailable" message-id="assistant-unavailable">
              <Motion
                :initial="{ opacity: 0, y: 8 }"
                :animate="{ opacity: 1, y: 0 }"
                :transition="{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }"
              >
                <Message>
                  <MessageContent>
                    <div
                      class="flex flex-col items-center gap-md rounded-md border border-rule bg-surface-soft p-xl text-center"
                    >
                      <span
                        class="flex h-2xl w-2xl items-center justify-center rounded-full bg-accent-soft text-accent-text"
                        aria-hidden="true"
                      >
                        <IconAlertTriangle :size="20" />
                      </span>
                      <div>
                        <h3 class="text-small font-bold text-ink">
                          La recherche assistée est momentanément indisponible.
                        </h3>
                        <p class="mt-sm text-meta text-ink-muted">
                          Vous pouvez réessayer dans quelques instants. Le catalogue reste
                          accessible pour rechercher une formation.
                        </p>
                      </div>
                      <div class="flex w-full flex-col gap-sm sm:flex-row">
                        <Button
                          class="h-control flex-1 gap-sm rounded-full bg-primary px-md text-meta font-semibold text-paper hover:bg-primary-dark"
                          @click="$emit('retry')"
                        >
                          <IconRefresh :size="14" aria-hidden="true" />
                          Réessayer
                        </Button>
                        <Button
                          as-child
                          variant="outline"
                          class="h-control flex-1 rounded-full border-rule px-md text-meta font-semibold text-ink hover:border-primary"
                        >
                          <NuxtLink
                            :to="advisorTo"
                            data-assistant-handoff
                            data-advisor-escalation="unavailable"
                            >Parler à votre conseiller</NuxtLink
                          >
                        </Button>
                      </div>
                    </div>
                  </MessageContent>
                </Message>
              </Motion>
            </MessageScrollerItem>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton
          variant="outline"
          size="icon"
          class="border-rule bg-paper text-ink shadow-sm hover:bg-surface"
        >
          <IconChevronDown :size="16" aria-hidden="true" />
          <span class="sr-only">Aller au dernier message</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>

    <!-- Saisie -->
    <div class="border-t border-rule px-lg py-md">
      <form
        class="mx-auto w-full max-w-[calc(var(--spacing-container)*0.8)]"
        @submit.prevent="submit"
      >
        <label :for="inputId" class="sr-only">Répondre ou décrire votre besoin</label>
        <InputGroup
          class="items-center gap-sm rounded-none border-0 bg-transparent shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent"
        >
          <InputGroupTextarea
            :id="inputId"
            v-model="draft"
            rows="1"
            :placeholder="entries.length ? 'Ou répondez librement…' : 'Décrivez votre besoin…'"
            :disabled="pending"
            class="h-control max-h-[calc(var(--spacing-control)*3)] min-h-control flex-1 overflow-y-auto rounded-lg border border-rule bg-paper px-md py-[calc((var(--spacing-control)-1lh)/2)] text-small text-ink shadow-none transition-[height] duration-150 ease-out placeholder:text-ink-placeholder scrollbar-none focus-visible:ring-2 focus-visible:ring-outline-soft disabled:cursor-not-allowed disabled:opacity-80 motion-reduce:transition-none [&::-webkit-scrollbar]:hidden"
            @keydown.enter.exact.prevent="submit"
          />
          <InputGroupAddon align="inline-end" class="p-0">
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              :disabled="pending"
              aria-label="Envoyer"
              class="h-control w-control shrink-0 rounded-full bg-primary text-paper hover:bg-primary-dark disabled:opacity-60"
            >
              <IconChevronRight :size="16" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      <!-- Transparence : mention « assistant automatisé » renvoyée par l'API -->
      <p
        v-if="notice"
        class="mx-auto mt-sm w-full max-w-[calc(var(--spacing-container)*0.8)] text-meta text-ink-subtle"
      >
        {{ notice }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useTextareaAutosize } from '@vueuse/core'
import { Motion } from 'motion-v'
import type { AssistantRecommendation } from '@learnup/types'
import type { AssistantEntry } from '~/composables/useAssistant'
import type {
  AssistantSelectAction,
  AssistantSelection,
  AssistantSubmitVia
} from '~/composables/useAssistantAnalytics'
import { advisorLink, demandeLink, toHandoff } from '~/utils/assistant-handoff'
import AssistantCompareTable from '~/components/Assistant/CompareTable.vue'
import AssistantRecommendationCard from '~/components/Assistant/RecommendationCard.vue'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from '~/components/ui/message-scroller'
import { Message, MessageAvatar, MessageContent, MessageFooter } from '~/components/ui/message'
import { Bubble, BubbleContent } from '~/components/ui/bubble'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea
} from '~/components/ui/input-group'

const props = defineProps<{
  entries: AssistantEntry[]
  pending: boolean
  unavailable: boolean
  contextChips: string[]
  /** Besoin agrégé (messages utilisateur) — transmis à la demande. */
  needSummary: string
  /** Créneaux extraits (effectif, lieu) pour pré-remplir la demande. */
  headcount?: number
  location?: string
  /** Dernière réponse produite par la recherche déterministe (IA indisponible). */
  degraded?: boolean
  /** Mention « assistant automatisé » de la dernière réponse (transparence). */
  notice?: string
}>()

const emit = defineEmits<{
  /** Message envoyé : réponse rapide (chip) ou saisie libre. */
  send: [value: string, via: AssistantSubmitVia]
  edit: [id: string, value: string]
  stop: []
  retry: []
  reset: []
  close: []
  /** CTA cliqué sur une recommandation (fiche, sessions, demande). */
  select: [selection: AssistantSelection]
  /** Tableau comparatif ouvert (nombre de formations comparées). */
  compare: [count: number]
}>()

const inputId = useId()
const editInputId = useId()
const draft = ref('')
const editingId = ref<string>()
const editDraft = ref('')
const compareOpen = ref(new Set<number>())
const { textarea, triggerResize } = useTextareaAutosize({ input: draft })

onMounted(async () => {
  await nextTick()
  const element = document.getElementById(inputId)
  textarea.value = element instanceof HTMLTextAreaElement ? element : null
  triggerResize()
  // Le panneau est modal : le focus entre dans la conversation dès l'ouverture.
  element?.focus()
})

onBeforeUnmount(() => {
  textarea.value = null
})

// Besoin en langage naturel (+ effectif, lieu extraits) transmis au tunnel de
// demande et à la page conseiller — hors URL (RGPD, voir
// utils/assistant-handoff) : aucune ressaisie, aucun texte libre dans
// `page_location`.
const handoff = computed(() => toHandoff(props.needSummary, props.headcount, props.location))

// Escalade conseiller : toutes les impasses et le pied des recommandations.
const advisorTo = computed(() => advisorLink(handoff.value))
const demandeBaseTo = computed(() => demandeLink({}, handoff.value))

function entryId(entry: AssistantEntry, index: number): string {
  return entry.id ?? `entry-${index}`
}

function toggleCompare(index: number) {
  const next = new Set(compareOpen.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
    emit('compare', props.entries[index]?.reply?.recommendations?.length ?? 0)
  }
  compareOpen.value = next
}

// E4 : la principale pleine largeur, les alternatives compactes en 2 colonnes.
function primaryRecs(entry: AssistantEntry): AssistantRecommendation[] {
  const recs = entry.reply?.recommendations ?? []
  return recs.filter((r) => r.rank === 'primary').length
    ? recs.filter((r) => r.rank === 'primary')
    : recs.slice(0, 1)
}

function alternativeRecs(entry: AssistantEntry): AssistantRecommendation[] {
  const recs = entry.reply?.recommendations ?? []
  return recs.filter((r) => !primaryRecs(entry).includes(r))
}

// E4/E5 — note de provenance sous le bloc recommandation : mention de source
// renvoyée par l'API (RG-IA-01), complétée quand une session est affichée.
const DEFAULT_SOURCE = 'Recommandations issues des formations publiées du catalogue LEARN UP.'
const SESSION_NOTE =
  'Session et disponibilité issues du référentiel — aucune disponibilité estimée.'

// Deux phrases accolées : la mention de source renvoyée par l'API se termine
// par un point, quelle que soit sa ponctuation d'origine.
function asSentence(text: string): string {
  return text.trim().replace(/[.s]*$/, '.')
}

function provenanceNote(entry: AssistantEntry): string {
  const hasSession = (entry.reply?.recommendations ?? []).some((r) => r.availability)
  const source = asSentence(entry.reply?.source || DEFAULT_SOURCE)
  return hasSession ? `${source} ${SESSION_NOTE}` : source
}

// Identifiants du catalogue en query, besoin hors URL.
function demandeTo(rec: AssistantRecommendation) {
  return demandeLink(
    {
      famille: rec.familySlug ?? undefined,
      formation: rec.slug,
      session: rec.availability?.sessionId ?? undefined
    },
    handoff.value
  )
}

function submit() {
  const text = draft.value.trim()
  if (!text || props.pending) return
  draft.value = ''
  emit('send', text, 'text')
}

function onSelect(rec: AssistantRecommendation, action: AssistantSelectAction) {
  emit('select', { slug: rec.slug, rank: rec.rank, action })
}

function startEdit(entry: AssistantEntry) {
  if (!entry.id) return
  editingId.value = entry.id
  editDraft.value = entry.content
}

function cancelEdit() {
  editingId.value = undefined
  editDraft.value = ''
}

function submitEdit(entry: AssistantEntry) {
  const text = editDraft.value.trim()
  if (!entry.id || !text) return
  emit('edit', entry.id, text)
  compareOpen.value = new Set()
  cancelEdit()
}

function focusInput() {
  document.getElementById(inputId)?.focus()
}
</script>
