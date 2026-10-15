<template>
  <div>
    <h3 class="font-sans text-small font-bold text-ink">Comparer les formations recommandées</h3>
    <p v-if="needSummary" class="mt-xs text-meta text-ink-muted">
      Les différences ci-dessous portent sur le besoin exprimé : {{ needSummary }}.
    </p>
    <div class="mt-md overflow-x-auto">
      <table class="w-full border-collapse text-left text-small">
        <caption class="sr-only">
          Comparaison des formations recommandées
        </caption>
        <thead>
          <tr class="border-b border-rule text-meta uppercase tracking-wide text-ink-subtle">
            <th scope="col" class="py-sm pr-md font-semibold">Formation</th>
            <th scope="col" class="py-sm pr-md font-semibold">Pourquoi la choisir</th>
            <th scope="col" class="py-sm pr-md font-semibold">Durée</th>
            <th scope="col" class="py-sm font-semibold">Modalité</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-rule">
          <tr v-for="rec in recommendations" :key="rec.slug">
            <td class="py-md pr-md align-top">
              <span
                v-if="rec.rank === 'primary'"
                class="block text-meta font-bold uppercase text-accent-text"
              >
                Principale
              </span>
              <NuxtLink
                v-if="rec.url"
                :to="rec.url"
                class="font-semibold text-ink transition-colors hover:text-accent-text"
                @click="$emit('select', rec, 'formation')"
              >
                {{ rec.title }}
              </NuxtLink>
              <span v-else class="font-semibold text-ink">{{ rec.title }}</span>
            </td>
            <td class="py-md pr-md align-top text-ink-muted">{{ rec.justification }}</td>
            <td class="py-md pr-md align-top text-ink-muted">{{ durationLabel(rec) }}</td>
            <td class="py-md align-top text-ink-muted">{{ modalityLabel(rec) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Actions : fiche principale prioritaire, accompagnement en repli -->
    <div class="mt-md flex flex-wrap items-center gap-md">
      <Button
        v-if="primaryRec?.url"
        as-child
        class="h-control rounded-full bg-accent px-md text-small font-semibold text-ink transition hover:bg-accent-text hover:text-paper"
      >
        <NuxtLink :to="primaryRec.url" @click="$emit('select', primaryRec, 'formation')">
          Voir la formation principale
        </NuxtLink>
      </Button>
      <NuxtLink
        v-if="advisorTo"
        :to="advisorTo"
        data-assistant-handoff
        data-advisor-escalation="compare"
        class="rounded-full border border-rule px-md py-sm text-small font-semibold text-ink transition-colors hover:border-primary hover:text-accent-text"
      >
        Être accompagné dans le choix
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { AssistantRecommendation } from '@learnup/types'
import type { AssistantSelectAction } from '~/composables/useAssistantAnalytics'
import { MODALITY_LABELS } from '~/utils/catalog-filters'

const props = withDefaults(
  defineProps<{
    recommendations: AssistantRecommendation[]
    /** Besoin utilisateur, rappelé en sous-titre (E10). */
    needSummary?: string
    /** Lien « parler à votre conseiller ». */
    advisorTo?: RouteLocationRaw
  }>(),
  { needSummary: '', advisorTo: undefined }
)

/** Fiche ouverte depuis le tableau (jalon analytics). */
defineEmits<{ select: [recommendation: AssistantRecommendation, action: AssistantSelectAction] }>()

const primaryRec = computed(
  () => props.recommendations.find((r) => r.rank === 'primary') ?? props.recommendations[0]
)

function durationLabel(rec: AssistantRecommendation): string {
  if (rec.durationDays) return `${rec.durationDays} jours`
  if (rec.durationHours) return `${rec.durationHours} h`
  return 'Sur demande'
}

function modalityLabel(rec: AssistantRecommendation): string {
  return rec.modalities.map((m) => MODALITY_LABELS[m] ?? m).join(' / ') || '—'
}
</script>
