import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as Input } from './Input.vue'

export const inputVariants = cva(
  'flex w-full transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring',
        field:
          'h-control rounded-full border border-outline bg-paper px-md text-small text-ink-body shadow-none placeholder:text-ink-placeholder focus-visible:ring-1 focus-visible:ring-primary',
        'field-lg':
          'h-control rounded-full border border-outline bg-paper px-lg text-small text-ink-body shadow-none placeholder:text-ink-placeholder focus-visible:ring-1 focus-visible:ring-primary'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

export type InputVariants = VariantProps<typeof inputVariants>
