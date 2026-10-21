<template>
  <input :id="id" v-model="modelValue" :class="cn(inputVariants({ variant }), props.class)" />
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { useVModel } from '@vueuse/core'
import { cn } from '@/lib/utils'
import { inputVariants, type InputVariants } from '.'

const props = withDefaults(
  defineProps<{
    id: string
    defaultValue?: string | number
    modelValue?: string | number
    variant?: InputVariants['variant']
    class?: HTMLAttributes['class']
  }>(),
  {
    defaultValue: undefined,
    modelValue: undefined,
    variant: 'default',
    class: undefined
  }
)

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void
}>()

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue
})
</script>
