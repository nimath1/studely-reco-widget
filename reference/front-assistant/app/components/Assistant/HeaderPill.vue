<template>
  <!-- Version compacte du champ de la recherche assistée dans le header
       (§3-2) : un bouton qui ouvre le panneau — la saisie se fait dans la
       conversation, pas ici (aucun changement de contexte au focus,
       WCAG 3.2.1). -->
  <button
    v-if="visible"
    type="button"
    class="h-control-sm items-center gap-sm rounded-full border border-outline bg-paper pl-md pr-xs text-small text-ink-placeholder shadow-sm transition-colors hover:border-primary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
    @click="openAssistant"
  >
    <IconSparkle :size="16" class="shrink-0 text-accent" aria-hidden="true" />
    <span class="truncate">Décrivez votre besoin…</span>
    <span
      class="flex h-lg w-lg shrink-0 items-center justify-center rounded-full bg-primary text-paper"
      aria-hidden="true"
    >
      <IconSearch :size="14" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAssistantLauncher } from '~/composables/useAssistantLauncher'

// Pages intérieures uniquement : la Home porte déjà le champ dans son hero.
const route = useRoute()
const assistant = useAssistantLauncher()

const visible = computed(() => route.path !== '/')

function openAssistant() {
  assistant.open({ context: { source: 'header' } })
}
</script>
