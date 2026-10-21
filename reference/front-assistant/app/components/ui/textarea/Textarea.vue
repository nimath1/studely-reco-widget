<template>
  <textarea
    :id="id"
    v-model="modelValue"
    data-slot="textarea"
    :class="
      cn(
        'w-full rounded-md border border-outline bg-paper px-md py-sm text-small text-ink-body placeholder:text-ink-placeholder focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
        props.class
      )
    "
  />
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'

const props = defineProps<{
  id?: string
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void
}>()

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue
})
</script>
