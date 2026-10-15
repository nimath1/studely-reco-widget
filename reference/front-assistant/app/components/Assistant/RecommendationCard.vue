<template>
  <article
    :class="[
      'rounded-md border p-lg',
      primary && !compact ? 'border-2 border-primary' : 'border-rule'
    ]"
  >
    <p
      class="text-meta font-bold uppercase tracking-wide"
      :class="primary && !compact ? 'text-accent-text' : 'text-ink-subtle'"
    >
      {{ primary && !compact ? 'Recommandation principale' : 'Alternative' }}
    </p>

    <h3 class="mt-xs font-sans font-bold text-ink" :class="primary ? 'text-h4' : 'text-body'">
      <NuxtLink
        v-if="recommendation.url"
        :to="recommendation.url"
        class="transition-colors hover:text-accent-text"
        @click="$emit('select', 'formation')"
      >
        {{ recommendation.title }}
      </NuxtLink>
      <template v-else>{{ recommendation.title }}</template>
    </h3>

    <p class="mt-sm text-small text-ink-body">
      {{
        !compact && !availability
          ? "Cette formation correspond à votre besoin, mais aucune session n'est actuellement programmée."
          : recommendation.justification
      }}
    </p>

    <!-- Variante compacte (alternatives, E4) : lien simple vers la fiche -->
    <NuxtLink
      v-if="compact && recommendation.url"
      :to="recommendation.url"
      class="mt-sm inline-block text-small font-semibold text-primary underline underline-offset-2 transition-colors hover:text-accent-text"
      @click="$emit('select', 'formation')"
    >
      Voir la formation
    </NuxtLink>

    <template v-if="!compact">
      <!-- Attributs factuels — référentiel uniquement -->
      <ul v-if="attributes.length" class="mt-md flex flex-wrap gap-sm">
        <li
          v-for="attr in attributes"
          :key="attr"
          class="rounded-full bg-surface px-md py-xs text-meta font-medium text-ink-muted"
        >
          {{ attr }}
        </li>
      </ul>

      <!-- Bloc disponibilité : seulement si une session existe (E5) -->
      <template v-if="availability">
        <div class="mt-md space-y-sm">
          <div
            v-if="availability.centreName"
            class="flex items-center justify-between gap-md rounded-md bg-surface px-md py-sm text-small"
          >
            <span class="flex items-center gap-sm text-ink">
              <IconMapPin :size="16" class="shrink-0 text-primary" aria-hidden="true" />
              {{ availability.centreName }}
            </span>
            <span v-if="availability.department" class="text-meta text-ink-subtle">
              {{ availability.department }}
            </span>
          </div>
          <div
            v-if="availability.startDate"
            class="flex items-center justify-between gap-md rounded-md bg-surface px-md py-sm text-small"
          >
            <span class="flex items-center gap-sm text-ink">
              <IconCalendar :size="16" class="shrink-0 text-primary" aria-hidden="true" />
              Prochaine session : {{ sessionDateLabel }}
            </span>
            <Badge v-if="seatsBadge" :variant="seatsBadge.variant">{{ seatsBadge.label }}</Badge>
          </div>
        </div>
      </template>

      <!-- Actions : CTA prioritaire selon qualification (§25), 1 ambre max -->
      <div class="mt-lg flex flex-wrap items-center gap-md">
        <template v-if="availability">
          <Button
            v-if="sessionsTo"
            as-child
            class="h-control rounded-full bg-accent px-md text-small font-semibold text-ink transition hover:bg-accent-text hover:text-paper"
          >
            <NuxtLink :to="sessionsTo" @click="$emit('select', 'sessions')">
              Voir les sessions
            </NuxtLink>
          </Button>
          <Button
            as-child
            variant="outline"
            class="h-control rounded-full border-outline px-md text-small font-semibold text-ink transition hover:border-primary hover:text-accent-text"
          >
            <NuxtLink :to="demandeTo" data-assistant-handoff @click="$emit('select', 'demande')">
              Demander cette formation
            </NuxtLink>
          </Button>
          <NuxtLink
            v-if="recommendation.url"
            :to="recommendation.url"
            class="text-small font-semibold text-primary underline underline-offset-2 transition-colors hover:text-accent-text"
            @click="$emit('select', 'formation')"
          >
            Voir la formation
          </NuxtLink>
        </template>
        <template v-else>
          <Button
            as-child
            class="h-control rounded-full bg-accent px-md text-small font-semibold text-ink transition hover:bg-accent-text hover:text-paper"
          >
            <NuxtLink :to="demandeTo" data-assistant-handoff @click="$emit('select', 'demande')">
              Demander une session
            </NuxtLink>
          </Button>
          <Button
            v-if="advisorTo"
            as-child
            variant="outline"
            class="h-control rounded-full border-outline px-md text-small font-semibold text-ink transition hover:border-primary hover:text-accent-text"
          >
            <NuxtLink :to="advisorTo" data-assistant-handoff data-advisor-escalation="no_session"
              >Être accompagné</NuxtLink
            >
          </Button>
        </template>
      </div>

      <!-- É6 — la fiche reste consultable malgré l'absence de session -->
      <p v-if="!availability" class="mt-md text-meta text-ink-muted">
        La page formation reste consultable : programme, objectifs, modalités.
        <NuxtLink
          v-if="recommendation.url"
          :to="recommendation.url"
          class="font-semibold text-primary underline underline-offset-2 transition-colors hover:text-accent-text"
          @click="$emit('select', 'formation')"
        >
          Voir la formation
        </NuxtLink>
      </p>
    </template>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { AssistantRecommendation } from '@learnup/types'
import type { AssistantSelectAction } from '~/composables/useAssistantAnalytics'
import { MODALITY_LABELS } from '~/utils/catalog-filters'
import { placesLabel, sessionSeatType } from '~/utils/placesLabel'

const props = withDefaults(
  defineProps<{
    recommendation: AssistantRecommendation
    /** Demande de formation pré-remplie (famille, session en query ; besoin hors URL). */
    demandeTo: RouteLocationRaw
    /** Alternative compacte (E4) : label + titre + justification + lien fiche. */
    compact?: boolean
    /** Lien « parler à votre conseiller » (variante sans session, É6). */
    advisorTo?: RouteLocationRaw
  }>(),
  { compact: false, advisorTo: undefined }
)

/** CTA cliqué : fiche formation, sessions ou demande (jalon analytics). */
defineEmits<{ select: [action: AssistantSelectAction] }>()

const primary = computed(() => props.recommendation.rank === 'primary')
const availability = computed(() => props.recommendation.availability)

const attributes = computed(() => {
  const rec = props.recommendation
  const attrs: string[] = []
  if (rec.durationDays) attrs.push(`${rec.durationDays} jours`)
  else if (rec.durationHours) attrs.push(`${rec.durationHours} h`)
  const modalities = rec.modalities.map((m) => MODALITY_LABELS[m] ?? m).join(' / ')
  if (modalities) attrs.push(modalities)
  if (rec.certification) attrs.push('Certifiante')
  return attrs
})

const sessionDateLabel = computed(() => {
  const start = availability.value?.startDate
  if (!start) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${start}T00:00:00Z`))
})

const seatsBadge = computed(() => {
  const seats = availability.value?.seatsRemaining
  if (seats == null) return null
  return { label: placesLabel(seats), variant: sessionSeatType(seats) ?? 'neutral' }
})

const sessionsTo = computed(() =>
  props.recommendation.url ? `${props.recommendation.url}#sessionsList` : null
)
</script>
