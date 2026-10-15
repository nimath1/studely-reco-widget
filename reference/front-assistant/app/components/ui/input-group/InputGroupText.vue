<template>
  <span
    :class="
      cn(
        `text-ink-muted flex items-center gap-sm text-meta [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-md`,
        props.class
      )
    "
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>
