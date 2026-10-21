<template>
  <Primitive
    data-slot="message-avatar"
    :as="as"
    :as-child="asChild"
    :class="
      cn(
        'min-w-lg group-has-data-[slot=message-footer]/message:-translate-y-2xl flex w-fit shrink-0 items-center justify-center self-end overflow-hidden rounded-full bg-surface',
        props.class
      )
    "
  >
    <slot />
  </Primitive>
</template>

<script lang="ts" setup>
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Primitive } from 'reka-ui'
import { cn } from '@/lib/utils'

interface Props extends PrimitiveProps {
  class?: HTMLAttributes['class']
}
const props = withDefaults(defineProps<Props>(), {
  as: 'div',
  class: undefined
})
</script>
