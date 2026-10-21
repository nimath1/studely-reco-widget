<template>
  <div class="rounded-md border border-rule bg-paper p-lg">
    <h2 class="flex items-center gap-sm font-sans text-h4 font-semibold text-ink">
      <IconSparkle :size="18" class="shrink-0 text-accent" aria-hidden="true" />
      {{ title }}
    </h2>
    <p class="mt-sm text-small text-ink-muted">{{ text }}</p>
    <Button
      variant="outline"
      class="mt-md h-control rounded-full border-outline px-lg text-small font-semibold text-ink transition hover:border-primary hover:text-accent-text"
      @click="$emit('open')"
    >
      {{ ctaLabel }}
    </Button>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    text?: string
    ctaLabel?: string
  }>(),
  {
    title: 'Vous hésitez entre plusieurs formations ?',
    text: 'Décrivez votre besoin : le moteur identifie les formations du catalogue correspondant à votre situation.',
    ctaLabel: 'Être guidé dans mon choix'
  }
)

defineEmits<{ open: [] }>()
</script>
