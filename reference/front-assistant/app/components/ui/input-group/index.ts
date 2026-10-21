import type { VariantProps } from 'class-variance-authority'
import { cva } from 'class-variance-authority'

export { default as InputGroup } from './InputGroup.vue'
export { default as InputGroupAddon } from './InputGroupAddon.vue'
export { default as InputGroupButton } from './InputGroupButton.vue'
export { default as InputGroupInput } from './InputGroupInput.vue'
export { default as InputGroupText } from './InputGroupText.vue'
export { default as InputGroupTextarea } from './InputGroupTextarea.vue'

export const inputGroupAddonVariants = cva(
  "text-ink-muted flex h-auto cursor-text items-center justify-center gap-sm py-xs text-meta font-medium select-none [&>svg:not([class*='size-'])]:size-md [&>kbd]:rounded-sm group-data-[disabled=true]/input-group:opacity-50",
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-md has-[>button]:-ml-xs has-[>kbd]:-ml-xs',
        'inline-end': 'order-last pr-md has-[>button]:-mr-xs has-[>kbd]:-mr-xs',
        'block-start':
          'order-first w-full justify-start px-md pt-md [.border-b]:pb-md group-has-[>input]/input-group:pt-sm',
        'block-end':
          'order-last w-full justify-start px-md pb-md [.border-t]:pt-md group-has-[>input]/input-group:pb-sm'
      }
    },
    defaultVariants: {
      align: 'inline-start'
    }
  }
)

export type InputGroupVariants = VariantProps<typeof inputGroupAddonVariants>

export const inputGroupButtonVariants = cva('text-meta shadow-none flex gap-sm items-center', {
  variants: {
    size: {
      xs: "h-lg gap-xs px-sm rounded-sm [&>svg:not([class*='size-'])]:size-sm has-[>svg]:px-sm",
      sm: 'h-control-sm px-sm gap-sm rounded-md has-[>svg]:px-sm',
      'icon-xs': 'size-lg rounded-sm p-0 has-[>svg]:p-0',
      'icon-sm': 'size-control-sm p-0 has-[>svg]:p-0'
    }
  },
  defaultVariants: {
    size: 'xs'
  }
})

export type InputGroupButtonVariants = VariantProps<typeof inputGroupButtonVariants>
